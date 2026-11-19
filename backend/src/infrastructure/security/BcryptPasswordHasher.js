import bcrypt from 'bcryptjs';
import { PasswordHasher } from '../../application/ports/PasswordHasher.js';

export class BcryptPasswordHasher extends PasswordHasher {
  async hash(textoPlano) { return bcrypt.hash(textoPlano, 10); }
  async comprobar(textoPlano, hash) { return bcrypt.compare(textoPlano, hash); }
}
