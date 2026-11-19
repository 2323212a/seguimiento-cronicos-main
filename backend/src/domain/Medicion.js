import { ErrorDeDominio } from './errors.js';

export const TipoMedicion = Object.freeze({
  GLUCOSA: 'glucosa',
  PRESION_ARTERIAL: 'presion_arterial',
  HBA1C: 'hba1c',
});

const error = (mensaje, codigo) => { throw new ErrorDeDominio(mensaje, codigo); };
const esPositivo = (n) => typeof n === 'number' && Number.isFinite(n) && n > 0;
const conMaximoDosDecimales = (n) => Math.abs(n - Math.round(n * 100) / 100) < 1e-8;

export class Medicion {
  constructor({
    id = null, idPaciente, tipo, glucosaMgDl = null, sistolicaMmhg = null,
    diastolicaMmhg = null, hba1cPercent = null, contexto = null, fechaHora = new Date(), observaciones = null, unidad = null,
  }) {
    if (!Number.isInteger(Number(idPaciente)) || Number(idPaciente) <= 0) error('La medición requiere un paciente válido', 'paciente_invalido');

    if (tipo === TipoMedicion.GLUCOSA) {
      if (!esPositivo(glucosaMgDl)) error('La glucosa debe ser un número positivo', 'valor_no_numerico_o_positivo');
      if (glucosaMgDl > 9999.99) error('La glucosa excede la capacidad técnica del campo de almacenamiento', 'fuera_capacidad_tecnica');
      if (!conMaximoDosDecimales(glucosaMgDl)) error('La glucosa admite hasta dos decimales', 'precision_no_valida');
      if (unidad != null && unidad !== 'mg/dL') error('La unidad para glucosa debe ser mg/dL', 'unidad_no_valida');
      if (sistolicaMmhg != null || diastolicaMmhg != null || hba1cPercent != null) {
        error('Una medición de glucosa no lleva valores de presión', 'campos_incompatibles');
      }
    } else if (tipo === TipoMedicion.PRESION_ARTERIAL) {
      if (!Number.isInteger(sistolicaMmhg) || !Number.isInteger(diastolicaMmhg)) error('La presión requiere valores enteros para sistólica y diastólica', 'precision_no_valida');
      if (!esPositivo(sistolicaMmhg) || !esPositivo(diastolicaMmhg)) error('La presión requiere sistólica y diastólica positivas', 'valor_no_numerico_o_positivo');
      if (sistolicaMmhg > 32767 || diastolicaMmhg > 32767) error('La presión excede la capacidad técnica del campo de almacenamiento', 'fuera_capacidad_tecnica');
      if (unidad != null && unidad !== 'mmHg') error('La unidad para presión arterial debe ser mmHg', 'unidad_no_valida');
      if (sistolicaMmhg <= diastolicaMmhg) {
        error('La sistólica debe ser mayor que la diastólica', 'relacion_presion_invalida');
      }
      if (glucosaMgDl != null) error('Una medición de presión no lleva glucosa', 'campos_incompatibles');
      if (hba1cPercent != null) error('Una medición de presión no lleva HbA1c', 'campos_incompatibles');
    } else if (tipo === TipoMedicion.HBA1C) {
      if (!esPositivo(hba1cPercent)) error('HbA1c debe ser un número positivo', 'valor_no_numerico_o_positivo');
      if (hba1cPercent > 999.99) error('HbA1c excede la capacidad técnica del campo de almacenamiento', 'fuera_capacidad_tecnica');
      if (!conMaximoDosDecimales(hba1cPercent)) error('HbA1c admite hasta dos decimales', 'precision_no_valida');
      if (unidad != null && unidad !== '%') error('La unidad para HbA1c debe ser %', 'unidad_no_valida');
      if (glucosaMgDl != null || sistolicaMmhg != null || diastolicaMmhg != null) error('HbA1c no lleva otros valores de medición', 'campos_incompatibles');
    } else {
      error(`Tipo de medición no válido: ${tipo}`, 'tipo_medicion_invalido');
    }

    if (contexto != null && (typeof contexto !== 'string' || contexto.length > 50)) error('El contexto debe ser texto de hasta 50 caracteres', 'contexto_invalido');
    if (observaciones != null && typeof observaciones !== 'string') error('Las observaciones deben ser texto', 'observaciones_invalidas');

    const fecha = new Date(fechaHora);
    if (Number.isNaN(fecha.getTime())) error('La fecha de la medición no es válida', 'fecha_hora_invalida');
    if (fecha.getTime() > Date.now() + 5 * 60 * 1000) {
      error('La fecha de la medición no puede ser futura', 'fecha_hora_futura');
    }

    Object.assign(this, {
      id, idPaciente, tipo, glucosaMgDl, sistolicaMmhg, diastolicaMmhg, hba1cPercent,
      contexto, fechaHora: fecha, observaciones,
    });
  }
}
