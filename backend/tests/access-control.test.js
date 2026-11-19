import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { crearApp } from '../src/infrastructure/http/crearApp.js';
import { Jwt } from '../src/infrastructure/security/Jwt.js';

const secret = 'test-secret-for-access-control-tests-at-least-32';
const jwt = new Jwt({ secreto: secret });
const users = new Map([
  [1, { id: 1, rol: 'paciente', activo: true, idPaciente: 11, nombre: 'Paciente' }],
  [2, { id: 2, rol: 'medico', activo: true }],
  [3, { id: 3, rol: 'seguimiento', activo: true }],
  [4, { id: 4, rol: 'administrador', activo: true }],
  [5, { id: 5, rol: 'medico', activo: false }],
]);
let server; let base;

before(() => {
  const casosDeUso = {
    consultarHistorial: { ejecutar: async ({ idPaciente }) => [{ id: 20, idPaciente }] },
    consultarMedicamentos: { ejecutar: async () => [] },
    registrarMedicamento: { ejecutar: async (data) => data },
    registrarMedicion: { ejecutar: async (data) => data },
  };
  const pacienteRepository = {
    buscarPorUsuario: async (id) => id === 1 ? { id: 11, nombre: 'Paciente' } : null,
    listarAsignados: async () => [{ id: 11, nombre: 'Paciente' }],
    estaAsignado: async (idUsuario, idPaciente, rol) => idPaciente === 11 &&
      ((idUsuario === 2 && rol === 'medico') || (idUsuario === 3 && rol === 'seguimiento')),
  };
  server = crearApp({
    casosDeUso,
    jwt,
    usuarioRepository: { buscarActual: async (id) => users.get(Number(id)) ?? null, listarCuentas: async () => [] },
    pacienteRepository,
    alertaRepository: { listarPorPaciente: async () => [] },
    asignacionRepository: { listarParaAdministrador: async () => [] },
    seguimientoRepository: { listar: async () => [], registrar: async (action) => action },
  }).listen(0);
  base = `http://localhost:${server.address().port}/api`;
});

after(() => server.close());

const get = (path, id) => fetch(`${base}${path}`, {
  headers: { cookie: `sesion=${jwt.firmar({ sub: id })}` },
});

test('el médico consulta pacientes asignados y no puede consultar otros', async () => {
  assert.equal((await get('/medico/pacientes/11/mediciones', 2)).status, 200);
  assert.equal((await get('/medico/pacientes/12/mediciones', 2)).status, 404);
});

test('seguimiento ve acciones asignadas, pero no medicamentos', async () => {
  assert.equal((await get('/seguimiento/pacientes/11/acciones', 3)).status, 200);
  assert.equal((await get('/seguimiento/pacientes/11/medicamentos', 3)).status, 403);
});

test('administración no puede entrar a endpoints clínicos ni usar rutas de médico', async () => {
  assert.equal((await get('/pacientes/me/mediciones', 4)).status, 403);
  assert.equal((await get('/medico/pacientes/11/mediciones', 4)).status, 403);
});

test('cuenta inactiva no accede aunque presente un JWT válido', async () => {
  assert.equal((await get('/medico/pacientes', 5)).status, 401);
});

test('el paciente consulta únicamente su ruta propia y no la ruta histórica por ID', async () => {
  assert.equal((await get('/pacientes/me', 1)).status, 200);
  assert.equal((await get('/pacientes/me/mediciones', 1)).status, 200);
  assert.equal((await get('/pacientes/11/mediciones', 1)).status, 404);
});
