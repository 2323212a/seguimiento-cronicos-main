import { PublicarVersionCatalogo } from './PublicarVersionCatalogo.js';

const OPERACIONES = new Set([
  'listarCatalogos', 'crearCatalogo', 'crearVersion', 'registrarFuente', 'revisarFuente', 'asociarFuente',
  'concederAutorizacion', 'revocarAutorizacion', 'listarAutorizaciones', 'abrirRonda',
  'asignarRevisores', 'registrarDecision', 'cerrarRonda', 'publicarVersion',
  'retirarCatalogo', 'consultarAuditoria', 'consultarVersiones', 'consultarFuentes',
]);

export class GestionEditorialCatalogo {
  constructor({ catalogoEditorialRepository, publicarVersionCatalogo = new PublicarVersionCatalogo({ catalogoEditorialRepository }) }) {
    this.repository = catalogoEditorialRepository; this.publicarVersionCatalogo=publicarVersionCatalogo;
  }
  ejecutar(operacion, actorId, datos = {}) {
    if (!OPERACIONES.has(operacion)) throw new Error('Operación editorial no soportada');
    if(operacion==='publicarVersion')return this.publicarVersionCatalogo.ejecutar({...datos,actorId});
    return this.repository.ejecutar(operacion, { ...datos, actorId });
  }
}
