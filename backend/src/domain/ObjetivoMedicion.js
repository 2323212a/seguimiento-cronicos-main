import { ErrorDeDominio } from './errors.js';

const positivo = (v) => v == null || (Number.isFinite(Number(v)) && Number(v) > 0);
const ordenado = (min, max) => min == null || max == null || Number(min) <= Number(max);

export class ObjetivoMedicion {
  constructor(datos) {
    const { idPaciente, idMedico, tipoMedicion, contexto = null, indicacionPaciente } = datos;
    if (!Number.isInteger(Number(idPaciente)) || Number(idPaciente) < 1) throw new ErrorDeDominio('Paciente no válido');
    if (!Number.isInteger(Number(idMedico)) || Number(idMedico) < 1) throw new ErrorDeDominio('Médico no válido');
    if (!['glucosa', 'presion_arterial'].includes(tipoMedicion)) throw new ErrorDeDominio('Tipo de medición no válido');
    if (contexto != null && (typeof contexto !== 'string' || contexto.trim().length > 50)) throw new ErrorDeDominio('Contexto no válido');
    if (typeof indicacionPaciente !== 'string' || !indicacionPaciente.trim() || indicacionPaciente.trim().length > 2000) {
      throw new ErrorDeDominio('La indicación escrita por el médico es obligatoria y debe tener hasta 2000 caracteres');
    }

    const valores = {
      glucosaMin: datos.glucosaMin ?? null, glucosaMax: datos.glucosaMax ?? null,
      sistolicaMin: datos.sistolicaMin ?? null, sistolicaMax: datos.sistolicaMax ?? null,
      diastolicaMin: datos.diastolicaMin ?? null, diastolicaMax: datos.diastolicaMax ?? null,
    };
    const camposGlucosa = [valores.glucosaMin, valores.glucosaMax];
    const camposPresion = [valores.sistolicaMin, valores.sistolicaMax, valores.diastolicaMin, valores.diastolicaMax];
    if (tipoMedicion === 'glucosa') {
      if (camposGlucosa.every((v) => v == null) || camposPresion.some((v) => v != null)
        || !camposGlucosa.every(positivo) || !ordenado(...camposGlucosa)) throw new ErrorDeDominio('Objetivo de glucosa no válido');
    } else if (camposGlucosa.some((v) => v != null) || camposPresion.every((v) => v == null)
      || !camposPresion.every(positivo) || !ordenado(valores.sistolicaMin, valores.sistolicaMax)
      || !ordenado(valores.diastolicaMin, valores.diastolicaMax)) {
      throw new ErrorDeDominio('Objetivo de presión arterial no válido');
    }

    const inicio = datos.vigenteDesde ? new Date(datos.vigenteDesde) : new Date();
    if (Number.isNaN(inicio.getTime())) throw new ErrorDeDominio('Fecha de inicio no válida');
    Object.assign(this, { idPaciente: Number(idPaciente), idMedico: Number(idMedico), tipoMedicion,
      contexto: contexto?.trim() || null, ...Object.fromEntries(Object.entries(valores).map(([k,v]) => [k, v == null ? null : Number(v)])),
      indicacionPaciente: indicacionPaciente.trim(), vigenteDesde: inicio.toISOString().slice(0,10) });
  }
}
