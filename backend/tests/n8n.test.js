import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { crearApp } from '../src/infrastructure/http/crearApp.js';
import { validarConfiguracionOutbox } from '../src/infrastructure/eventos/OutboxDispatcher.js';

let servidor; let base;
before(() => {
  const casosDeUso = {
    obtenerRecordatorios: { ejecutar: async () => [{ idHorario: 4, idPaciente: 12, telegramChatId: 'chat-1', paciente: 'Nombre', medicamento: 'Fármaco', dosis: '10 mg' }] },
    registrarNotificacion: { ejecutar: async (x) => x },
  };
  servidor = crearApp({ casosDeUso, apiKeyAutomatizacion: 'test-key', usuarioRepository: {}, pacienteRepository: {},
    alertaRepository: {}, asignacionRepository: {}, seguimientoRepository: {},
    eventoRecibidoRepository: { reclamar: async () => ({ procesar: true, estado: 'procesando' }), completar: async () => true } }).listen(0);
  base = `http://localhost:${servidor.address().port}`;
});
after(() => servidor.close());

test('salud responde y las rutas n8n exigen API key', async () => {
  assert.equal((await fetch(base + '/api/salud')).status, 200);
  assert.equal((await fetch(base + '/api/automatizacion/recordatorios?hora=09:00')).status, 401);
});

test('recordatorios exponen texto neutral y no datos de tratamiento', async () => {
  const response = await fetch(base + '/api/automatizacion/recordatorios?hora=09:00', { headers: { 'x-api-key': 'test-key' } });
  assert.equal(response.status, 200);
  const [recordatorio] = await response.json();
  assert.equal(recordatorio.texto, 'Tienes un recordatorio pendiente. Revisa tu cuenta segura.');
  assert.equal('dosis' in recordatorio, false);
  assert.equal('medicamento' in recordatorio, false);
});

test('el receptor persiste el eventId y bloquea mensajes clínicos', async () => {
  const key = { 'x-api-key': 'test-key' };
  const claim = await fetch(base + '/api/automatizacion/eventos/123e4567-e89b-42d3-a456-426614174000/reclamar', { method: 'POST', headers: key });
  assert.equal(claim.status, 200);
  assert.equal((await claim.json()).procesar, true);
  const done = await fetch(base + '/api/automatizacion/eventos/123e4567-e89b-42d3-a456-426614174000/completar', { method: 'POST', headers: key });
  assert.equal(done.status, 200);
  const unsafe = await fetch(base + '/api/automatizacion/notificaciones', {
    method: 'POST', headers: { 'content-type': 'application/json', ...key },
    body: JSON.stringify({ idPaciente: 1, tipo: 'confirmacion', mensaje: 'Glucosa 120 mg/dL' }),
  });
  assert.equal(unsafe.status, 400);
});

test('configuración Outbox exige secreto suficiente y bloquea webhooks HTTP públicos', () => {
  assert.equal(validarConfiguracionOutbox({url:'http://n8n:5678/webhook/secure',apiKey:'x'.repeat(40)}),true);
  assert.throws(()=>validarConfiguracionOutbox({url:'http://example.com/webhook',apiKey:'x'.repeat(40)}),/HTTPS|host local/);
  assert.throws(()=>validarConfiguracionOutbox({url:'https://example.com/webhook',apiKey:'short'}),/API key/);
});
