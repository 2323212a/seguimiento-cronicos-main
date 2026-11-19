import { ObjetivoMedicionRepository } from '../../../application/ports/ObjetivoMedicionRepository.js';
import { Conflicto, NoAutorizado, NoEncontrado } from '../../../domain/errors.js';

const mapear = (r) => ({
  id: Number(r.id_objetivo), idPaciente: Number(r.id_paciente), idMedico: Number(r.id_medico),
  tipoMedicion: r.tipo_medicion, contexto: r.contexto,
  glucosaMin: r.glucosa_min == null ? null : Number(r.glucosa_min),
  glucosaMax: r.glucosa_max == null ? null : Number(r.glucosa_max),
  sistolicaMin: r.sistolica_min, sistolicaMax: r.sistolica_max,
  diastolicaMin: r.diastolica_min, diastolicaMax: r.diastolica_max,
  indicacionPaciente: r.indicacion_paciente, vigenteDesde: r.vigente_desde,
  vigenteHasta: r.vigente_hasta, estado: r.estado, creadoEn: r.creado_en, cerradoEn: r.cerrado_en,
});

export class PgObjetivoMedicionRepository extends ObjetivoMedicionRepository {
  constructor(db) { super(); this.db = db; }

  async crear(objetivo) {
    try {
      return await this.db.transaccion(async (client) => {
        const paciente = await client.query(`SELECT p.id_paciente FROM public.paciente p
          JOIN public.usuario u ON u.id_usuario=p.id_usuario
          WHERE p.id_paciente=$1 AND u.activo AND u.rol='paciente' FOR UPDATE OF p`, [objetivo.idPaciente]);
        if (!paciente.rows[0]) throw new NoEncontrado('Paciente no encontrado');
        const medico = await client.query(`SELECT 1 FROM public.usuario u
          JOIN public.medico_paciente mp ON mp.id_medico=u.id_usuario
          WHERE u.id_usuario=$1 AND u.rol='medico' AND u.activo
            AND mp.id_paciente=$2 AND mp.activo`, [objetivo.idMedico, objetivo.idPaciente]);
        if (!medico.rowCount) throw new NoAutorizado('Solo el médico activo asignado puede registrar objetivos');

        await client.query(`UPDATE public.objetivo_medicion
          SET estado='sustituido', vigente_hasta=GREATEST(vigente_desde,$4::date - 1), cerrado_en=now()
          WHERE id_paciente=$1 AND tipo_medicion=$2 AND contexto IS NOT DISTINCT FROM $3 AND estado='vigente'`,
        [objetivo.idPaciente, objetivo.tipoMedicion, objetivo.contexto, objetivo.vigenteDesde]);
        const { rows } = await client.query(`INSERT INTO public.objetivo_medicion
          (id_paciente,id_medico,tipo_medicion,contexto,glucosa_min,glucosa_max,
           sistolica_min,sistolica_max,diastolica_min,diastolica_max,indicacion_paciente,vigente_desde)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
        [objetivo.idPaciente,objetivo.idMedico,objetivo.tipoMedicion,objetivo.contexto,
          objetivo.glucosaMin,objetivo.glucosaMax,objetivo.sistolicaMin,objetivo.sistolicaMax,
          objetivo.diastolicaMin,objetivo.diastolicaMax,objetivo.indicacionPaciente,objetivo.vigenteDesde]);
        return mapear(rows[0]);
      });
    } catch (error) {
      if (error.code === '23505') throw new Conflicto('Ya existe un objetivo vigente para ese tipo y contexto');
      throw error;
    }
  }

  async listarParaPaciente(idPaciente, { actorId, rol }) {
    const { rows } = await this.db.query(`SELECT o.* FROM public.objetivo_medicion o
      JOIN public.paciente p ON p.id_paciente=o.id_paciente
      JOIN public.usuario up ON up.id_usuario=p.id_usuario
      JOIN public.usuario actor ON actor.id_usuario=$2
      WHERE o.id_paciente=$1 AND up.activo AND up.rol='paciente' AND actor.activo AND actor.rol=$3
        AND (($3='paciente' AND p.id_usuario=$2) OR
          ($3='medico' AND EXISTS (SELECT 1 FROM public.medico_paciente mp
            WHERE mp.id_paciente=o.id_paciente AND mp.id_medico=$2 AND mp.activo)))
      ORDER BY o.vigente_desde DESC,o.creado_en DESC`, [idPaciente, actorId, rol]);
    return rows.map(mapear);
  }

  async listarAplicable(client, medicion) {
    const { rows } = await client.query(`SELECT o.* FROM public.objetivo_medicion o
      JOIN public.usuario medico ON medico.id_usuario=o.id_medico
      JOIN public.paciente p ON p.id_paciente=o.id_paciente
      JOIN public.usuario paciente ON paciente.id_usuario=p.id_usuario
      WHERE o.id_paciente=$1 AND o.tipo_medicion=$2 AND o.estado='vigente'
        AND o.vigente_desde <= $3::date AND (o.vigente_hasta IS NULL OR o.vigente_hasta >= $3::date)
        AND (o.contexto IS NULL OR o.contexto IS NOT DISTINCT FROM $4)
        AND medico.activo AND medico.rol='medico' AND paciente.activo AND paciente.rol='paciente'
        AND EXISTS (SELECT 1 FROM public.medico_paciente mp WHERE mp.id_paciente=o.id_paciente
          AND mp.id_medico=o.id_medico AND mp.activo)
      ORDER BY (o.contexto IS NOT NULL) DESC,o.vigente_desde DESC,o.id_objetivo DESC
      LIMIT 1`, [medicion.idPaciente, medicion.tipo, medicion.fechaHora, medicion.contexto]);
    return rows[0] ?? null;
  }
}
