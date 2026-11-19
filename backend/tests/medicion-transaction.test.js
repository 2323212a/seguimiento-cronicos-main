import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PgMedicionRepository } from '../src/infrastructure/persistence/postgres/PgMedicionRepository.js';
import { Medicion } from '../src/domain/Medicion.js';

const medicion = () => new Medicion({ idPaciente: 2, tipo: 'glucosa', glucosaMgDl: 100, fechaHora: new Date() });

function dbDePrueba({ fallaOutbox = false } = {}) {
  const queries = []; let commit = false; let rollback = false;
  return {
    queries, estado: () => ({ commit, rollback }),
    async transaccion(work) {
      try { const result = await work({ query: async (sql) => {
        queries.push(sql);
        if (sql.includes('INSERT INTO medicion')) return { rows: [{ id_medicion: 8, id_paciente: 2, tipo: 'glucosa', glucosa_mg_dl: '100', fecha_hora: new Date() }] };
        if (sql.includes('INSERT INTO alerta')) return { rows: [{ id_alerta: 5, id_paciente: 2, id_medicion: 8, tipo: 'prueba', motivo: 'fixture', estado: 'generada', fecha_generacion: new Date() }] };
        if (sql.includes('INSERT INTO outbox_evento') && fallaOutbox) throw new Error('outbox falló');
        return { rows: [] };
      } }); commit = true; return result; }
      catch (error) { rollback = true; throw error; }
    },
  };
}

test('medición, alerta y outbox se escriben en la misma transacción', async () => {
  const db = dbDePrueba(); const repo = new PgMedicionRepository(db);
  const evaluador = { evaluar: async (_m, client) => { assert.ok(client); return [{ idObjetivo: 3, tipo: 'fuera_objetivo_individual', clasificacion: 'fuera_objetivo_individual', motivo: 'fixture', indicacionPaciente: 'Indicación médica' }]; } };
  const result = await repo.guardarConAlertaYEvento(medicion(), evaluador, {
    eventId: '123e4567-e89b-42d3-a456-426614174000', tipo: 'medicion.registrada', agregado: { tipo: 'paciente', id: 2 }, datos: { plantilla: 'medicion_registrada' },
  });
  assert.equal(result.medicion.id, 8); assert.equal(result.alerta.id, 5);
  assert.match(db.queries[0], /INSERT INTO medicion/);
  assert.ok(db.queries.some((sql) => sql.includes('INSERT INTO alerta')));
  assert.ok(db.queries.some((sql) => sql.includes('INSERT INTO outbox_evento')));
  assert.ok(db.queries.some((sql) => sql.includes('INSERT INTO public.evaluacion_medicion')));
  assert.deepEqual(db.estado(), { commit: true, rollback: false });
});

test('un fallo al persistir outbox revierte la transacción', async () => {
  const db = dbDePrueba({ fallaOutbox: true }); const repo = new PgMedicionRepository(db);
  const evaluador = { evaluar: async () => [{ idObjetivo: 3, tipo: 'fuera_objetivo_individual', clasificacion: 'fuera_objetivo_individual', motivo: 'fixture', indicacionPaciente: 'Indicación médica' }] };
  await assert.rejects(() => repo.guardarConAlertaYEvento(medicion(), evaluador, {
    eventId: '123e4567-e89b-42d3-a456-426614174000', tipo: 'medicion.registrada', agregado: { tipo: 'paciente', id: 2 }, datos: {},
  }), /outbox falló/);
  assert.deepEqual(db.estado(), { commit: false, rollback: true });
});

test('una medición sin objetivo individual no genera alerta ni evento Outbox', async () => {
  const db = dbDePrueba(); const repo = new PgMedicionRepository(db);
  const result = await repo.guardarConAlertaYEvento(medicion(), { evaluar: async () => [] }, {
    eventId: '123e4567-e89b-42d3-a456-426614174000', tipo: 'alerta.generada', agregado: { tipo: 'paciente', id: 2 }, datos: {},
  });
  assert.equal(result.alerta, null);
  assert.deepEqual(result.alertas, []);
  assert.equal(db.queries.some((q) => q.includes('INSERT INTO alerta')), false);
  assert.equal(db.queries.some((q) => q.includes('INSERT INTO outbox_evento')), false);
  assert.deepEqual(db.estado(), { commit: true, rollback: false });
});
