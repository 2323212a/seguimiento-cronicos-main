import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { GestionarVinculoTelegram } from '../src/application/use-cases/GestionarVinculoTelegram.js';
import { ConsultarEstadoAlertasTelegram } from '../src/application/use-cases/ConsultarEstadoAlertasTelegram.js';

test('la vinculación genera un código temporal y persiste solo su hash', async () => {
  let guardado;
  let confirmado;
  const caso = new GestionarVinculoTelegram({ repository: {
    async crear(v) { guardado = v; },
    async confirmar(v) { confirmado = v; return true; },
  } });
  const { codigo, expiraEnMinutos } = await caso.crear('123456789');
  assert.equal(codigo.length, 12);
  assert.equal(expiraEnMinutos, 10);
  assert.notEqual(guardado.codigoHash, codigo);
  assert.equal(guardado.codigoHash, createHash('sha256').update(codigo).digest('hex'));
  assert.deepEqual(await caso.confirmar({ idPaciente: 7, codigo }), { vinculado: true });
  assert.equal(confirmado.idPaciente, 7);
  assert.equal(confirmado.codigoHash, guardado.codigoHash);
});

test('consulta de Telegram devuelve solo estado genérico y nunca información de la alerta', async () => {
  const calls = [];
  const caso = new ConsultarEstadoAlertasTelegram({
    pacienteRepository: { async buscarIdActivoPorTelegramChatId(id) { calls.push(id); return 9; } },
    alertaRepository: { async tienePendientes(id) { assert.equal(id, 9); return true; } },
  });
  assert.deepEqual(await caso.ejecutar('123456789'), { vinculada: true, tieneAlertasPendientes: true });
  assert.deepEqual(calls, ['123456789']);
});
