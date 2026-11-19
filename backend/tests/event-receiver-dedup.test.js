import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PgEventoRecibidoRepository } from '../src/infrastructure/persistence/postgres/PgEventoRecibidoRepository.js';

test('la recepción persiste eventId, bloquea concurrentes y no repite un evento completado', async () => {
  const eventId = '123e4567-e89b-42d3-a456-426614174000';
  let receiver = null;
  const db = {
    query: async (sql) => {
      if (sql.includes('INSERT INTO evento_recibido')) {
        if (!receiver) {
          receiver = { estado: 'procesando', lease_hasta: new Date(Date.now() + 60_000) };
          return { rows: [{ event_id: eventId }] };
        }
        return { rows: [] };
      }
      if (sql.includes('SELECT estado, lease_hasta FROM evento_recibido')) return { rows: receiver ? [receiver] : [] };
      return { rows: [] };
    },
  };
  const repo = new PgEventoRecibidoRepository(db);
  assert.deepEqual(await repo.reclamar(eventId), { procesar: true, estado: 'procesando' });
  const segundoIntento = await repo.reclamar(eventId);
  assert.equal(segundoIntento.procesar, false);
  assert.equal(segundoIntento.ocupado, true);

  receiver = { estado: 'enviado', lease_hasta: new Date() };
  const repetido = await repo.reclamar(eventId);
  assert.equal(repetido.procesar, false);
  assert.equal(repetido.estado, 'enviado');
});
