import { Diagnostico } from '../../domain/Diagnostico.js';

export class GestionarDiagnosticos {
  constructor({repository}) { this.repository=repository; }
  registrar(datos,actorId) { return this.repository.registrar(new Diagnostico(datos),actorId); }
  listar(idPaciente,actorId,rol) { return this.repository.listar(idPaciente,actorId,rol); }
  cerrar(idDiagnostico,idPaciente,actorId) { return this.repository.cerrar(idDiagnostico,idPaciente,actorId); }
}
