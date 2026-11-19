import { EvaluadorDeAlertas } from '../../application/ports/EvaluadorDeAlertas.js';

const camposAdmitidos = new Set(['glucosaMgDl', 'sistolicaMmhg', 'diastolicaMmhg', 'hba1cPercent']);
const operadores = Object.freeze({
  gt: (a, b) => a > b, gte: (a, b) => a >= b,
  lt: (a, b) => a < b, lte: (a, b) => a <= b,
});

export function coincideCriterioSeguridad(medicion, condicion) {
  if (!Array.isArray(condicion?.any) || condicion.any.length < 1 || condicion.any.length > 20) return false;
  if (condicion.contexto != null) {
    if (typeof condicion.contexto !== 'string' || !condicion.contexto.trim()) return false;
    const normalizarContexto = (valor) => String(valor ?? '').trim().toLocaleLowerCase('es-MX');
    if (normalizarContexto(medicion.contexto) !== normalizarContexto(condicion.contexto)) return false;
  }
  return condicion.any.some((regla) => {
    const valor = medicion[regla.campo]; const comparar = operadores[regla.operador];
    const tipoCompatible = (medicion.tipo === 'glucosa' && regla.campo === 'glucosaMgDl')
      || (medicion.tipo === 'presion_arterial' && ['sistolicaMmhg', 'diastolicaMmhg'].includes(regla.campo))
      || (medicion.tipo === 'hba1c' && regla.campo === 'hba1cPercent');
    return tipoCompatible && camposAdmitidos.has(regla.campo) && typeof valor === 'number' && Number.isFinite(valor)
      && typeof regla.valor === 'number' && Number.isFinite(regla.valor) && comparar?.(valor, regla.valor) === true;
  });
}

export class EvaluadorSeguridadAprobada extends EvaluadorDeAlertas {
  constructor({ criterioSeguridadRepository }) { super(); this.repository = criterioSeguridadRepository; }

  async evaluar(medicion, client) {
    const criterios = await this.repository.listarAprobadosActivos(client, medicion);
    if (!criterios.length) return { resultado: 'sin_criterios_aprobados', evaluaciones: [], alertas: [] };
    const evaluaciones = []; const alertas = [];
    for (const criterio of criterios) {
      if (!coincideCriterioSeguridad(medicion, criterio.condicion)) {
        evaluaciones.push({ mecanismo: 'seguridad', resultado: 'sin_criterio_aplicable', codigoCriterio: criterio.codigo,
          versionCriterio: criterio.version, condicionAplicada: criterio.condicion });
        continue;
      }
      evaluaciones.push({ mecanismo: 'seguridad', resultado: 'alerta_generada', codigoCriterio: criterio.codigo,
        versionCriterio: criterio.version, condicionAplicada: criterio.condicion });
      alertas.push({ tipo: 'seguridad_medicion', clasificacion: 'seguridad', idVersionCriterio: criterio.id,
        codigoCriterio: criterio.codigo, versionCriterio: criterio.version, condicionAplicada: criterio.condicion,
        padecimientoPosible: criterio.condicion.padecimientoPosible ?? null,
        motivo: criterio.mensajeOrientacion, indicacionPaciente: criterio.mensajeOrientacion });
    }
    return { resultado: 'evaluado', evaluaciones, alertas };
  }
}
