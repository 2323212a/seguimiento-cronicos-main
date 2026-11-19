export class MedicionRepository {
  async guardar(_medicion) { throw new Error('No implementado'); }
  /** filtros: { tipo?, desde?, hasta? } */
  async listarPorPaciente(_idPaciente, _filtros) { throw new Error('No implementado'); }
}
