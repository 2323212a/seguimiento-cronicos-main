import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PgMedicionRepository } from '../src/infrastructure/persistence/postgres/PgMedicionRepository.js';

test('el historial aplica la condición de acceso según cada rol', async () => {
  const llamadas = [];
  const repo = new PgMedicionRepository({ query: async (sql, params) => {
    llamadas.push({ sql, params });
    return { rows: [] };
  } });

  for (const rol of ['paciente', 'medico', 'seguimiento']) {
    await repo.listarPorPaciente(11, { usuarioId: 7, rol });
  }

  assert.equal(llamadas.length, 3);
  for (const { sql, params } of llamadas) {
    assert.match(sql, /ua\.activo AND ua\.rol=\$3/);
    assert.deepEqual(params, [11, 7, params[2]]);
  }
  assert.match(llamadas[0].sql, /p\.id_usuario=\$2/);
  assert.match(llamadas[1].sql, /medico_paciente/);
  assert.match(llamadas[2].sql, /seguimiento_paciente/);
  assert.deepEqual(llamadas.map(({ params }) => params[2]), ['paciente', 'medico', 'seguimiento']);
});
