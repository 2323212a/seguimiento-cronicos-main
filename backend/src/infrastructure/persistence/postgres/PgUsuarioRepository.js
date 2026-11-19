import { Conflicto, NoAutorizado, NoEncontrado } from '../../../domain/errors.js';

const cuenta = (r) => ({ id: r.id_usuario, correo: r.correo, rol: r.rol, activo: r.activo,
  idPaciente: r.id_paciente ?? null, nombre: r.nombre ?? null });

export class PgUsuarioRepository {
  constructor(db) { this.db = db; }

  async buscarCredenciales(correo) {
    const { rows } = await this.db.query(
      `SELECT u.id_usuario, u.correo, u.contrasena_hash, u.rol, u.activo,
              p.id_paciente, p.nombre
         FROM usuario u LEFT JOIN paciente p ON p.id_usuario = u.id_usuario
        WHERE lower(u.correo) = $1`, [correo]);
    if (!rows[0]) return null;
    return { ...cuenta(rows[0]), contrasenaHash: rows[0].contrasena_hash };
  }

  async buscarActual(id) {
    const { rows } = await this.db.query(
      `SELECT u.id_usuario, u.correo, u.rol, u.activo, p.id_paciente, p.nombre
         FROM usuario u LEFT JOIN paciente p ON p.id_usuario = u.id_usuario
        WHERE u.id_usuario = $1`, [id]);
    return rows[0] ? cuenta(rows[0]) : null;
  }

  async listarCuentas({ rol, activo } = {}) {
    const filtros = []; const params = [];
    if (rol) { params.push(rol); filtros.push(`u.rol = $${params.length}`); }
    if (activo !== undefined) { params.push(activo); filtros.push(`u.activo = $${params.length}`); }
    const { rows } = await this.db.query(
      `SELECT u.id_usuario, u.correo, u.rol, u.activo, u.fecha_creacion, p.id_paciente
         FROM usuario u LEFT JOIN paciente p ON p.id_usuario = u.id_usuario
        ${filtros.length ? `WHERE ${filtros.join(' AND ')}` : ''}
        ORDER BY u.id_usuario`, params);
    return rows.map((r) => ({ ...cuenta(r), fechaCreacion: r.fecha_creacion }));
  }

  async crearCuenta({ actorId, correo, contrasenaHash, rol, activo = false }) {
    try {
      return await this.db.transaccion(async (client) => {
        const actor = await client.query('SELECT rol, activo FROM usuario WHERE id_usuario=$1 FOR UPDATE', [actorId]);
        if (!actor.rows[0]?.activo || actor.rows[0].rol !== 'administrador') throw new NoAutorizado('Se requiere administrador activo');
        const { rows } = await client.query(
          `INSERT INTO usuario (correo, contrasena_hash, rol, activo)
           VALUES ($1, $2, $3, $4) RETURNING id_usuario, correo, rol, activo`,
          [correo, contrasenaHash, rol, activo]);
        return cuenta(rows[0]);
      });
    } catch (error) {
      if (error.code === '23505') throw new Conflicto('Ya existe una cuenta con ese correo');
      throw error;
    }
  }

  async bootstrapPrimerAdministrador({ correo, contrasenaHash }) {
    return this.db.transaccion(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext('seguimiento-cronicos-bootstrap-admin')::bigint)");
      const existente = await client.query("SELECT 1 FROM usuario WHERE rol = 'administrador' AND activo LIMIT 1");
      if (existente.rowCount) throw new Conflicto('Ya existe un administrador activo; bootstrap cancelado');
      const { rows } = await client.query(
        `INSERT INTO usuario (correo, contrasena_hash, rol, activo)
         VALUES ($1, $2, 'administrador', TRUE)
         RETURNING id_usuario, correo, rol, activo`, [correo, contrasenaHash]);
      return cuenta(rows[0]);
    });
  }

  async cambiarEstado({ actorId, objetivoId, activo }) {
    return this.db.transaccion(async (client) => {
      if (Number(actorId) === Number(objetivoId) && !activo) throw new Conflicto('No puedes desactivar tu propia cuenta');
      const usuarios = await client.query(
        `SELECT id_usuario, rol, activo FROM usuario
          WHERE id_usuario = ANY($1::int[]) ORDER BY id_usuario FOR UPDATE`,
        [[Number(actorId), Number(objetivoId)]]);
      const actor = usuarios.rows.find((u) => Number(u.id_usuario) === Number(actorId));
      const target = usuarios.rows.find((u) => Number(u.id_usuario) === Number(objetivoId));
      if (!actor?.activo || actor.rol !== 'administrador') throw new NoAutorizado('Se requiere una cuenta administradora activa');
      if (!target) throw new NoEncontrado('Cuenta no encontrada');
      if (target.rol === 'administrador' && !activo && Number(actorId) === Number(objetivoId)) {
        throw new Conflicto('No puedes desactivar tu propia cuenta administrativa');
      }
      if (target.rol === 'administrador' && !activo) {
        const admins = await client.query("SELECT COUNT(*)::int AS total FROM usuario WHERE rol='administrador' AND activo");
        if (admins.rows[0].total <= 1) throw new Conflicto('Debe permanecer al menos un administrador activo');
      }

      let pacientes = [];
      if (target.rol === 'medico') {
        const q = await client.query('SELECT id_paciente FROM medico_paciente WHERE id_medico = $1 AND activo ORDER BY id_paciente', [objetivoId]);
        pacientes = q.rows.map((r) => Number(r.id_paciente));
      } else if (target.rol === 'seguimiento') {
        const q = await client.query('SELECT id_paciente FROM seguimiento_paciente WHERE id_seguimiento = $1 AND activo ORDER BY id_paciente', [objetivoId]);
        pacientes = q.rows.map((r) => Number(r.id_paciente));
      } else if (target.rol === 'paciente') {
        const q = await client.query('SELECT id_paciente FROM paciente WHERE id_usuario = $1', [objetivoId]);
        pacientes = q.rows.map((r) => Number(r.id_paciente));
      }
      if (pacientes.length) await client.query('SELECT id_paciente FROM paciente WHERE id_paciente = ANY($1::int[]) ORDER BY id_paciente FOR UPDATE', [pacientes]);

      if (!activo) {
        if (target.rol === 'medico') await client.query('UPDATE medico_paciente SET activo = FALSE WHERE id_medico = $1 AND activo', [objetivoId]);
        if (target.rol === 'seguimiento') await client.query('UPDATE seguimiento_paciente SET activo = FALSE WHERE id_seguimiento = $1 AND activo', [objetivoId]);
        if (target.rol === 'paciente') {
          await client.query('UPDATE medico_paciente mp SET activo = FALSE FROM paciente p WHERE p.id_paciente = mp.id_paciente AND p.id_usuario = $1 AND mp.activo', [objetivoId]);
          await client.query('UPDATE seguimiento_paciente sp SET activo = FALSE FROM paciente p WHERE p.id_paciente = sp.id_paciente AND p.id_usuario = $1 AND sp.activo', [objetivoId]);
        }
      }
      const { rows } = await client.query('UPDATE usuario SET activo = $2 WHERE id_usuario = $1 RETURNING id_usuario, correo, rol, activo', [objetivoId, activo]);
      return cuenta(rows[0]);
    });
  }

  async cambiarRol({ actorId, objetivoId, rol }) {
    return this.db.transaccion(async (client) => {
      if (Number(actorId) === Number(objetivoId)) throw new Conflicto('No puedes cambiar tu propio rol');
      const usuarios = await client.query(
        `SELECT id_usuario, rol, activo FROM usuario
          WHERE id_usuario = ANY($1::int[]) ORDER BY id_usuario FOR UPDATE`,
        [[Number(actorId), Number(objetivoId)]]);
      const actor = usuarios.rows.find((u) => Number(u.id_usuario) === Number(actorId));
      const target = usuarios.rows.find((u) => Number(u.id_usuario) === Number(objetivoId));
      if (!actor?.activo || actor.rol !== 'administrador') throw new NoAutorizado('Se requiere una cuenta administradora activa');
      if (!target) throw new NoEncontrado('Cuenta no encontrada');
      if (target.rol === 'paciente' || rol === 'paciente') throw new Conflicto('El rol paciente no se convierte; conserva su cuenta clínica y crea una cuenta separada');
      if (target.rol === 'administrador' && !target.activo) throw new Conflicto('No se puede cambiar el rol de una cuenta administrativa inactiva');
      const q = target.rol === 'medico'
        ? await client.query('SELECT id_paciente FROM medico_paciente WHERE id_medico = $1 AND activo ORDER BY id_paciente', [objetivoId])
        : target.rol === 'seguimiento'
          ? await client.query('SELECT id_paciente FROM seguimiento_paciente WHERE id_seguimiento = $1 AND activo ORDER BY id_paciente', [objetivoId])
          : { rows: [] };
      const ids = q.rows.map((r) => Number(r.id_paciente));
      if (ids.length) await client.query('SELECT id_paciente FROM paciente WHERE id_paciente = ANY($1::int[]) ORDER BY id_paciente FOR UPDATE', [ids]);
      if (target.rol === 'medico') await client.query('UPDATE medico_paciente SET activo = FALSE WHERE id_medico = $1 AND activo', [objetivoId]);
      if (target.rol === 'seguimiento') await client.query('UPDATE seguimiento_paciente SET activo = FALSE WHERE id_seguimiento = $1 AND activo', [objetivoId]);
      const { rows } = await client.query('UPDATE usuario SET rol = $2 WHERE id_usuario = $1 RETURNING id_usuario, correo, rol, activo', [objetivoId, rol]);
      return cuenta(rows[0]);
    });
  }
}
