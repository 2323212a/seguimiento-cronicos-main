import { NoAutorizado } from '../../domain/errors.js';

export class IniciarSesion {
  constructor({ usuarioRepository, passwordHasher }) { Object.assign(this, { usuarioRepository, passwordHasher }); }
  async ejecutar({ correo, contrasena }) {
    const usuario = await this.usuarioRepository.buscarCredenciales(String(correo ?? '').trim().toLowerCase());
    const valido = usuario && await this.passwordHasher.comprobar(contrasena ?? '', usuario.contrasenaHash);
    if (!valido || !usuario.activo) throw new NoAutorizado('Correo o contraseña incorrectos, o cuenta inactiva');
    const { contrasenaHash, ...publico } = usuario;
    return publico;
  }
}
