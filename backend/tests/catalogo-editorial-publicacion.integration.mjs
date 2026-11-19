// Ejecutar exclusivamente contra el contenedor temporal catalogo_editorial_test.
// El runner que lo invoca debe publicar el puerto del contenedor como loopback.
import assert from 'node:assert/strict';
import pg from 'pg';
import { PgCatalogoEditorialRepository } from '../src/infrastructure/persistence/postgres/PgCatalogoEditorialRepository.js';
import { AutorizacionEditorial } from '../src/domain/Editorial.js';

const port = Number(process.argv[2]);
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error('Indique el puerto loopback del PostgreSQL temporal');
}
const pool = new pg.Pool({ host: '127.0.0.1', port, database: 'catalogo_editorial_test', user: 'postgres', max: 4 });
const db = {
  query: (sql, params) => pool.query(sql, params),
  async transaccion(trabajo) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const resultado = await trabajo(client);
      await client.query('COMMIT');
      return resultado;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },
};

try {
  const identity = await pool.query('SELECT current_database() AS db');
  assert.equal(identity.rows[0].db, 'catalogo_editorial_test', 'el runner debe usar la DB temporal');
  const diagnostic = await pool.query(`SELECT ae.id_autorizacion,ae.id_usuario,ae.capacidad,ae.estado,
      ae.vigente_desde,ae.vigente_hasta,u.activo,al.tipo_contenido,al.id_catalogo,al.enfermedad,al.poblacion
    FROM public.autorizacion_editorial ae JOIN public.usuario u USING(id_usuario)
    JOIN public.alcance_editorial al USING(id_autorizacion) WHERE ae.id_usuario=5`);
  assert.equal(diagnostic.rowCount, 1, 'fixture debe incluir una concesión de publicador con alcance');
  assert.equal(diagnostic.rows[0].tipo_contenido, 'catalogo_medicion');
  assert.equal(Number(diagnostic.rows[0].id_catalogo), 100);
  const auth = await pool.query(`SELECT ae.id_autorizacion, ae.vigente_desde AS "vigenteDesde", now() AS ahora,
      ae.vigente_hasta AS "vigenteHasta", ae.id_usuario AS "idUsuario", ae.capacidad, ae.estado,
      u.activo AS usuario_activo, u.rol FROM public.autorizacion_editorial ae
    JOIN public.usuario u ON u.id_usuario=ae.id_usuario
    WHERE ae.id_usuario=$1 AND ae.capacidad=$2 AND ae.estado='activa'
      AND ae.vigente_desde<=now() AND (ae.vigente_hasta IS NULL OR ae.vigente_hasta>now()) AND u.activo`, [5,'publicador']);
  const scopes = await pool.query('SELECT tipo_contenido AS "tipoContenido",id_catalogo AS "idCatalogo",enfermedad,poblacion FROM public.alcance_editorial WHERE id_autorizacion=$1',[auth.rows[0]?.id_autorizacion]);
  const grant = new AutorizacionEditorial({...auth.rows[0],alcances:scopes.rows});
  assert.equal(grant.permite({usuarioActivo:auth.rows[0]?.usuario_activo,capacidad:'publicador',tipoContenido:'catalogo_medicion',idCatalogo:100,enfermedad:'diabetes_tipo_1',poblacion:'adulto_18_mas',ahora:auth.rows[0]?.ahora}),true,'fixture cubre el alcance de publicación');
  const repo = new PgCatalogoEditorialRepository(db);

  const publicados = await Promise.all([
    repo.publicarVersion({ actorId: 5, idVersion: 1001 }),
    repo.publicarVersion({ actorId: 5, idVersion: 1002 }),
  ]);
  assert.deepEqual(publicados.map((x) => x.estado), ['vigente', 'vigente']);
  let estados = await pool.query("SELECT id_version,estado FROM public.version_catalogo WHERE id_version IN (1001,1002) ORDER BY id_version");
  assert.equal(estados.rows.filter((x) => x.estado === 'vigente').length, 1, 'solo una versión debe quedar vigente');
  assert.equal(estados.rows.filter((x) => x.estado === 'sustituida').length, 1, 'la publicación concurrente debe sustituir la anterior');
  console.log('PASS: publicaciones concurrentes serializadas por catálogo; una única versión vigente');

  await pool.query(`CREATE FUNCTION public.fallar_auditoria_publicacion_test() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.accion='publicar' THEN RAISE EXCEPTION 'fallo inducido de integración'; END IF; RETURN NEW; END; $$`);
  await pool.query(`CREATE TRIGGER trg_test_fallar_auditoria_publicacion BEFORE INSERT ON public.catalogo_auditoria
    FOR EACH ROW EXECUTE FUNCTION public.fallar_auditoria_publicacion_test()`);
  await assert.rejects(() => repo.publicarVersion({ actorId: 5, idVersion: 1003 }), /fallo inducido de integración/);
  estados = await pool.query("SELECT id_version,estado FROM public.version_catalogo WHERE id_version IN (1002,1003) ORDER BY id_version");
  assert.deepEqual(estados.rows.map((x) => x.estado), ['vigente', 'aprobada'], 'el error de auditoría debe revertir todas las mutaciones');
  const auditorias = await pool.query("SELECT count(*)::int AS n FROM public.catalogo_auditoria WHERE accion='publicar'");
  assert.equal(auditorias.rows[0].n, 2, 'no debe persistirse auditoría parcial');
  console.log('PASS: fallo al guardar auditoría revierte estado vigente, sustitución y auditoría parcial');
} finally {
  await pool.end();
}
