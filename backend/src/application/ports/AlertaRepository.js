export class AlertaRepository {
  /** { idPaciente, idMedicion, tipo, motivo } */
  async guardar(_alerta) { throw new Error('No implementado'); }
  async tienePendientes(_idPaciente) { throw new Error('No implementado'); }
}
