import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PgAsignacionRepository } from '../src/infrastructure/persistence/postgres/PgAsignacionRepository.js';

test('reasignar cierra la asignación activa anterior e inserta la nueva en orden transaccional', async () => {
  const sqls = [];
  const db = { transaccion: (fn) => fn({ query: async (sql) => {
    sqls.push(sql);
    if (sql.includes('SELECT id_usuario FROM paciente')) return { rows: [{ id_usuario: 20 }] };
    if (sql.includes('SELECT id_usuario, rol, activo')) return { rows: [
      { id_usuario: 1, rol: 'administrador', activo: true },
      { id_usuario: 2, rol: 'medico', activo: true },
      { id_usuario: 20, rol: 'paciente', activo: true },
    ] };
    if (sql.includes('SELECT id_paciente FROM paciente') && sql.includes('FOR UPDATE')) return { rows: [{ id_paciente: 11 }], rowCount: 1 };
    if (sql.includes('SELECT id_asignacion')) return { rows: [{ id_asignacion: 7, profesional: 9 }] };
    if (sql.includes('INSERT INTO medico_paciente')) return { rows: [{ id_asignacion: 8 }] };
    return { rows: [], rowCount: 1 };
  } }) };

  const result = await new PgAsignacionRepository(db).asignar({
    actorId: 1, idPaciente: 11, idProfesional: 2, tipo: 'medico',
  });
  assert.deepEqual(result, { id: 8, idPaciente: 11, idProfesional: 2, tipo: 'medico', activo: true });
  const lockUsers = sqls.findIndex((sql) => sql.includes('SELECT id_usuario, rol, activo'));
  const lockPatient = sqls.findIndex((sql) => sql.includes('FOR UPDATE') && sql.includes('id_paciente'));
  const selectActive = sqls.findIndex((sql) => sql.includes('SELECT id_asignacion'));
  const closeOld = sqls.findIndex((sql) => sql.includes('UPDATE medico_paciente SET activo = FALSE'));
  const insertNew = sqls.findIndex((sql) => sql.includes('INSERT INTO medico_paciente'));
  assert.ok(lockUsers >= 0 && lockPatient > lockUsers && selectActive > lockPatient);
  assert.ok(closeOld > selectActive && insertNew > closeOld);
});
