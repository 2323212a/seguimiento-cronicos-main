import { NoEncontrado, ErrorDeDominio } from '../../domain/errors.js';
import { TipoMedicion } from '../../domain/Medicion.js';

export class ConsultarHistorial {
  constructor({ pacienteRepository, medicionRepository }) {
    Object.assign(this, { pacienteRepository, medicionRepository });
  }

  async ejecutar({ idPaciente, tipo, desde, hasta, usuarioId = null, rol = null }) {
    if (!(await this.pacienteRepository.buscarPorId(idPaciente))) {
      throw new NoEncontrado('Paciente no encontrado');
    }
    if (tipo && !Object.values(TipoMedicion).includes(tipo)) {
      throw new ErrorDeDominio(`Tipo de medición no válido: ${tipo}`);
    }
    for (const [nombre, valor] of [['desde', desde], ['hasta', hasta]]) {
      if (valor && Number.isNaN(new Date(valor).getTime())) {
        throw new ErrorDeDominio(`La fecha '${nombre}' no es válida`);
      }
    }
    return this.medicionRepository.listarPorPaciente(idPaciente, { tipo, desde, hasta, usuarioId, rol });
  }
}
