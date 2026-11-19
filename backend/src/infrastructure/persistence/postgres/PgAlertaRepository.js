import { AlertaRepository } from '../../../application/ports/AlertaRepository.js';
import { ErrorDeDominio, NoEncontrado } from '../../../domain/errors.js';

export class PgAlertaRepository extends AlertaRepository {
  constructor(db) { super(); this.db = db; }

  async tienePendientes(idPaciente) {
    const { rows } = await this.db.query(
      `SELECT EXISTS (SELECT 1 FROM alerta WHERE id_paciente=$1 AND estado IN ('generada','notificada')) AS existe`,
      [idPaciente]);
    return rows[0]?.existe === true;
  }

  async guardar({ idPaciente, idMedicion, tipo, motivo }) {
    const { rows } = await this.db.query(
      `INSERT INTO alerta (id_paciente, id_medicion, tipo, motivo)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [idPaciente, idMedicion, tipo, motivo],
    );
    const r = rows[0];
    return {
      id: r.id_alerta, idPaciente: r.id_paciente, idMedicion: r.id_medicion,
      tipo: r.tipo, motivo: r.motivo, estado: r.estado, fechaGeneracion: r.fecha_generacion,
    };
  }

  async listarPorPaciente(idPaciente, { usuarioId, rol } = {}) {
    const params = [idPaciente]; let acceso = '';
    if (usuarioId && rol) {
      params.push(usuarioId); const actor = `$${params.length}`;
      params.push(rol); const roleParam = `$${params.length}`;
      const assignment = rol === 'medico'
        ? `EXISTS (SELECT 1 FROM medico_paciente a WHERE a.id_paciente=al.id_paciente AND a.id_medico=${actor} AND a.activo)`
        : rol === 'seguimiento'
          ? `EXISTS (SELECT 1 FROM seguimiento_paciente a WHERE a.id_paciente=al.id_paciente AND a.id_seguimiento=${actor} AND a.activo)`
          : `p.id_usuario=${actor}`;
      acceso = ` AND EXISTS (SELECT 1 FROM paciente p JOIN usuario up ON up.id_usuario=p.id_usuario
        JOIN usuario ua ON ua.id_usuario=${actor} WHERE p.id_paciente=al.id_paciente AND up.activo
        AND up.rol='paciente' AND ua.activo AND ua.rol=${roleParam} AND ${assignment})`;
    }
    const { rows } = await this.db.query(
      `SELECT al.id_alerta, al.id_paciente, al.id_medicion, al.tipo, al.motivo, al.estado, al.fecha_generacion,
              al.id_objetivo, al.clasificacion, al.indicacion_paciente, al.id_version_criterio,
              al.codigo_criterio, al.version_criterio, al.condicion_aplicada,
              m.tipo AS medicion_tipo, m.glucosa_mg_dl, m.sistolica_mmhg, m.diastolica_mmhg, m.hba1c_percent, m.contexto,
              o.glucosa_min, o.glucosa_max, o.sistolica_min, o.sistolica_max, o.diastolica_min, o.diastolica_max,
              c.codigo AS criterio_codigo, vc.numero_version AS criterio_version,
              f.institucion AS fuente_institucion, vf.titulo_snapshot AS fuente_titulo, vf.url_snapshot AS fuente_url
         FROM alerta al LEFT JOIN medicion m ON m.id_medicion=al.id_medicion
         LEFT JOIN objetivo_medicion o ON o.id_objetivo=al.id_objetivo
         LEFT JOIN version_criterio_seguridad vc ON vc.id_version_criterio=al.id_version_criterio
         LEFT JOIN criterio_seguridad c ON c.id_criterio=vc.id_criterio
         LEFT JOIN version_fuente vf ON vf.id_version_fuente=vc.id_version_fuente
         LEFT JOIN fuente_clinica f ON f.id_fuente=vf.id_fuente
        WHERE al.id_paciente = $1${acceso} ORDER BY al.fecha_generacion DESC`, params);
    return rows.map((r) => {
      const condicionAplicada = typeof r.condicion_aplicada === 'string'
        ? JSON.parse(r.condicion_aplicada) : r.condicion_aplicada;
      return ({ id: r.id_alerta, idPaciente: r.id_paciente, idMedicion: r.id_medicion,
      tipo: rol === 'seguimiento' ? 'actualizacion_disponible' : r.tipo,
      motivo: rol === 'seguimiento' ? 'Hay una actualización que requiere seguimiento; consulta al médico asignado.' : r.motivo,
      estado: r.estado, fechaGeneracion: r.fecha_generacion,
      ...(rol === 'seguimiento' ? {} : {
        idObjetivo: r.id_objetivo, clasificacion: r.clasificacion, indicacionPaciente: r.indicacion_paciente,
        idVersionCriterio: r.id_version_criterio, codigoCriterio: r.codigo_criterio,
        versionCriterio: r.version_criterio, condicionAplicada,
        padecimientoPosible: condicionAplicada?.padecimientoPosible ?? null,
        criterioActivado: r.clasificacion === 'seguridad' ? `${r.criterio_codigo} · ${r.criterio_version}` : criterioObjetivo(r),
        fuente: r.fuente_titulo ? { institucion: r.fuente_institucion, titulo: r.fuente_titulo, url: r.fuente_url } : null,
        medicion: r.medicion_tipo === 'glucosa' ? { tipo: 'glucosa', valor: Number(r.glucosa_mg_dl), unidad: 'mg/dL', contexto: r.contexto }
          : r.medicion_tipo === 'presion_arterial' ? { tipo: 'presion_arterial', sistolica: Number(r.sistolica_mmhg), diastolica: Number(r.diastolica_mmhg), unidad: 'mmHg', contexto: r.contexto }
            : r.medicion_tipo === 'hba1c' ? { tipo: 'hba1c', valor: Number(r.hba1c_percent), unidad: '%', contexto: r.contexto } : null,
      }) });
    });
  }

  async cambiarEstado(idAlerta, estado, idPaciente = null, usuarioId = null) {
    if (!['generada', 'notificada', 'atendida'].includes(estado)) throw new ErrorDeDominio('Estado de alerta no válido');
    const parametros = idPaciente === null ? [idAlerta, estado] : [idAlerta, estado, idPaciente, usuarioId];
    const filtro = idPaciente === null ? '' : ` AND id_paciente = $3 AND EXISTS (
      SELECT 1 FROM medico_paciente a JOIN usuario actor ON actor.id_usuario=a.id_medico
      JOIN paciente p ON p.id_paciente=a.id_paciente JOIN usuario up ON up.id_usuario=p.id_usuario
      WHERE a.id_paciente=alerta.id_paciente AND a.id_medico=$4 AND a.activo
        AND actor.activo AND actor.rol='medico' AND up.activo AND up.rol='paciente')`;
    const ejecutar = async (client) => {
      if (usuarioId !== null) await client.query("SELECT set_config('app.usuario_actor', $1, true)", [String(usuarioId)]);
      return client.query(
        `UPDATE alerta SET estado = $2 WHERE id_alerta = $1${filtro}
         RETURNING id_alerta, id_paciente, id_medicion, tipo, motivo, estado, fecha_generacion,
                   id_objetivo, clasificacion, indicacion_paciente`, parametros);
    };
    const { rows } = this.db.transaccion ? await this.db.transaccion(ejecutar) : await ejecutar(this.db);
    if (!rows[0]) throw new NoEncontrado('Alerta no encontrada');
    const r = rows[0];
    return { id: r.id_alerta, idPaciente: r.id_paciente, idMedicion: r.id_medicion, tipo: r.tipo,
      motivo: r.motivo, estado: r.estado, fechaGeneracion: r.fecha_generacion,
      idObjetivo: r.id_objetivo, clasificacion: r.clasificacion, indicacionPaciente: r.indicacion_paciente };
  }

  async buscarPorId(idAlerta) {
    const { rows } = await this.db.query('SELECT id_alerta, id_paciente FROM alerta WHERE id_alerta=$1', [idAlerta]);
    return rows[0] ? { id: rows[0].id_alerta, idPaciente: rows[0].id_paciente } : null;
  }
}

function criterioObjetivo(r) {
  const etiqueta = (valor, limite, direccion, unidad) => limite == null || Number(valor) == Number(limite) ? null
    : direccion === 'inferior' && Number(valor) < Number(limite) ? `Por debajo del límite inferior individual (${limite} ${unidad}).`
      : direccion === 'superior' && Number(valor) > Number(limite) ? `Por encima del límite superior individual (${limite} ${unidad}).` : null;
  if (r.medicion_tipo === 'glucosa') return etiqueta(r.glucosa_mg_dl, r.glucosa_min, 'inferior', 'mg/dL')
    ?? etiqueta(r.glucosa_mg_dl, r.glucosa_max, 'superior', 'mg/dL');
  if (r.medicion_tipo === 'presion_arterial') return etiqueta(r.sistolica_mmhg, r.sistolica_min, 'inferior', 'mmHg')
    ?? etiqueta(r.sistolica_mmhg, r.sistolica_max, 'superior', 'mmHg')
    ?? etiqueta(r.diastolica_mmhg, r.diastolica_min, 'inferior', 'mmHg')
    ?? etiqueta(r.diastolica_mmhg, r.diastolica_max, 'superior', 'mmHg');
  if (r.medicion_tipo === 'hba1c') return 'Criterio de seguridad versionado aplicado.';
  return null;
}
