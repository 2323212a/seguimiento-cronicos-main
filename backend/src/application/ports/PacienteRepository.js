// Puerto de salida: contrato que deben cumplir los adaptadores de persistencia.
export class PacienteRepository {
  /** Crea usuario + paciente de forma atómica. Devuelve el Paciente con ids. */
  async registrar(_usuario, _paciente) { throw new Error('No implementado'); }
  async buscarPorId(_idPaciente) { throw new Error('No implementado'); }
  async buscarIdActivoPorTelegramChatId(_chatId) { throw new Error('No implementado'); }
  async existeCorreo(_correo) { throw new Error('No implementado'); }
}
