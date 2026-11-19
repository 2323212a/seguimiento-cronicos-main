export class PgEventoRecibidoRepository {
  constructor(db) { this.db = db; }
  async reclamar(eventId, leaseSegundos = 120) {
    const { rows } = await this.db.query(
      `INSERT INTO evento_recibido (event_id, estado, intentos, lease_hasta)
       SELECT event_id, 'procesando', 1, NOW() + ($2 * INTERVAL '1 second')
         FROM outbox_evento WHERE event_id = $1
       ON CONFLICT (event_id) DO UPDATE
         SET estado='procesando', intentos=evento_recibido.intentos + 1,
             lease_hasta=NOW() + ($2 * INTERVAL '1 second')
         WHERE evento_recibido.estado <> 'enviado' AND evento_recibido.lease_hasta < NOW()
       RETURNING event_id`, [eventId, leaseSegundos]);
    if (rows.length) return { procesar: true, estado: 'procesando' };
    const existente = await this.db.query('SELECT estado, lease_hasta FROM evento_recibido WHERE event_id=$1', [eventId]);
    if (!existente.rows[0]) return { procesar: false, estado: 'desconocido' };
    const { estado, lease_hasta: leaseHasta } = existente.rows[0];
    return { procesar: false, estado, ocupado: estado === 'procesando' && new Date(leaseHasta) > new Date() };
  }
  async completar(eventId) {
    return this.db.transaccion(async (client) => {
      const { rows } = await client.query(
        `UPDATE evento_recibido SET estado='enviado', completado_at=NOW(), lease_hasta=NOW()
          WHERE event_id=$1 AND estado='procesando' AND lease_hasta >= NOW()
          RETURNING event_id`, [eventId]);
      if (!rows[0]) return false;
      await client.query(
        `INSERT INTO notificacion (id_paciente, tipo, canal, mensaje, estado_envio, fecha_envio)
           SELECT o.agregado_id, 'confirmacion', 'telegram',
                'Hay una actualización disponible en tu cuenta segura. Inicia sesión para consultarla.',
                'enviado', NOW()
           FROM outbox_evento o JOIN paciente p ON p.id_paciente=o.agregado_id
          WHERE o.event_id=$1 AND o.agregado_tipo='paciente' AND p.telegram_chat_id IS NOT NULL`, [eventId]);
      return true;
    });
  }
}
