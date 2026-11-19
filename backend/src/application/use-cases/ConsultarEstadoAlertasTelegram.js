export class ConsultarEstadoAlertasTelegram {
  constructor({ pacienteRepository, alertaRepository }) {
    Object.assign(this, { pacienteRepository, alertaRepository });
  }

  async ejecutar(chatId) {
    const idPaciente = await this.pacienteRepository.buscarIdActivoPorTelegramChatId(String(chatId ?? ''));
    if (!idPaciente) return { vinculada: false, tieneAlertasPendientes: false };
    return {
      vinculada: true,
      tieneAlertasPendientes: await this.alertaRepository.tienePendientes(idPaciente),
    };
  }
}
