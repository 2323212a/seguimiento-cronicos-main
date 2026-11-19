const operaciones = new Set(['listar', 'crearBorrador', 'actualizarBorrador', 'enviarRevision', 'registrarDecision', 'devolverEdicion', 'activar', 'retirar']);

export class GestionarCriteriosSeguridad {
  constructor({ repository }) { this.repository = repository; }
  ejecutar(operacion, actorId, datos = {}) {
    if (!operaciones.has(operacion)) throw new Error('Operación de seguridad clínica no soportada');
    return this.repository.ejecutar(operacion, { ...datos, actorId });
  }
}
