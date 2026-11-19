export class PgOutboxRepository {
  constructor(db) { this.db = db; }
  async reclamar({ maxIntentos = 8, leaseSegundos = 90 } = {}) {
    await this.db.query(
      `UPDATE outbox_evento SET estado='fallido', lease_hasta=NULL,
         ultimo_error=COALESCE(ultimo_error, 'Lease vencido tras agotar intentos')
       WHERE estado='procesando' AND lease_hasta < NOW() AND intentos >= $1`, [maxIntentos]);
    const { rows } = await this.db.query(
      `WITH candidato AS (
         SELECT id_outbox FROM outbox_evento
          WHERE intentos < $1 AND disponible_at <= NOW()
            AND (estado IN ('pendiente', 'reintento') OR (estado = 'procesando' AND lease_hasta < NOW()))
          ORDER BY creado_at FOR UPDATE SKIP LOCKED LIMIT 1
       )
       UPDATE outbox_evento o
          SET estado = 'procesando', intentos = o.intentos + 1,
              lease_hasta = NOW() + ($2 * INTERVAL '1 second')
         FROM candidato c WHERE o.id_outbox = c.id_outbox
       RETURNING o.id_outbox, o.event_id, o.tipo, o.agregado_tipo, o.agregado_id, o.payload, o.intentos`,
      [maxIntentos, leaseSegundos]);
    if (!rows[0]) return null;
    const r = rows[0];
    const recipient = r.agregado_tipo === 'paciente'
      ? await this.db.query('SELECT telegram_chat_id FROM paciente WHERE id_paciente = $1 AND telegram_verificado', [r.agregado_id])
      : { rows: [] };
    return { id: r.id_outbox, eventId: r.event_id, tipo: r.tipo, intentos: r.intentos,
      telegramChatId: recipient.rows[0]?.telegram_chat_id ?? null,
      plantilla: r.payload?.plantilla ?? 'actualizacion_disponible' };
  }
  async marcarEnviado(id) {
    await this.db.query(`UPDATE outbox_evento SET estado='enviado', enviado_at=NOW(), lease_hasta=NULL, ultimo_error=NULL WHERE id_outbox=$1`, [id]);
  }
  async reintentar(id, intentos, error, maxIntentos = 8) {
    const estado = intentos >= maxIntentos ? 'fallido' : 'reintento';
    const demora = Math.min(3600, 15 * (2 ** Math.min(intentos - 1, 8)));
    await this.db.query(
      `UPDATE outbox_evento SET estado=$2, disponible_at=NOW()+($3 * INTERVAL '1 second'),
         lease_hasta=NULL, ultimo_error=$4 WHERE id_outbox=$1`,
      [id, estado, demora, String(error).slice(0, 500)]);
  }
}
