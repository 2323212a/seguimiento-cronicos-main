import { NoEncontrado } from '../../domain/errors.js';

export class ConsultarMedicamentos {
  constructor({ pacienteRepository, medicamentoRepository }) {
    Object.assign(this, { pacienteRepository, medicamentoRepository });
  }

  async ejecutar({ idPaciente, usuarioId = null, rol = null }) {
    if (!(await this.pacienteRepository.buscarPorId(idPaciente))) {
      throw new NoEncontrado('Paciente no encontrado');
    }
    return this.medicamentoRepository.listarPorPaciente(idPaciente, { usuarioId, rol });
  }
}
