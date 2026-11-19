import { Conflicto } from './errors.js';

export const CapacidadEditorial = Object.freeze({ AUTOR:'autor', REVISOR:'revisor', COORDINADOR:'coordinador', PUBLICADOR:'publicador' });
export const TipoContenidoEditorial = Object.freeze({ CATALOGO:'catalogo_medicion', FUENTE:'fuente_clinica' });
export const EnfermedadEditorial = Object.freeze({ DM1:'diabetes_tipo_1', DM2:'diabetes_tipo_2', HIPERTENSION:'hipertension' });
export const PoblacionEditorial = Object.freeze({ ADOLESCENTE:'adolescente_13_17', ADULTO:'adulto_18_mas' });

const transicionesVersion = Object.freeze({
  borrador:['en_revision','cancelada'],
  en_revision:['aprobada','cancelada'],
  aprobada:['vigente','retirada','cancelada'],
  vigente:['sustituida','retirada'],
  sustituida:['retirada'],
  retirada:[], cancelada:[],
});

export class VersionCatalogo {
  constructor({ id, idCatalogo, estado, autorIdUsuario, tipoContenido, enfermedad=null, poblacion=null }) {
    if(!Object.values(TipoContenidoEditorial).includes(tipoContenido))throw new Conflicto('Tipo de contenido editorial no válido');
    if(enfermedad!==null&&!Object.values(EnfermedadEditorial).includes(enfermedad))throw new Conflicto('Enfermedad de alcance no válida');
    if(poblacion!==null&&!Object.values(PoblacionEditorial).includes(poblacion))throw new Conflicto('Población de alcance no válida');
    if(!Object.hasOwn(transicionesVersion,estado))throw new Conflicto('Estado de versión no válido');
    Object.assign(this,{id,idCatalogo,estado,autorIdUsuario,tipoContenido,enfermedad,poblacion});
  }
  puedeTransicionarA(nuevoEstado) { return transicionesVersion[this.estado].includes(nuevoEstado); }
  exigirTransicion(nuevoEstado) { if(!this.puedeTransicionarA(nuevoEstado))throw new Conflicto(`Transición de versión no permitida: ${this.estado} → ${nuevoEstado}`); }
}

export class AutorizacionEditorial {
  constructor({ idUsuario, capacidad, estado, vigenteDesde, vigenteHasta=null, revocadaEn=null, alcances=[] }) {
    if(!Object.values(CapacidadEditorial).includes(capacidad))throw new Conflicto('Capacidad editorial no válida');
    this.idUsuario=idUsuario; this.capacidad=capacidad; this.estado=estado;
    this.vigenteDesde=new Date(vigenteDesde); this.vigenteHasta=vigenteHasta?new Date(vigenteHasta):null;
    this.revocadaEn=revocadaEn; this.alcances=alcances;
  }
  permite({ usuarioActivo, capacidad, tipoContenido, idCatalogo=null, enfermedad=null, poblacion=null, ahora=new Date() }) {
    if(!usuarioActivo||this.estado!=='activa'||this.capacidad!==capacidad||this.revocadaEn)return false;
    const t=ahora.getTime();
    if(!Number.isFinite(this.vigenteDesde.getTime())||this.vigenteDesde.getTime()>t||
      (this.vigenteHasta&&this.vigenteHasta.getTime()<=t))return false;
    return this.alcances.some(a=>a.tipoContenido===tipoContenido&&(a.idCatalogo==null||Number(a.idCatalogo)===Number(idCatalogo))
      &&(a.enfermedad==null||a.enfermedad===enfermedad)&&(a.poblacion==null||a.poblacion===poblacion));
  }
}

export class PoliticaPublicacionCatalogo {
  constructor({ aprobacionesRequeridas=2 }={}) {
    if(!Number.isInteger(aprobacionesRequeridas)||aprobacionesRequeridas<2)throw new Conflicto('La política requiere al menos dos revisiones independientes');
    this.aprobacionesRequeridas=aprobacionesRequeridas;
  }
  resultadoRonda(decisiones) {
    if(decisiones.some(x=>x.decision==='rechazada'||x.decision==='requiere_cambios'))return 'cancelada';
    if(decisiones.filter(x=>x.decision==='aprobada').length>=this.aprobacionesRequeridas)return 'aprobada';
    return 'en_revision';
  }
  validar({ version, ronda, decisiones, usuarios, fuentes, actorId }) {
    if(version.estado!=='aprobada'||ronda.estado!=='cerrada')throw new Conflicto('La versión requiere ronda cerrada y estado aprobado');
    const aprobadas=decisiones.filter(x=>x.decision==='aprobada');
    if(aprobadas.length<this.aprobacionesRequeridas||new Set(aprobadas.map(x=>Number(x.id_revisor))).size<this.aprobacionesRequeridas)throw new Conflicto(`Se requieren ${this.aprobacionesRequeridas} aprobaciones de revisores distintos`);
    if(decisiones.some(x=>x.decision==='rechazada'||x.decision==='requiere_cambios'))throw new Conflicto('La ronda contiene rechazo o solicitud de cambios');
    if(decisiones.some(x=>x.revision_estado!=='completada'))throw new Conflicto('La ronda conserva revisiones pendientes');
    const ids=[Number(version.autor_id_usuario),Number(actorId),...decisiones.map(x=>Number(x.id_revisor))];
    if(new Set(ids).size!==ids.length)throw new Conflicto('Autor, revisores y publicador deben ser personas distintas');
    const activos=new Set(usuarios.filter(x=>x.activo).map(x=>Number(x.id_usuario)));
    if(ids.some(x=>!activos.has(x)))throw new Conflicto('Autor, revisores y publicador deben estar activos');
    if(!fuentes.length||fuentes.some(f=>f.estado_fuente!=='vigente'||!f.institucion_snapshot||!f.titulo_snapshot||!f.url_snapshot||!f.poblacion_snapshot||(!f.seccion&&!f.pagina)))throw new Conflicto('Se requieren fuentes vigentes con snapshots completos');
    return true;
  }
}

export function exigirCapacidad(capacidad) {
  if(!Object.values(CapacidadEditorial).includes(capacidad))throw new Conflicto('Capacidad editorial no válida');
}
