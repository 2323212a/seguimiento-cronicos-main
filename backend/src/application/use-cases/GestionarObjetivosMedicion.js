import { ObjetivoMedicion } from '../../domain/ObjetivoMedicion.js';

export class GestionarObjetivosMedicion {
  constructor({ objetivoMedicionRepository }) { this.repository = objetivoMedicionRepository; }
  crear(datos, actorId) {
    return this.repository.crear(new ObjetivoMedicion({ ...datos, idMedico: actorId }));
  }
  listar({ idPaciente, actorId, rol }) {
    return this.repository.listarParaPaciente(idPaciente, { actorId, rol });
  }
}
