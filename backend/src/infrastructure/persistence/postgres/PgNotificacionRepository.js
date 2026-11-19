import { NotificacionRepository } from '../../../application/ports/NotificacionRepository.js';

export class PgNotificacionRepository extends NotificacionRepository {
  constructor(db) { super(); this.db = db; }

  async guardar(n) {
    const { rows } = await this.db.query(
      `INSERT INTO notificacion
         (id_paciente, id_alerta, id_horario, tipo, canal, mensaje, estado_envio, fecha_envio)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [n.idPaciente, n.idAlerta ?? null, n.idHorario ?? null, n.tipo, n.canal, n.mensaje, n.estadoEnvio,
        n.estadoEnvio === 'enviado' ? new Date() : null],
    );
    const r = rows[0];
    return {
      id: r.id_notificacion, idPaciente: r.id_paciente, tipo: r.tipo, canal: r.canal,
      mensaje: r.mensaje, estadoEnvio: r.estado_envio, fechaEnvio: r.fecha_envio,
    };
  }
}
