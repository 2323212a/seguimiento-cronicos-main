import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PgUsuarioRepository } from '../src/infrastructure/persistence/postgres/PgUsuarioRepository.js';

test('la desactivación bloquea profesional antes de consultar asignaciones', async () => {
  const sqls = [];
  const db = { transaccion: (fn) => fn({ query: async (sql) => {
    sqls.push(sql);
    if (sql.includes('SELECT id_usuario, rol, activo')) return { rows: [
      { id_usuario: 1, rol: 'administrador', activo: true }, { id_usuario: 2, rol: 'medico', activo: true },
    ] };
    if (sql.includes('SELECT id_paciente FROM medico_paciente')) return { rows: [{ id_paciente: 8 }, { id_paciente: 9 }] };
    if (sql.includes('UPDATE usuario')) return { rows: [{ id_usuario: 2, correo: 'medico@example.com', rol: 'medico', activo: false }] };
    return { rows: [], rowCount: 2 };
  } }) };
  const repo = new PgUsuarioRepository(db);
  await repo.cambiarEstado({ actorId: 1, objetivoId: 2, activo: false });
  const lockUser = sqls.findIndex((x) => x.includes('SELECT id_usuario, rol, activo'));
  const readAssignments = sqls.findIndex((x) => x.includes('SELECT id_paciente FROM medico_paciente'));
  const lockPatients = sqls.findIndex((x) => x.includes('SELECT id_paciente FROM paciente') && x.includes('FOR UPDATE'));
  assert.ok(lockUser >= 0 && readAssignments > lockUser && lockPatients > readAssignments);
});

test('no permite desactivar la propia cuenta administrativa', async () => {
  const repo = new PgUsuarioRepository({ transaccion: (fn) => fn({ query: async () => ({ rows: [] }) }) });
  await assert.rejects(() => repo.cambiarEstado({ actorId: 4, objetivoId: 4, activo: false }), { name: 'Conflicto' });
});
