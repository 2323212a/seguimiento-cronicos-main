import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluarObjetivoMedicion } from '../src/domain/EvaluarObjetivoMedicion.js';
import { ObjetivoMedicion } from '../src/domain/ObjetivoMedicion.js';
import { Medicion } from '../src/domain/Medicion.js';
import { coincideCriterioSeguridad, EvaluadorSeguridadAprobada } from '../src/infrastructure/alertas/EvaluadorSeguridadAprobada.js';
import { EvaluadorMedicion } from '../src/infrastructure/alertas/EvaluadorMedicion.js';

const objetivo = (values = {}) => ({ id_objetivo: 4, indicacion_paciente: 'Sigue el plan acordado con tu médico.', ...values });

test('1) medición válida dentro del objetivo no genera alerta y 3) sin objetivo no agrega alerta de objetivo', () => {
  assert.equal(evaluarObjetivoMedicion({ tipo: 'glucosa', glucosaMgDl: 100 }, objetivo({ glucosa_min: 80, glucosa_max: 130 })), null);
  assert.equal(evaluarObjetivoMedicion({ tipo: 'glucosa', glucosaMgDl: 250 }, null), null);
});

test('2) medición válida fuera del objetivo genera alerta y conserva indicación escrita por médico', () => {
  const result = evaluarObjetivoMedicion({ tipo: 'glucosa', glucosaMgDl: 145 }, objetivo({ glucosa_min: 80, glucosa_max: 130 }));
  assert.equal(result.tipo, 'fuera_objetivo_individual');
  assert.equal(result.clasificacion, 'fuera_objetivo_individual');
  assert.equal(result.indicacionPaciente, 'Sigue el plan acordado con tu médico.');
  assert.match(result.motivo, /objetivo individual/);
});

test('la presión se compara por componente contra los límites individuales definidos', () => {
  const goal = objetivo({ sistolica_min: 100, sistolica_max: 140, diastolica_min: 60, diastolica_max: 90 });
  assert.equal(evaluarObjetivoMedicion({ tipo: 'presion_arterial', sistolicaMmhg: 120, diastolicaMmhg: 80 }, goal), null);
  assert.ok(evaluarObjetivoMedicion({ tipo: 'presion_arterial', sistolicaMmhg: 150, diastolicaMmhg: 80 }, goal));
});

test('objetivo no acepta valores faltantes ni instrucciones vacías', () => {
  assert.throws(() => new ObjetivoMedicion({ idPaciente: 1, idMedico: 2, tipoMedicion: 'glucosa', indicacionPaciente: ' ' }));
  assert.throws(() => new ObjetivoMedicion({ idPaciente: 1, idMedico: 2, tipoMedicion: 'presion_arterial', indicacionPaciente: 'Consulta con tu médico.' }));
});

test('4, 5, 6) detector independiente funciona sin objetivo, captura inválida se rechaza técnicamente', async () => {
  const detector = new EvaluadorSeguridadAprobada({ criterioSeguridadRepository: {
    listarAprobadosActivos: async () => [{ id: 8, codigo: 'fixture_test_only', version: 'test-v1',
      condicion: { any: [{ campo: 'glucosaMgDl', operador: 'gt', valor: 1 }] },
      mensajeOrientacion: 'Mensaje ficticio de prueba, no clínico.' }],
  } });
  const evaluacion = await detector.evaluar({ tipo: 'glucosa', glucosaMgDl: 2 }, {});
  assert.equal(evaluacion.alertas.length, 1);
  assert.equal(evaluacion.alertas[0].clasificacion, 'seguridad');
  assert.equal((await new EvaluadorSeguridadAprobada({ criterioSeguridadRepository: { listarAprobadosActivos: async () => [] } })
    .evaluar({ tipo: 'glucosa', glucosaMgDl: 2 }, {})).alertas.length, 0);
  assert.throws(() => new Medicion({ idPaciente: 1, tipo: 'glucosa', glucosaMgDl: 'no-numérico' }));
  assert.throws(() => new Medicion({ idPaciente: 1, tipo: 'glucosa', glucosaMgDl: 1.234 }));
  assert.throws(() => new Medicion({ idPaciente: 1, tipo: 'glucosa', glucosaMgDl: 100, unidad: 'mmHg' }));
  assert.throws(() => new Medicion({ idPaciente: 1, tipo: 'glucosa', glucosaMgDl: -1 }));
});

test('7) un valor extremo pero representable no se rechaza por inusual', () => {
  assert.equal(new Medicion({ idPaciente: 1, tipo: 'glucosa', glucosaMgDl: 9999.99 }).glucosaMgDl, 9999.99);
  assert.equal(new Medicion({ idPaciente: 1, tipo: 'presion_arterial', sistolicaMmhg: 32767, diastolicaMmhg: 1 }).sistolicaMmhg, 32767);
});

test('8) una medición puede generar alerta de seguridad y de objetivo simultáneamente', async () => {
  const seguridad = { evaluar: async () => ({ alertas: [{ id: 's', clasificacion: 'seguridad' }], evaluaciones: [] }) };
  const objetivoIndividual = { evaluar: async () => ({ alertas: [{ id: 'o', clasificacion: 'fuera_objetivo_individual' }], evaluaciones: [] }) };
  const resultado = await new EvaluadorMedicion({ seguridad, objetivoIndividual }).evaluar({}, {});
  assert.deepEqual(resultado.alertas.map((x) => x.clasificacion), ['seguridad', 'fuera_objetivo_individual']);
});

test('un criterio de seguridad mal formado o con campos no admitidos no se activa', () => {
  assert.equal(coincideCriterioSeguridad({ glucosaMgDl: 2 }, { any: [{ campo: 'diagnostico', operador: 'eq', valor: 1 }] }), false);
  assert.equal(coincideCriterioSeguridad({ tipo: 'glucosa', glucosaMgDl: 2 }, { any: [{ campo: 'sistolicaMmhg', operador: 'gt', valor: 1 }] }), false);
});
