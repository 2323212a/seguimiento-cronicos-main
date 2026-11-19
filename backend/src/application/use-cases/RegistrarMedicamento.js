import { Medicamento } from '../../domain/Medicamento.js';
import { NoEncontrado } from '../../domain/errors.js';

export class RegistrarMedicamento {
  constructor({ pacienteRepository, medicamentoRepository }) {
    Object.assign(this, { pacienteRepository, medicamentoRepository });
  }

  async ejecutar(datos, actorId = null) {
    if (!(await this.pacienteRepository.buscarPorId(datos.idPaciente))) {
      throw new NoEncontrado('Paciente no encontrado');
    }
    return this.medicamentoRepository.guardar(new Medicamento(datos), { actorId });
  }
}
