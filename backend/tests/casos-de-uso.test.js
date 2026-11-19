import { test } from 'node:test';
import assert from 'node:assert/strict';
import { construirCasosDeUso } from '../src/config/container.js';
import {
  PacienteEnMemoria, MedicionEnMemoria, MedicamentoEnMemoria, AlertaEnMemoria,
} from '../src/infrastructure/persistence/memory/repositoriosEnMemoria.js';
import { EvaluadorDeAlertas } from '../src/application/ports/EvaluadorDeAlertas.js';

const fabrica = (extra = {}) => construirCasosDeUso({
  pacienteRepository: new PacienteEnMemoria(),
  medicionRepository: new MedicionEnMemoria(),
  medicamentoRepository: new MedicamentoEnMemoria(),
  alertaRepository: new AlertaEnMemoria(),
  passwordHasher: { hash: async (t) => `hash:${t}` },
  ...extra,
  alertasBackendActivas: extra.alertasBackendActivas ?? true,
});

const datosPaciente = {
  correo: 'Ana@Correo.com', contrasena: 'secreta123', nombre: 'Ana',
  apellidoPaterno: 'López', fechaNacimiento: '1980-05-10',
};

test('registra un paciente y rechaza correo duplicado', async () => {
  const uc = fabrica();
  const p = await uc.registrarPaciente.ejecutar(datosPaciente);
  assert.equal(p.id, 1);
  assert.equal(uc.registrarPaciente.pacienteRepository.usuarios[0].activo, false);
  await assert.rejects(() => uc.registrarPaciente.ejecutar(datosPaciente), { name: 'Conflicto' });
});

test('valida contraseña corta y correo inválido', async () => {
  const uc = fabrica();
  await assert.rejects(() => uc.registrarPaciente.ejecutar({ ...datosPaciente, contrasena: '123' }), { name: 'ErrorDeDominio' });
  await assert.rejects(() => uc.registrarPaciente.ejecutar({ ...datosPaciente, correo: 'xx' }), { name: 'ErrorDeDominio' });
});

test('registra mediciones y consulta historial filtrado', async () => {
  const uc = fabrica();
  const p = await uc.registrarPaciente.ejecutar(datosPaciente);
  await uc.registrarMedicion.ejecutar({ idPaciente: p.id, tipo: 'glucosa', glucosaMgDl: 95 });
  await uc.registrarMedicion.ejecutar({ idPaciente: p.id, tipo: 'presion_arterial', sistolicaMmhg: 120, diastolicaMmhg: 80 });
  assert.equal((await uc.consultarHistorial.ejecutar({ idPaciente: p.id })).length, 2);
  assert.equal((await uc.consultarHistorial.ejecutar({ idPaciente: p.id, tipo: 'glucosa' })).length, 1);
});

test('rechaza mediciones inconsistentes y paciente inexistente', async () => {
  const uc = fabrica();
  const p = await uc.registrarPaciente.ejecutar(datosPaciente);
  await assert.rejects(() => uc.registrarMedicion.ejecutar({ idPaciente: p.id, tipo: 'glucosa' }), { name: 'ErrorDeDominio' });
  await assert.rejects(() => uc.registrarMedicion.ejecutar({ idPaciente: p.id, tipo: 'presion_arterial', sistolicaMmhg: 70, diastolicaMmhg: 90 }), { name: 'ErrorDeDominio' });
  await assert.rejects(() => uc.registrarMedicion.ejecutar({ idPaciente: 99, tipo: 'glucosa', glucosaMgDl: 90 }), { name: 'NoEncontrado' });
});

test('por defecto no se generan alertas; con un evaluador sí se registran', async () => {
  const sinAlerta = fabrica();
  const p1 = await sinAlerta.registrarPaciente.ejecutar(datosPaciente);
  const r1 = await sinAlerta.registrarMedicion.ejecutar({ idPaciente: p1.id, tipo: 'glucosa', glucosaMgDl: 100 });
  assert.equal(r1.alerta, null);

  class EvaluadorDePrueba extends EvaluadorDeAlertas {
    async evaluar() { return { tipo: 'prueba', motivo: 'regla de prueba' }; }
  }
  const conAlerta = fabrica({ evaluadorDeAlertas: new EvaluadorDePrueba() });
  const p2 = await conAlerta.registrarPaciente.ejecutar(datosPaciente);
  const r2 = await conAlerta.registrarMedicion.ejecutar({ idPaciente: p2.id, tipo: 'glucosa', glucosaMgDl: 100 });
  assert.equal(r2.alerta.tipo, 'prueba');
});

test('sin una alerta basada en objetivo individual, no se emite evento outbox', async () => {
  const uc = fabrica();
  const p = await uc.registrarPaciente.ejecutar(datosPaciente);
  await uc.registrarMedicion.ejecutar({ idPaciente: p.id, tipo: 'glucosa', glucosaMgDl: 123 });
  const eventos = uc.registrarMedicion.medicionRepository.eventosOutbox;
  assert.equal(eventos.length, 0);
});

test('registra medicamentos con horarios y valida formato', async () => {
  const uc = fabrica();
  const p = await uc.registrarPaciente.ejecutar(datosPaciente);
  const base = { idPaciente: p.id, nombre: 'Metformina', dosis: '850 mg', frecuencia: 'cada 12 h', fechaInicio: '2026-01-01' };
  await uc.registrarMedicamento.ejecutar({ ...base, horarios: ['08:00', '20:00'] });
  assert.equal((await uc.consultarMedicamentos.ejecutar({ idPaciente: p.id })).length, 1);
  await assert.rejects(() => uc.registrarMedicamento.ejecutar({ ...base, horarios: ['25:99'] }), { name: 'ErrorDeDominio' });
});
