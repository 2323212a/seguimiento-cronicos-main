import { ErrorDeDominio } from './errors.js';

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

export class Medicamento {
  constructor({
    id = null, idPaciente, nombre, dosis, frecuencia, fechaInicio,
    fechaFin = null, observaciones = null, horarios = [],
  }) {
    if (!idPaciente) throw new ErrorDeDominio('El medicamento requiere un paciente');
    if (!nombre?.trim()) throw new ErrorDeDominio('El nombre del medicamento es obligatorio');
    if (!dosis?.trim()) throw new ErrorDeDominio('La dosis es obligatoria');
    if (!frecuencia?.trim()) throw new ErrorDeDominio('La frecuencia es obligatoria');

    const inicio = new Date(fechaInicio);
    if (Number.isNaN(inicio.getTime())) throw new ErrorDeDominio('La fecha de inicio no es válida');
    let fin = null;
    if (fechaFin) {
      fin = new Date(fechaFin);
      if (Number.isNaN(fin.getTime())) throw new ErrorDeDominio('La fecha de fin no es válida');
      if (fin < inicio) throw new ErrorDeDominio('La fecha de fin no puede ser anterior al inicio');
    }
    for (const h of horarios) {
      if (!HORA.test(h)) throw new ErrorDeDominio(`Horario no válido (use HH:MM): ${h}`);
    }

    Object.assign(this, {
      id, idPaciente, nombre: nombre.trim(), dosis: dosis.trim(), frecuencia: frecuencia.trim(),
      fechaInicio: inicio, fechaFin: fin, observaciones, horarios: [...new Set(horarios)],
    });
  }
}
