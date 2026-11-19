import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { crearApp } from '../src/infrastructure/http/crearApp.js';
import { Jwt } from '../src/infrastructure/security/Jwt.js';
import { Csrf } from '../src/infrastructure/security/Csrf.js';

const secret = 'test-secret-for-cookie-signing-with-at-least-32-characters';
let servidor; let base; let activo = true;
const usuario = { id: 7, correo: 'luis@correo.com', rol: 'paciente', activo: true, idPaciente: 31, nombre: 'Luis' };
const cookies = new Map();
const aplicarCookies = (r) => { for (const raw of r.headers.getSetCookie()) { const [pair] = raw.split(';'); const i = pair.indexOf('='); cookies.set(pair.slice(0, i), pair.slice(i + 1)); } };
const cookieHeader = () => [...cookies].map(([k, v]) => `${k}=${v}`).join('; ');

before(() => {
  const casosDeUso = {
    registrarPaciente: { ejecutar: async () => ({ id: 99 }) },
    iniciarSesion: { ejecutar: async () => ({ ...usuario }) },
    consultarHistorial: { ejecutar: async ({ idPaciente }) => [{ id: 1, idPaciente }] },
    registrarMedicion: { ejecutar: async (datos) => ({ medicion: { ...datos }, alerta: null }) },
    consultarMedicamentos: { ejecutar: async () => [] },
    registrarMedicamento: { ejecutar: async (x) => x },
    obtenerRecordatorios: { ejecutar: async () => [] },
    registrarNotificacion: { ejecutar: async (x) => x },
    passwordHasher: { hash: async (x) => `hash:${x}` },
  };
  const usuarioRepository = {
    buscarActual: async () => activo ? usuario : { ...usuario, activo: false },
  };
  const pacienteRepository = {
    buscarPorUsuario: async () => ({ id: usuario.idPaciente, nombre: 'Luis' }),
    estaAsignado: async () => false,
    listarAsignados: async () => [],
  };
  servidor = crearApp({ casosDeUso, usuarioRepository, pacienteRepository, alertaRepository: { listarPorPaciente: async () => [] },
    asignacionRepository: { listarParaAdministrador: async () => [] }, seguimientoRepository: {},
    jwt: new Jwt({ secreto: secret }), csrf: new Csrf(secret) }).listen(0);
  base = `http://localhost:${servidor.address().port}/api`;
});
after(() => servidor.close());

test('rutas clínicas requieren sesión y el acceso por ID fue retirado', async () => {
  assert.equal((await fetch(`${base}/pacientes/me/mediciones`)).status, 401);
  assert.equal((await fetch(`${base}/pacientes/31/mediciones`)).status, 404);
});

test('login requiere CSRF, crea cookie y consulta propio perfil', async () => {
  const csrfResponse = await fetch(`${base}/auth/csrf`); aplicarCookies(csrfResponse);
  const { csrfToken } = await csrfResponse.json();
  const login = await fetch(`${base}/auth/login`, { method: 'POST', headers: {
    'content-type': 'application/json', cookie: cookieHeader(), 'x-csrf-token': csrfToken,
  }, body: JSON.stringify({ correo: usuario.correo, contrasena: 'secret' }) });
  assert.equal(login.status, 200); aplicarCookies(login);
  const profile = await fetch(`${base}/pacientes/me`, { headers: { cookie: cookieHeader() } });
  assert.equal(profile.status, 200);
  assert.equal((await profile.json()).id, usuario.idPaciente);
});

test('CSRF inválido y cuenta desactivada rechazan la sesión', async () => {
  const csrfResponse = await fetch(`${base}/auth/csrf`); aplicarCookies(csrfResponse);
  const failed = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: cookieHeader() }, body: '{}' });
  assert.equal(failed.status, 403);
  activo = false;
  const denied = await fetch(`${base}/pacientes/me/mediciones`, { headers: { cookie: cookieHeader() } });
  assert.equal(denied.status, 401);
  activo = true;
});
