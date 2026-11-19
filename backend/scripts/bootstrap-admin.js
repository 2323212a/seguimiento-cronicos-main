import 'dotenv/config';
import { Database } from '../src/infrastructure/persistence/postgres/Database.js';
import { PgUsuarioRepository } from '../src/infrastructure/persistence/postgres/PgUsuarioRepository.js';
import { BcryptPasswordHasher } from '../src/infrastructure/security/BcryptPasswordHasher.js';

const correo = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
const contrasena = process.env.BOOTSTRAP_ADMIN_PASSWORD;
if (!correo || !contrasena || contrasena.length < 12) {
  throw new Error('Define BOOTSTRAP_ADMIN_EMAIL y BOOTSTRAP_ADMIN_PASSWORD (mínimo 12 caracteres) desde un gestor seguro.');
}

const db = Database.getInstance();
try {
  const repo = new PgUsuarioRepository(db);
  const passwordHasher = new BcryptPasswordHasher();
  const cuenta = await repo.bootstrapPrimerAdministrador({
    correo,
    contrasenaHash: await passwordHasher.hash(contrasena),
  });
  console.log(`Administrador inicial creado (id ${cuenta.id}). Retira las variables de bootstrap.`);
} finally {
  await db.cerrar();
}
