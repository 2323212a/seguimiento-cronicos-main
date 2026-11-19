import { ErrorDeDominio, NoEncontrado } from '../../domain/errors.js';

const TIPOS = ['recordatorio', 'alerta', 'confirmacion'];
const ESTADOS = ['pendiente', 'enviado', 'fallido'];

export class RegistrarNotificacion {
  constructor({ pacienteRepository, notificacionRepository }) {
    Object.assign(this, { pacienteRepository, notificacionRepository });
  }

  async ejecutar({ idPaciente, idAlerta, idHorario, tipo, canal = 'telegram', mensaje, estadoEnvio = 'enviado' }) {
    if (!TIPOS.includes(tipo)) throw new ErrorDeDominio(`Tipo de notificación no válido: ${tipo}`);
    if (!ESTADOS.includes(estadoEnvio)) throw new ErrorDeDominio(`Estado de envío no válido: ${estadoEnvio}`);
    if (!mensaje?.trim()) throw new ErrorDeDominio('El mensaje es obligatorio');
    if (!(await this.pacienteRepository.buscarPorId(idPaciente))) throw new NoEncontrado('Paciente no encontrado');
    return this.notificacionRepository.guardar({ idPaciente, idAlerta, idHorario, tipo, canal, mensaje, estadoEnvio });
  }
}
