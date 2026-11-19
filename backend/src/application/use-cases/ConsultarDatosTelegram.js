import { ErrorDeDominio } from '../../domain/errors.js';

const SECCIONES = new Set(['perfil', 'mediciones', 'medicamentos', 'alertas', 'diagnosticos', 'objetivos']);

export class ConsultarDatosTelegram {
  constructor({ pacienteRepository, medicionRepository, medicamentoRepository, alertaRepository,
    diagnosticoRepository, objetivoMedicionRepository }) {
    Object.assign(this, { pacienteRepository, medicionRepository, medicamentoRepository, alertaRepository,
      diagnosticoRepository, objetivoMedicionRepository });
  }

  async ejecutar({ chatId, seccion }) {
    const idChat = String(chatId ?? '');
    if (!/^\d{1,20}$/.test(idChat)) throw new ErrorDeDominio('Chat de Telegram no válido');
    if (!SECCIONES.has(seccion)) throw new ErrorDeDominio('Consulta de Telegram no válida');

    const paciente = await this.pacienteRepository.buscarVinculadoPorTelegramChatId(idChat);
    if (!paciente) return { vinculada: false };
    const idPaciente = Number(paciente.id);
    const actor = { usuarioId: Number(paciente.idUsuario), rol: 'paciente' };

    if (seccion === 'perfil') return { vinculada: true, perfil: {
      nombre: [paciente.nombre, paciente.apellidoPaterno, paciente.apellidoMaterno].filter(Boolean).join(' '),
      fechaNacimiento: paciente.fechaNacimiento,
      telefono: paciente.telefono,
      telegramVerificado: paciente.telegramVerificado,
    } };
    if (seccion === 'mediciones') return { vinculada: true, mediciones: (await this.medicionRepository
      .listarPorPaciente(idPaciente, actor)).slice(0, 10) };
    if (seccion === 'medicamentos') return { vinculada: true, medicamentos: (await this.medicamentoRepository
      .listarPorPaciente(idPaciente, actor)).slice(0, 10) };
    if (seccion === 'alertas') return { vinculada: true, alertas: (await this.alertaRepository
      .listarPorPaciente(idPaciente, actor)).slice(0, 10) };
    if (seccion === 'diagnosticos') return { vinculada: true, diagnosticos: (await this.diagnosticoRepository
      .listar(idPaciente, actor.usuarioId, actor.rol)).slice(0, 10) };
    return { vinculada: true, objetivos: (await this.objetivoMedicionRepository
      .listarParaPaciente(idPaciente, { actorId: actor.usuarioId, rol: actor.rol })).slice(0, 10) };
  }
}
