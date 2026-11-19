import { EvaluadorDeAlertas } from '../../application/ports/EvaluadorDeAlertas.js';

/** Adaptador nulo reservado para pruebas y despliegues sin objetivos individuales. */
export class EvaluadorDeAlertasPendiente extends EvaluadorDeAlertas {
  async evaluar() { return []; }
}
