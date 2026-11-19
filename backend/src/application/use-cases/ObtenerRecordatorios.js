import { ErrorDeDominio } from '../../domain/errors.js';

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

export class ObtenerRecordatorios {
  constructor({ medicamentoRepository }) { this.medicamentoRepository = medicamentoRepository; }

  async ejecutar({ hora } = {}) {
    const horaConsulta = hora ?? new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    if (!HORA.test(horaConsulta)) throw new ErrorDeDominio('La hora debe tener formato HH:MM');
    return this.medicamentoRepository.listarRecordatorios(horaConsulta);
  }
}
