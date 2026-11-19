import { EvaluadorDeAlertas } from '../../application/ports/EvaluadorDeAlertas.js';
import { evaluarObjetivoMedicion } from '../../domain/EvaluarObjetivoMedicion.js';

export class EvaluadorObjetivoIndividual extends EvaluadorDeAlertas {
  constructor({ objetivoMedicionRepository }) { super(); this.objetivos = objetivoMedicionRepository; }
  async evaluar(medicion, client) {
    const objetivo = await this.objetivos.listarAplicable(client, medicion);
    if (!objetivo) return { resultado: 'sin_objetivo_vigente', codigoCriterio: null, versionCriterio: null, condicionAplicada: null, evaluaciones: [{ mecanismo: 'objetivo_individual', resultado: 'sin_objetivo_vigente', codigoCriterio: null, versionCriterio: null, condicionAplicada: null }], alertas: [] };
    const alerta = evaluarObjetivoMedicion(medicion, objetivo);
    const evaluacion = { mecanismo: 'objetivo_individual', resultado: alerta ? 'fuera_objetivo' : 'dentro_objetivo',
      codigoCriterio: `objetivo:${objetivo.id_objetivo}`, versionCriterio: 'objetivo-individual-v1', condicionAplicada: { idObjetivo: Number(objetivo.id_objetivo) } };
    return { ...evaluacion,
      evaluaciones: [evaluacion],
      alertas: alerta ? [alerta] : [] };
  }
}
