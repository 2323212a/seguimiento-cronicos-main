// Puerto: decide si una medición requiere alerta.
// Los criterios clínicos deben definirse con asesoría médica; por eso es un puerto
// y no una regla fija dentro del dominio.
export class EvaluadorDeAlertas {
  /** Devuelve una lista de alertas evaluadas contra objetivos individuales configurados. */
  async evaluar(_medicion, _transaccion) { throw new Error('No implementado'); }
}
