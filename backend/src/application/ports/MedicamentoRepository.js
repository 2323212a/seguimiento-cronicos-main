export class MedicamentoRepository {
  async guardar(_medicamento) { throw new Error('No implementado'); }
  async listarPorPaciente(_idPaciente) { throw new Error('No implementado'); }
  /** Horarios activos que coinciden con `hora` (HH:MM), con datos para notificar por Telegram. */
  async listarRecordatorios(_hora) { throw new Error('No implementado'); }
}
