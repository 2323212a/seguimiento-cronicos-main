import { Paciente } from '../../domain/Paciente.js';
import { Conflicto, ErrorDeDominio } from '../../domain/errors.js';

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class RegistrarPaciente {
  constructor({ pacienteRepository, passwordHasher }) {
    this.pacienteRepository = pacienteRepository;
    this.passwordHasher = passwordHasher;
  }

  async ejecutar({ correo, contrasena, ...datosPaciente }) {
    if (!CORREO.test(correo ?? '')) throw new ErrorDeDominio('El correo no es válido');
    if (typeof contrasena !== 'string' || contrasena.length < 8) {
      throw new ErrorDeDominio('La contraseña debe tener al menos 8 caracteres');
    }
    // El chat se vincula después con código de un solo uso; no aceptar IDs sin verificar.
    const paciente = new Paciente({ ...datosPaciente, telegramChatId: null, telegramVerificado: false });

    const correoNormalizado = correo.trim().toLowerCase();
    if (await this.pacienteRepository.existeCorreo(correoNormalizado)) {
      throw new Conflicto('Ya existe una cuenta con ese correo');
    }

    const contrasenaHash = await this.passwordHasher.hash(contrasena);
    return this.pacienteRepository.registrar(
      { correo: correoNormalizado, contrasenaHash, rol: 'paciente', activo: false },
      paciente,
    );
  }
}
