import { MedicionRepository } from '../../../application/ports/MedicionRepository.js';
import { Medicion } from '../../../domain/Medicion.js';
import { NoEncontrado } from '../../../domain/errors.js';

const num = (v) => (v == null ? null : Number(v));
const aMedicion = (r) => new Medicion({
  id: r.id_medicion, idPaciente: r.id_paciente, tipo: r.tipo,
  glucosaMgDl: num(r.glucosa_mg_dl), sistolicaMmhg: num(r.sistolica_mmhg),
  diastolicaMmhg: num(r.diastolica_mmhg), hba1cPercent: num(r.hba1c_percent), contexto: r.contexto,
  fechaHora: r.fecha_hora, observaciones: r.observaciones,
});

export class PgMedicionRepository extends MedicionRepository {
  constructor(db) { super(); this.db = db; }

  async guardar(m) {
    const { rows } = await this.db.query(
      `INSERT INTO medicion
         (id_paciente, tipo, glucosa_mg_dl, sistolica_mmhg, diastolica_mmhg, hba1c_percent, contexto, fecha_hora, observaciones)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [m.idPaciente, m.tipo, m.glucosaMgDl, m.sistolicaMmhg, m.diastolicaMmhg, m.hba1cPercent,
        m.contexto, m.fechaHora, m.observaciones],
    );
    return aMedicion(rows[0]);
  }

  async guardarConAlertaYEvento(m, evaluadorDeAlertas, evento, { usuarioActorId = null } = {}) {
    return this.db.transaccion(async (client) => {
      if (usuarioActorId) {
        const paciente = await client.query('SELECT id_usuario FROM paciente WHERE id_paciente=$1', [m.idPaciente]);
        if (!paciente.rows[0] || Number(paciente.rows[0].id_usuario) !== Number(usuarioActorId)) throw new NoEncontrado('Paciente no encontrado');
        const { rows: users } = await client.query('SELECT id_usuario, rol, activo FROM usuario WHERE id_usuario=$1 FOR UPDATE', [usuarioActorId]);
        if (!users[0]?.activo || users[0].rol !== 'paciente') throw new NoEncontrado('Paciente no encontrado');
        await client.query('SELECT id_paciente FROM paciente WHERE id_paciente=$1 FOR UPDATE', [m.idPaciente]);
        await client.query("SELECT set_config('app.usuario_actor',$1,true)", [String(usuarioActorId)]);
      }
      const { rows } = await client.query(
        `INSERT INTO medicion
           (id_paciente, tipo, glucosa_mg_dl, sistolica_mmhg, diastolica_mmhg, hba1c_percent, contexto, fecha_hora, observaciones)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [m.idPaciente, m.tipo, m.glucosaMgDl, m.sistolicaMmhg, m.diastolicaMmhg,
          m.hba1cPercent,m.contexto,m.fechaHora,m.observaciones]);
      const medicion = aMedicion(rows[0]);
      const evaluacion = evaluadorDeAlertas ? await evaluadorDeAlertas.evaluar(medicion, client) : { alertas: [], evaluaciones: [] };
      const resultados = Array.isArray(evaluacion) ? evaluacion : (evaluacion.alertas ?? []);
      await client.query(`INSERT INTO public.evaluacion_medicion
        (id_medicion,actor_id_usuario,mecanismo,resultado,version_evaluador)
        VALUES ($1,$2,'tecnica','valida','medicion-v1')`, [medicion.id, usuarioActorId]);
      for (const item of (evaluacion.evaluaciones ?? [])) {
        await client.query(`INSERT INTO public.evaluacion_medicion
          (id_medicion,actor_id_usuario,mecanismo,resultado,codigo_criterio,version_criterio,condicion_aplicada,version_evaluador)
          VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,'evaluador-v1')`,
        [medicion.id, usuarioActorId, item.mecanismo, item.resultado, item.codigoCriterio, item.versionCriterio,
          item.condicionAplicada == null ? null : JSON.stringify(item.condicionAplicada)]);
      }
      const alertas = [];
      for (const resultadoAlerta of resultados) {
        const restriccionDeduplicacion = resultadoAlerta.clasificacion === 'seguridad'
          ? "ON CONFLICT (id_medicion,codigo_criterio) WHERE clasificacion='seguridad' DO NOTHING"
          : 'ON CONFLICT (id_medicion,id_objetivo) WHERE id_medicion IS NOT NULL AND id_objetivo IS NOT NULL DO NOTHING';
        const q = await client.query(
          `INSERT INTO alerta (id_paciente,id_medicion,tipo,motivo,id_objetivo,clasificacion,indicacion_paciente,
             id_version_criterio,codigo_criterio,version_criterio,condicion_aplicada)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)
           ${restriccionDeduplicacion}
           RETURNING id_alerta, id_paciente, id_medicion, tipo, motivo, estado, fecha_generacion,
                     id_objetivo, clasificacion, indicacion_paciente,id_version_criterio,codigo_criterio,version_criterio,condicion_aplicada`,
          [medicion.idPaciente, medicion.id, resultadoAlerta.tipo, resultadoAlerta.motivo,
            resultadoAlerta.idObjetivo ?? null, resultadoAlerta.clasificacion ?? null, resultadoAlerta.indicacionPaciente ?? null,
            resultadoAlerta.idVersionCriterio ?? null, resultadoAlerta.codigoCriterio ?? null, resultadoAlerta.versionCriterio ?? null,
            resultadoAlerta.condicionAplicada == null ? null : JSON.stringify(resultadoAlerta.condicionAplicada)]);
        if (q.rows[0]) alertas.push(this.aAlerta(q.rows[0]));
      }
      if (evento && alertas.length) {
        await client.query(
          `INSERT INTO outbox_evento (event_id, tipo, agregado_tipo, agregado_id, payload)
           VALUES ($1, $2, $3, $4, $5::jsonb)`,
          [evento.eventId, evento.tipo, evento.agregado.tipo, evento.agregado.id, JSON.stringify(evento.datos)]);
      }
      return { medicion, alerta: alertas[0] ?? null, alertas };
    });
  }

  aAlerta(r) { return { id: r.id_alerta, idPaciente: r.id_paciente, idMedicion: r.id_medicion,
    tipo: r.tipo, motivo: r.motivo, estado: r.estado, fechaGeneracion: r.fecha_generacion,
    idObjetivo: r.id_objetivo == null ? null : Number(r.id_objetivo), clasificacion: r.clasificacion,
    indicacionPaciente: r.indicacion_paciente, idVersionCriterio: r.id_version_criterio,
    codigoCriterio: r.codigo_criterio, versionCriterio: r.version_criterio, condicionAplicada: r.condicion_aplicada }; }

  async registrarRechazoTecnico({ idPaciente, idUsuario, codigo }) {
    await this.db.query(`INSERT INTO public.intento_medicion_rechazado(id_paciente,id_usuario,codigo_rechazo)
      VALUES($1,$2,$3)`, [idPaciente, idUsuario, String(codigo).slice(0, 40)]);
  }

  async listarPorPaciente(idPaciente, { tipo, desde, hasta, usuarioId, rol } = {}) {
    const condiciones = ['m.id_paciente = $1'];
    const params = [idPaciente];
    if (tipo) { params.push(tipo); condiciones.push(`m.tipo = $${params.length}`); }
    if (desde) { params.push(desde); condiciones.push(`m.fecha_hora >= $${params.length}`); }
    if (hasta) { params.push(hasta); condiciones.push(`m.fecha_hora <= $${params.length}`); }
    if (usuarioId && rol) {
      params.push(usuarioId); const actor = `$${params.length}`;
      params.push(rol); const roleParam = `$${params.length}`;
      const assignment = rol === 'medico'
        ? `EXISTS (SELECT 1 FROM medico_paciente a WHERE a.id_paciente=m.id_paciente AND a.id_medico=${actor} AND a.activo)`
        : rol === 'seguimiento'
          ? `EXISTS (SELECT 1 FROM seguimiento_paciente a WHERE a.id_paciente=m.id_paciente AND a.id_seguimiento=${actor} AND a.activo)`
          : `p.id_usuario=${actor}`;
      condiciones.push(`EXISTS (SELECT 1 FROM paciente p JOIN usuario up ON up.id_usuario=p.id_usuario
        JOIN usuario ua ON ua.id_usuario=${actor}
        WHERE p.id_paciente=m.id_paciente AND up.activo AND up.rol='paciente'
          AND ua.activo AND ua.rol=${roleParam} AND ${assignment})`);
    }
    const { rows } = await this.db.query(
      `SELECT m.* FROM medicion m WHERE ${condiciones.join(' AND ')} ORDER BY m.fecha_hora DESC`,
      params,
    );
    return rows.map(aMedicion);
  }
}
