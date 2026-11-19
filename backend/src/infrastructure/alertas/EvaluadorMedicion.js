import { EvaluadorDeAlertas } from '../../application/ports/EvaluadorDeAlertas.js';

export class EvaluadorMedicion extends EvaluadorDeAlertas {
  constructor({ seguridad, objetivoIndividual, seguridadActiva = true, objetivosActivos = true }) {
    super(); Object.assign(this, { seguridad, objetivoIndividual, seguridadActiva, objetivosActivos });
  }
  async evaluar(medicion, client) {
    const seguridad = this.seguridadActiva
      ? await this.seguridad.evaluar(medicion, client) : { alertas: [], evaluaciones: [] };
    const objetivo = this.objetivosActivos
      ? await this.objetivoIndividual.evaluar(medicion, client) : { alertas: [], evaluaciones: [] };
    return {
      alertas: [...(seguridad.alertas ?? []), ...(objetivo.alertas ?? [])],
      evaluaciones: [
        ...(seguridad.evaluaciones ?? [{ resultado: seguridad.resultado, codigoCriterio: null, versionCriterio: null, condicionAplicada: null }])
          .map((x) => ({ ...x, mecanismo: 'seguridad' })),
        ...(objetivo.evaluaciones ?? [{ mecanismo: 'objetivo_individual', resultado: objetivo.resultado, codigoCriterio: objetivo.codigoCriterio,
          versionCriterio: objetivo.versionCriterio, condicionAplicada: objetivo.condicionAplicada }]),
      ],
    };
  }
}
