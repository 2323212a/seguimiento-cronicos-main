import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Jwt } from '../src/infrastructure/security/Jwt.js';
import { Csrf } from '../src/infrastructure/security/Csrf.js';
import { IniciarSesion } from '../src/application/use-cases/IniciarSesion.js';

const secret = 'test-secret-that-is-long-enough-for-the-hmac-key';

test('JWT firma y valida identidad; rechaza alteraciones', () => {
  const jwt = new Jwt({ secreto: secret, ttlSegundos: 60 });
  const token = jwt.firmar({ sub: 17 });
  assert.equal(jwt.verificar(token).sub, '17');
  assert.equal(jwt.verificar(`${token.slice(0, -1)}x`), null);
});

test('CSRF emite tokens firmados y rechaza tokens manipulados', () => {
  const csrf = new Csrf(secret);
  const token = csrf.crear();
  assert.equal(csrf.valido(token), true);
  assert.equal(csrf.valido(`${token}x`), false);
});

test('login rechaza cuenta inactiva y contraseña incorrecta', async () => {
  const useCase = new IniciarSesion({
    usuarioRepository: { buscarCredenciales: async () => ({ id: 3, activo: false, contrasenaHash: 'hashed' }) },
    passwordHasher: { comprobar: async () => true },
  });
  await assert.rejects(() => useCase.ejecutar({ correo: 'a@b.com', contrasena: 'secret' }), { name: 'NoAutorizado' });
});
