import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PgSeguimientoRepository } from '../src/infrastructure/persistence/postgres/PgSeguimientoRepository.js';

function dbDePrueba({ asignado = true } = {}) {
  const statements = [];
  return {
    statements,
    transaccion: (fn) => fn({ query: async (sql) => {
      statements.push(sql);
      if (sql.includes('SELECT id_usuario FROM paciente')) return { rows: [{ id_usuario: 20 }] };
      if (sql.includes('SELECT id_usuario, rol, activo')) return { rows: [
        { id_usuario: 3, rol: 'seguimiento', activo: true },
        { id_usuario: 20, rol: 'paciente', activo: true },
      ] };
      if (sql.includes('SELECT 1 FROM seguimiento_paciente')) return { rowCount: asignado, rows: asignado ? [{}] : [] };
      if (sql.includes('INSERT INTO seguimiento_accion')) return { rows: [{
        id_accion: 4, id_paciente: 11, id_usuario: 3, tipo_accion: 'llamada', descripcion: 'Revisión', fecha_accion: new Date(),
      }] };
      return { rows: [] };
    } }),
  };
}

test('guarda acciones de seguimiento dentro de la transacción y tras validar asignación', async () => {
  const db = dbDePrueba();
  const result = await new PgSeguimientoRepository(db).registrar({
    idUsuario: 3, idPaciente: 11, tipoAccion: 'llamada', descripcion: 'Revisión',
  });
  assert.equal(result.id, 4);
  const lockUsers = db.statements.findIndex((sql) => sql.includes('SELECT id_usuario, rol, activo'));
  const lockPatient = db.statements.findIndex((sql) => sql.includes('FOR UPDATE') && sql.includes('id_paciente'));
  const checkAssignment = db.statements.findIndex((sql) => sql.includes('SELECT 1 FROM seguimiento_paciente'));
  const insertAction = db.statements.findIndex((sql) => sql.includes('INSERT INTO seguimiento_accion'));
  assert.ok(lockUsers >= 0 && lockPatient > lockUsers && checkAssignment > lockPatient && insertAction > checkAssignment);
});

test('rechaza la acción cuando el usuario ya no está asignado', async () => {
  const db = dbDePrueba({ asignado: false });
  await assert.rejects(
    () => new PgSeguimientoRepository(db).registrar({ idUsuario: 3, idPaciente: 11, tipoAccion: 'visita', descripcion: 'Visita' }),
    { name: 'NoEncontrado' },
  );
  assert.equal(db.statements.some((sql) => sql.includes('INSERT INTO seguimiento_accion')), false);
});
