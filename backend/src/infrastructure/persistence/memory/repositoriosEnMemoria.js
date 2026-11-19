import { PacienteRepository } from '../../../application/ports/PacienteRepository.js';
import { MedicionRepository } from '../../../application/ports/MedicionRepository.js';
import { MedicamentoRepository } from '../../../application/ports/MedicamentoRepository.js';
import { AlertaRepository } from '../../../application/ports/AlertaRepository.js';
import { NotificacionRepository } from '../../../application/ports/NotificacionRepository.js';
import { PublicadorDeEventos } from '../../../application/ports/PublicadorDeEventos.js';

export class PacienteEnMemoria extends PacienteRepository {
  constructor() { super(); this.pacientes = []; this.correos = new Set(); this.usuarios = []; }
  async registrar(usuario, paciente) {
    this.correos.add(usuario.correo);
    this.usuarios.push({ ...usuario });
    paciente.id = this.pacientes.length + 1;
    paciente.idUsuario = paciente.id;
    this.pacientes.push(paciente);
    return paciente;
  }
  async buscarPorId(id) { return this.pacientes.find((p) => p.id === Number(id)) ?? null; }
  async buscarIdActivoPorTelegramChatId(chatId) {
    const paciente = this.pacientes.find((p) => p.telegramChatId === String(chatId) && p.telegramVerificado);
    return paciente?.id ?? null;
  }
  async existeCorreo(correo) { return this.correos.has(correo); }
}

export class MedicionEnMemoria extends MedicionRepository {
  constructor() { super(); this.items = []; this.eventosOutbox = []; }
  async guardar(m) { m.id = this.items.length + 1; this.items.push(m); return m; }
  async guardarConAlertaYEvento(m, evaluador, evento) {
    const medicion = await this.guardar(m);
    const valor = evaluador?.evaluar ? await evaluador.evaluar(medicion) : evaluador;
    const alertasResultantes = Array.isArray(valor) ? valor : (valor?.alertas ?? (valor ? [valor] : []));
    const alertas = alertasResultantes.map((resultado, indice) => ({ id: indice + 1, idPaciente: medicion.idPaciente,
      idMedicion: medicion.id, ...resultado, estado: 'generada' }));
    if (evento && alertas.length) this.eventosOutbox.push(evento);
    return { medicion, alerta: alertas[0] ?? null, alertas };
  }
  async listarPorPaciente(idPaciente, { tipo, desde, hasta } = {}) {
    return this.items
      .filter((m) => m.idPaciente === Number(idPaciente))
      .filter((m) => !tipo || m.tipo === tipo)
      .filter((m) => !desde || m.fechaHora >= new Date(desde))
      .filter((m) => !hasta || m.fechaHora <= new Date(hasta))
      .sort((a, b) => b.fechaHora - a.fechaHora);
  }
}

export class MedicamentoEnMemoria extends MedicamentoRepository {
  constructor(pacienteRepository = null) { super(); this.items = []; this.pacienteRepository = pacienteRepository; }
  async guardar(m) { m.id = this.items.length + 1; this.items.push(m); return m; }
  async listarPorPaciente(idPaciente) { return this.items.filter((m) => m.idPaciente === Number(idPaciente)); }
  async listarRecordatorios(hora) {
    const resultado = [];
    for (const m of this.items.filter((x) => x.horarios.includes(hora))) {
      const p = await this.pacienteRepository?.buscarPorId(m.idPaciente);
      if (p?.telegramChatId) {
        resultado.push({
          idHorario: null, hora, idMedicamento: m.id, medicamento: m.nombre, dosis: m.dosis,
          idPaciente: p.id, paciente: p.nombre, telegramChatId: p.telegramChatId,
        });
      }
    }
    return resultado;
  }
}

export class NotificacionEnMemoria extends NotificacionRepository {
  constructor() { super(); this.items = []; }
  async guardar(n) { const nueva = { id: this.items.length + 1, ...n }; this.items.push(nueva); return nueva; }
}

export class PublicadorEnMemoria extends PublicadorDeEventos {
  constructor() { super(); this.eventos = []; }
  async publicar(e) { this.eventos.push(e); }
}

export class AlertaEnMemoria extends AlertaRepository {
  constructor() { super(); this.items = []; }
  async guardar(a) { const alerta = { id: this.items.length + 1, estado: 'generada', ...a }; this.items.push(alerta); return alerta; }
  async tienePendientes(idPaciente) { return this.items.some((a) => a.idPaciente === Number(idPaciente) && ['generada', 'notificada'].includes(a.estado)); }
}
