import { randomUUID } from 'node:crypto';
import { Medicion } from '../../domain/Medicion.js';
import { ErrorDeDominio, NoEncontrado } from '../../domain/errors.js';

export class RegistrarMedicion {
  constructor({ pacienteRepository, medicionRepository, evaluadorDeAlertas, alertasBackendActivas = true }) {
    Object.assign(this, { pacienteRepository, medicionRepository, evaluadorDeAlertas, alertasBackendActivas });
  }

  async ejecutar(datos, usuarioActorId = null) {
    const paciente = await this.pacienteRepository.buscarPorId(datos.idPaciente);
    if (!paciente) throw new NoEncontrado('Paciente no encontrado');

    try {
      const medicion = new Medicion(datos);
      const evaluador = this.alertasBackendActivas ? this.evaluadorDeAlertas : null;
      const evento = evaluador ? {
        eventId: randomUUID(), tipo: 'alerta.generada', fecha: new Date().toISOString(),
        agregado: { tipo: 'paciente', id: paciente.id }, datos: { plantilla: 'actualizacion_disponible' },
      } : null;
      return await this.medicionRepository.guardarConAlertaYEvento(medicion, evaluador, evento, { usuarioActorId });
    } catch (error) {
      if (error instanceof ErrorDeDominio && error.codigo !== 'datos_no_validos' && usuarioActorId && this.medicionRepository.registrarRechazoTecnico) {
        await this.medicionRepository.registrarRechazoTecnico({ idPaciente: paciente.id, idUsuario: usuarioActorId, codigo: error.codigo });
      }
      throw error;
    }
  }
}
