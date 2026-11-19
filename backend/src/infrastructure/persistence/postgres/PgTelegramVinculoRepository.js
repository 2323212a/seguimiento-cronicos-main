import { TelegramVinculoRepository } from '../../../application/ports/TelegramVinculoRepository.js';
import { Conflicto } from '../../../domain/errors.js';

export class PgTelegramVinculoRepository extends TelegramVinculoRepository {
  constructor(db) { super(); this.db = db; }

  async crear({ telegramChatId, codigoHash }) {
    await this.db.transaccion(async (client) => {
      await client.query(
        `UPDATE telegram_vinculo SET consumido_en=(now() AT TIME ZONE 'UTC')
         WHERE telegram_chat_id=$1 AND consumido_en IS NULL`, [telegramChatId]);
      await client.query(
        `INSERT INTO telegram_vinculo (telegram_chat_id, codigo_hash, expira_en)
         VALUES ($1, $2, (now() AT TIME ZONE 'UTC') + interval '10 minutes')`,
        [telegramChatId, codigoHash]);
    });
  }

  async confirmar({ idPaciente, codigoHash }) {
    return this.db.transaccion(async (client) => {
      const { rows } = await client.query(
        `SELECT id_vinculo, telegram_chat_id FROM telegram_vinculo
         WHERE codigo_hash=$1 AND consumido_en IS NULL
           AND expira_en > (now() AT TIME ZONE 'UTC')
         FOR UPDATE`, [codigoHash]);
      if (!rows[0]) return false;
      const vinculo = rows[0];
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [vinculo.telegram_chat_id]);
      const { rowCount } = await client.query(
        `SELECT 1 FROM paciente WHERE telegram_chat_id=$1 AND telegram_verificado
         AND id_paciente<>$2`, [vinculo.telegram_chat_id, idPaciente]);
      if (rowCount) throw new Conflicto('Este chat ya está vinculado a otra cuenta');
      const actualizado = await client.query(
        `UPDATE paciente SET telegram_chat_id=$1, telegram_verificado=true,
           telegram_verificado_en=(now() AT TIME ZONE 'UTC')
         WHERE id_paciente=$2 RETURNING id_paciente`, [vinculo.telegram_chat_id, idPaciente]);
      if (!actualizado.rowCount) return false;
      await client.query(
        `UPDATE telegram_vinculo SET consumido_en=(now() AT TIME ZONE 'UTC') WHERE id_vinculo=$1`,
        [vinculo.id_vinculo]);
      return true;
    });
  }
}
