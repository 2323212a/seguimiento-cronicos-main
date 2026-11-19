import { CatalogoEditorialRepository } from '../../../application/ports/CatalogoEditorialRepository.js';
import { Conflicto, NoAutorizado, NoEncontrado } from '../../../domain/errors.js';
import { AutorizacionEditorial, CapacidadEditorial, EnfermedadEditorial, PoblacionEditorial, PoliticaPublicacionCatalogo, TipoContenidoEditorial, VersionCatalogo } from '../../../domain/Editorial.js';

const CAPACIDADES = new Set(Object.values(CapacidadEditorial));
const TIPOS = new Set(Object.values(TipoContenidoEditorial));
const ENFERMEDADES = new Set(Object.values(EnfermedadEditorial));
const POBLACIONES = new Set(Object.values(PoblacionEditorial));
const porId = (x) => Number(x);
const requerido = (v,max,nombre) => {
  if(typeof v!=='string'||!v.trim()||v.trim().length>max)throw new Conflicto(`${nombre} es obligatorio y debe tener como máximo ${max} caracteres`);
  return v.trim();
};

export class PgCatalogoEditorialRepository extends CatalogoEditorialRepository {
  constructor(db, { politicaPublicacion = new PoliticaPublicacionCatalogo() } = {}) {
    super();
    this.db = db; this.politicaPublicacion = politicaPublicacion;
  }

  async ejecutar(operacion, datos) {
    const metodo = this[operacion];
    if (typeof metodo !== 'function' || ['constructor', 'ejecutar'].includes(operacion)) throw new Conflicto('Operación editorial no válida');
    try { return await metodo.call(this, datos); }
    catch(error) {
      if(['23505','23503','23514'].includes(error.code))throw new Conflicto('La operación editorial viola una regla de integridad');
      throw error;
    }
  }

  async #auditar(client, actorId, accion, entidad, idEntidad, detalles = {}) {
    await client.query(`INSERT INTO public.catalogo_auditoria(actor_id_usuario,accion,entidad,id_entidad,detalles)
      VALUES($1,$2,$3,$4,$5::jsonb)`, [actorId, accion, entidad, idEntidad, JSON.stringify(detalles)]);
  }

  #validarAlcances(alcances) {
    if (!Array.isArray(alcances) || !alcances.length) throw new Conflicto('Se requiere al menos un alcance editorial explícito');
    return alcances.map((a) => {
      if (!TIPOS.has(a.tipoContenido) || (a.enfermedad && !ENFERMEDADES.has(a.enfermedad)) || (a.poblacion && !POBLACIONES.has(a.poblacion))) throw new Conflicto('Alcance editorial no válido');
      if (a.idCatalogo != null && (!Number.isInteger(Number(a.idCatalogo)) || Number(a.idCatalogo) < 1)) throw new Conflicto('Catálogo de alcance no válido');
      return a;
    });
  }

  async #autorizacion(client, { usuarioId, capacidad, tipoContenido, idCatalogo = null, enfermedad = null, poblacion = null, idAutorizacion = null, lock = false }) {
    if (!CAPACIDADES.has(capacidad)) throw new Conflicto('Capacidad editorial no válida');
    if(lock) {
      const usuario=await client.query('SELECT activo FROM public.usuario WHERE id_usuario=$1 FOR UPDATE',[usuarioId]);
      if(!usuario.rows[0]?.activo)throw new NoAutorizado('La cuenta editorial debe estar activa');
    }
    const q = await client.query(`SELECT ae.id_autorizacion, ae.vigente_desde AS "vigenteDesde", ae.vigente_hasta AS "vigenteHasta", now() AS ahora,
        ae.id_usuario AS "idUsuario", ae.capacidad, ae.estado,
        u.activo AS usuario_activo, u.rol
      FROM public.autorizacion_editorial ae JOIN public.usuario u ON u.id_usuario=ae.id_usuario
      WHERE ae.id_usuario=$1 AND ae.capacidad=$2 AND ae.estado='activa'
        AND ($7::integer IS NULL OR ae.id_autorizacion=$7)
        AND ae.vigente_desde<=now() AND (ae.vigente_hasta IS NULL OR ae.vigente_hasta>now())
        AND u.activo AND EXISTS (
          SELECT 1 FROM public.alcance_editorial al WHERE al.id_autorizacion=ae.id_autorizacion
            AND al.tipo_contenido=$3 AND (al.id_catalogo IS NULL OR al.id_catalogo=$4)
            AND (al.enfermedad IS NULL OR al.enfermedad IS NOT DISTINCT FROM $5)
            AND (al.poblacion IS NULL OR al.poblacion IS NOT DISTINCT FROM $6))
      ORDER BY ae.id_autorizacion DESC LIMIT 1${lock ? ' FOR UPDATE OF ae' : ''}`,
    [usuarioId, capacidad, tipoContenido, idCatalogo, enfermedad, poblacion, idAutorizacion]);
    if (!q.rows[0]) throw new NoAutorizado(`Se requiere autorización editorial vigente: ${capacidad}`);
    const scopes=await client.query(`SELECT tipo_contenido AS "tipoContenido",id_catalogo AS "idCatalogo",enfermedad,poblacion FROM public.alcance_editorial WHERE id_autorizacion=$1`,[q.rows[0].id_autorizacion]);
    const grant=new AutorizacionEditorial({...q.rows[0],alcances:scopes.rows});
    if(!grant.permite({usuarioActivo:q.rows[0].usuario_activo,capacidad,tipoContenido,idCatalogo,enfermedad,poblacion,ahora:q.rows[0].ahora}))throw new NoAutorizado('El alcance editorial no coincide con la operación');
    return q.rows[0];
  }

  async listarCatalogos() {
    const { rows } = await this.db.query(`SELECT c.id_catalogo AS id,c.codigo,c.nombre,c.descripcion,c.unidad_base AS "unidadBase",c.estado,
      v.id_version AS "idVersion",v.numero_version AS "version",v.tipo_contenido AS "tipoContenido",v.enfermedad,v.poblacion,v.publicada_en AS "publicadaEn"
      FROM public.catalogo_medicion c LEFT JOIN public.version_catalogo v ON v.id_catalogo=c.id_catalogo AND v.estado='vigente'
      WHERE c.estado<>'retirado' ORDER BY c.codigo`);
    return rows;
  }

  async crearCatalogo({ actorId, codigo, nombre, descripcion = null, unidadBase = null }) {
    codigo=requerido(codigo,40,'Código'); nombre=requerido(nombre,120,'Nombre');
    if(!/^[a-z0-9_]+$/.test(codigo))throw new Conflicto('El código sólo admite minúsculas, números y guion bajo');
    return this.db.transaccion(async (c) => {
      await this.#autorizacion(c, { usuarioId: actorId, capacidad: 'autor', tipoContenido: 'catalogo_medicion', lock:true });
      const q = await c.query(`INSERT INTO public.catalogo_medicion(codigo,nombre,descripcion,unidad_base)
        VALUES($1,$2,$3,$4) RETURNING id_catalogo AS id,codigo,nombre,estado`, [codigo, nombre, descripcion, unidadBase]);
      await this.#auditar(c, actorId, 'crear', 'catalogo_medicion', q.rows[0].id);
      return q.rows[0];
    });
  }

  async crearVersion({ actorId, idCatalogo, numeroVersion, tipoContenido = 'catalogo_medicion', enfermedad = null, poblacion = null }) {
    numeroVersion=requerido(numeroVersion,40,'Versión');
    if (!TIPOS.has(tipoContenido) || (enfermedad && !ENFERMEDADES.has(enfermedad)) || (poblacion && !POBLACIONES.has(poblacion))) throw new Conflicto('Alcance de versión no válido');
    new VersionCatalogo({estado:'borrador',autorIdUsuario:actorId,tipoContenido,enfermedad,poblacion});
    return this.db.transaccion(async (c) => {
      const cat = await c.query('SELECT id_catalogo,estado FROM public.catalogo_medicion WHERE id_catalogo=$1 FOR UPDATE', [idCatalogo]);
      if (!cat.rows[0] || cat.rows[0].estado === 'retirado') throw new NoEncontrado('Catálogo no encontrado o retirado');
      await this.#autorizacion(c, { usuarioId: actorId, capacidad: 'autor', tipoContenido, idCatalogo, enfermedad, poblacion, lock:true });
      const q = await c.query(`INSERT INTO public.version_catalogo(id_catalogo,numero_version,tipo_contenido,enfermedad,poblacion,autor_id_usuario)
        VALUES($1,$2,$3,$4,$5,$6) RETURNING id_version AS id,estado`, [idCatalogo, numeroVersion, tipoContenido, enfermedad, poblacion, actorId]);
      await this.#auditar(c, actorId, 'crear', 'version_catalogo', q.rows[0].id, { idCatalogo, numeroVersion });
      return q.rows[0];
    });
  }

  async registrarFuente({ actorId, institucion, titulo, identificador = null, versionDocumento = null, publicadaEn = null, poblacion = null, url }) {
    institucion=requerido(institucion,200,'Institución'); titulo=requerido(titulo,500,'Título'); url=requerido(url,2000,'URL');
    try { const parsed=new URL(url); if(!['https:','http:'].includes(parsed.protocol))throw new Error(); } catch { throw new Conflicto('La URL de la fuente debe ser HTTP o HTTPS válida'); }
    return this.db.transaccion(async (c) => {
      await this.#autorizacion(c, { usuarioId: actorId, capacidad: 'autor', tipoContenido: 'fuente_clinica', lock:true });
      const q = await c.query(`INSERT INTO public.fuente_clinica(institucion,titulo,identificador,version_documento,publicada_en,poblacion,url)
        VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id_fuente AS id,estado`, [institucion,titulo,identificador,versionDocumento,publicadaEn,poblacion,url]);
      await this.#auditar(c, actorId, 'crear', 'fuente_clinica', q.rows[0].id);
      return q.rows[0];
    });
  }

  async revisarFuente({ actorId, idFuente, estado, motivoEstado = null, siguienteRevisionEn = null }) {
    if (!['vigente','revision_necesaria','retirada'].includes(estado)) throw new Conflicto('Estado de fuente no válido');
    return this.db.transaccion(async (c) => {
      const encontrada=await c.query('SELECT id_fuente FROM public.fuente_clinica WHERE id_fuente=$1',[idFuente]);
      if(!encontrada.rows[0])throw new NoEncontrado('Fuente no encontrada');
      await this.#autorizacion(c,{usuarioId:actorId,capacidad:'coordinador',tipoContenido:'fuente_clinica',lock:true});
      const f=await c.query('SELECT id_fuente,estado FROM public.fuente_clinica WHERE id_fuente=$1 FOR UPDATE',[idFuente]);
      await c.query('UPDATE public.fuente_clinica SET estado=$2,revisada_en=now(),siguiente_revision_en=$3,motivo_estado=$4 WHERE id_fuente=$1',
        [idFuente,estado,siguienteRevisionEn,motivoEstado]);
      await this.#auditar(c,actorId,'revisar_fuente','fuente_clinica',idFuente,{estado,motivoEstado});
      return {idFuente:Number(idFuente),estado};
    });
  }

  async asociarFuente({ actorId, idVersion, idFuente, seccion = null, pagina = null, hashSha256 = null }) {
    if(!seccion&&!pagina)throw new Conflicto('Indica la sección o página consultada');
    if(hashSha256!=null&&!/^[0-9a-f]{64}$/i.test(hashSha256))throw new Conflicto('El hash debe ser SHA-256 hexadecimal');
    return this.db.transaccion(async (c) => {
      const v = await c.query('SELECT * FROM public.version_catalogo WHERE id_version=$1 FOR UPDATE', [idVersion]);
      if (!v.rows[0] || v.rows[0].estado !== 'borrador') throw new Conflicto('Sólo se pueden asociar fuentes a una versión en borrador');
      await this.#autorizacion(c, { usuarioId: actorId, capacidad: 'autor', tipoContenido: v.rows[0].tipo_contenido,
        idCatalogo: v.rows[0].id_catalogo, enfermedad: v.rows[0].enfermedad, poblacion: v.rows[0].poblacion, lock:true });
      const s = await c.query('SELECT * FROM public.fuente_clinica WHERE id_fuente=$1 FOR UPDATE', [idFuente]);
      if (!s.rows[0] || s.rows[0].estado === 'retirada') throw new Conflicto('Fuente no admisible para nuevas versiones');
      const f = s.rows[0];
      await c.query(`INSERT INTO public.version_fuente(id_version,id_fuente,institucion_snapshot,titulo_snapshot,identificador_snapshot,
        version_documento_snapshot,publicada_en_snapshot,poblacion_snapshot,url_snapshot,seccion,pagina,hash_sha256)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [idVersion,idFuente,f.institucion,f.titulo,f.identificador,f.version_documento,f.publicada_en,f.poblacion,f.url,seccion,pagina,hashSha256]);
      await this.#auditar(c, actorId, 'asociar_fuente', 'version_catalogo', idVersion, { idFuente });
      return { idVersion: porId(idVersion), idFuente: porId(idFuente) };
    });
  }

  async concederAutorizacion({ actorId, idUsuario, capacidad, vigenteDesde, vigenteHasta = null, referenciaEvidencia = null, alcances }) {
    if (!CAPACIDADES.has(capacidad)) throw new Conflicto('Capacidad editorial no válida');
    if (Number(actorId) === Number(idUsuario)) throw new Conflicto('No se permite concederse autorización a uno mismo');
    const scopes = this.#validarAlcances(alcances);
    return this.db.transaccion(async (c) => {
      const users = await c.query('SELECT id_usuario,rol,activo FROM public.usuario WHERE id_usuario=ANY($1::int[]) ORDER BY id_usuario FOR UPDATE', [[Number(actorId),Number(idUsuario)]]);
      const admin = users.rows.find((u) => Number(u.id_usuario) === Number(actorId));
      const target = users.rows.find((u) => Number(u.id_usuario) === Number(idUsuario));
      if (!admin?.activo || admin.rol !== 'administrador') throw new NoAutorizado('Sólo un administrador activo puede conceder autorización operativa en este prototipo');
      if (!target?.activo) throw new Conflicto('El usuario autorizado debe estar activo');
      const q = await c.query(`INSERT INTO public.autorizacion_editorial(id_usuario,capacidad,concedida_por,vigente_desde,vigente_hasta,referencia_evidencia)
        VALUES($1,$2,$3,COALESCE($4::timestamptz,now()),$5,$6) RETURNING id_autorizacion AS id`, [idUsuario,capacidad,actorId,vigenteDesde,vigenteHasta,referenciaEvidencia]);
      for (const a of scopes) await c.query(`INSERT INTO public.alcance_editorial(id_autorizacion,tipo_contenido,id_catalogo,enfermedad,poblacion) VALUES($1,$2,$3,$4,$5)`,
        [q.rows[0].id,a.tipoContenido,a.idCatalogo ?? null,a.enfermedad ?? null,a.poblacion ?? null]);
      await this.#auditar(c,actorId,'conceder_autorizacion','autorizacion_editorial',q.rows[0].id,{idUsuario,capacidad,alcances:scopes});
      return { id: q.rows[0].id, idUsuario: Number(idUsuario), capacidad, estado: 'activa' };
    });
  }

  async revocarAutorizacion({ actorId, idAutorizacion, motivo }) {
    return this.db.transaccion(async (c) => {
      if(typeof motivo!=='string'||!motivo.trim())throw new Conflicto('El motivo de revocación es obligatorio');
      const owner = await c.query('SELECT id_usuario FROM public.autorizacion_editorial WHERE id_autorizacion=$1', [idAutorizacion]);
      if (!owner.rows[0]) throw new NoEncontrado('Autorización no encontrada');
      const users=await c.query('SELECT id_usuario,rol,activo FROM public.usuario WHERE id_usuario=ANY($1::int[]) ORDER BY id_usuario FOR UPDATE',[[Number(actorId),Number(owner.rows[0].id_usuario)]]);
      const admin=users.rows.find(u=>Number(u.id_usuario)===Number(actorId));
      if (!admin?.activo || admin.rol!=='administrador') throw new NoAutorizado('Se requiere administrador activo');
      const a = await c.query('SELECT id_autorizacion,estado FROM public.autorizacion_editorial WHERE id_autorizacion=$1 FOR UPDATE', [idAutorizacion]);
      if (a.rows[0].estado !== 'activa') throw new Conflicto('La autorización ya no está activa');
      await c.query(`UPDATE public.autorizacion_editorial SET estado='revocada',revocada_por=$2,revocada_en=now(),motivo_revocacion=$3 WHERE id_autorizacion=$1`, [idAutorizacion,actorId,motivo]);
      await this.#auditar(c,actorId,'revocar_autorizacion','autorizacion_editorial',idAutorizacion,{motivo});
      return { id: Number(idAutorizacion), estado: 'revocada' };
    });
  }

  async listarAutorizaciones({ actorId }) {
    const admin = await this.db.query("SELECT 1 FROM public.usuario WHERE id_usuario=$1 AND rol='administrador' AND activo", [actorId]);
    if (!admin.rowCount) throw new NoAutorizado('Se requiere administrador activo');
    const { rows } = await this.db.query(`SELECT ae.*,u.correo,al.tipo_contenido,al.id_catalogo,al.enfermedad,al.poblacion
      FROM public.autorizacion_editorial ae JOIN public.usuario u ON u.id_usuario=ae.id_usuario
      LEFT JOIN public.alcance_editorial al USING(id_autorizacion) ORDER BY ae.id_autorizacion DESC`);
    return rows;
  }

  async abrirRonda({ actorId, idVersion }) {
    return this.db.transaccion(async (c) => {
      const q = await c.query('SELECT * FROM public.version_catalogo WHERE id_version=$1 FOR UPDATE', [idVersion]);
      const v = q.rows[0];
      if (!v || !['borrador','en_revision'].includes(v.estado)) throw new Conflicto('La versión no está disponible para revisión');
      if(v.estado==='borrador')new VersionCatalogo({id:v.id_version,idCatalogo:v.id_catalogo,estado:v.estado,autorIdUsuario:v.autor_id_usuario,tipoContenido:v.tipo_contenido,enfermedad:v.enfermedad,poblacion:v.poblacion}).exigirTransicion('en_revision');
      await this.#autorizacion(c,{usuarioId:actorId,capacidad:'coordinador',tipoContenido:v.tipo_contenido,idCatalogo:v.id_catalogo,enfermedad:v.enfermedad,poblacion:v.poblacion,lock:true});
      const abierta=await c.query("SELECT 1 FROM public.ronda_revision WHERE id_version=$1 AND estado='abierta' LIMIT 1",[idVersion]);
      if(abierta.rowCount)throw new Conflicto('La versión ya tiene una ronda abierta');
      const n = await c.query('SELECT COALESCE(MAX(numero_ronda),0)+1 AS numero FROM public.ronda_revision WHERE id_version=$1',[idVersion]);
      if(v.estado==='borrador')await c.query("UPDATE public.version_catalogo SET estado='en_revision',enviada_revision_en=now() WHERE id_version=$1",[idVersion]);
      const r = await c.query(`INSERT INTO public.ronda_revision(id_version,numero_ronda,abierta_por) VALUES($1,$2,$3) RETURNING id_ronda AS id,numero_ronda AS numero,estado`,[idVersion,n.rows[0].numero,actorId]);
      await this.#auditar(c,actorId,'abrir_ronda','version_catalogo',idVersion,{idRonda:r.rows[0].id});
      return r.rows[0];
    });
  }

  async asignarRevisores({ actorId, idRonda, revisores }) {
    if (!Array.isArray(revisores) || !revisores.length || revisores.some(x=>!Number.isInteger(Number(x.idUsuario))||Number(x.idUsuario)<1)
      || new Set(revisores.map((x)=>Number(x.idUsuario))).size!==revisores.length) throw new Conflicto('Lista de revisores vacía, inválida o duplicada');
    return this.db.transaccion(async (c) => {
      const q = await c.query(`SELECT rr.*,vc.id_catalogo,vc.tipo_contenido,vc.enfermedad,vc.poblacion,vc.autor_id_usuario
        FROM public.ronda_revision rr JOIN public.version_catalogo vc USING(id_version) WHERE rr.id_ronda=$1 FOR UPDATE OF rr,vc`,[idRonda]);
      const x=q.rows[0]; if (!x || x.estado!=='abierta') throw new Conflicto('Ronda no abierta');
      if (Number(x.autor_id_usuario)===Number(actorId)) throw new Conflicto('El autor no puede coordinar su propia ronda');
      await this.#autorizacion(c,{usuarioId:actorId,capacidad:'coordinador',tipoContenido:x.tipo_contenido,idCatalogo:x.id_catalogo,enfermedad:x.enfermedad,poblacion:x.poblacion,lock:true});
      for (const item of [...revisores].sort((a,b)=>Number(a.idUsuario)-Number(b.idUsuario))) {
        const uid=Number(item.idUsuario);
        if (uid===Number(x.autor_id_usuario)) throw new Conflicto('El autor no puede revisar su propia versión');
        const auth=await this.#autorizacion(c,{usuarioId:uid,capacidad:'revisor',tipoContenido:x.tipo_contenido,idCatalogo:x.id_catalogo,enfermedad:x.enfermedad,poblacion:x.poblacion,lock:true});
        await c.query(`INSERT INTO public.revision_asignada(id_ronda,id_revisor,id_autorizacion,asignada_por) VALUES($1,$2,$3,$4)`,[idRonda,uid,auth.id_autorizacion,actorId]);
      }
      await this.#auditar(c,actorId,'asignar_revisores','ronda_revision',idRonda,{revisores:revisores.map(x=>Number(x.idUsuario))});
      return { idRonda:Number(idRonda), asignados:revisores.length };
    });
  }

  async registrarDecision({ actorId, idRonda, decision, observacion = null }) {
    if (!['aprobada','rechazada','requiere_cambios'].includes(decision)) throw new Conflicto('Decisión no válida');
    if(observacion!=null&&typeof observacion!=='string')throw new Conflicto('Observación no válida');
    return this.db.transaccion(async (c) => {
      const q=await c.query(`SELECT rr.estado AS estado_ronda,vc.*,ra.id_autorizacion,ra.estado AS estado_revision
        FROM public.ronda_revision rr JOIN public.version_catalogo vc USING(id_version)
        JOIN public.revision_asignada ra ON ra.id_ronda=rr.id_ronda
        WHERE rr.id_ronda=$1 AND ra.id_revisor=$2 FOR UPDATE OF rr,vc,ra`,[idRonda,actorId]);
      const x=q.rows[0]; if (!x) throw new NoAutorizado('No tienes asignación para esta ronda');
      if (x.estado_ronda!=='abierta' || !['asignada','en_revision'].includes(x.estado_revision)) throw new Conflicto('Ronda cerrada o revisión ya completada');
      if (Number(x.autor_id_usuario)===Number(actorId)) throw new Conflicto('El autor no puede aprobar su propia versión');
      await this.#autorizacion(c,{usuarioId:actorId,capacidad:'revisor',tipoContenido:x.tipo_contenido,idCatalogo:x.id_catalogo,enfermedad:x.enfermedad,poblacion:x.poblacion,idAutorizacion:x.id_autorizacion,lock:true});
      await c.query(`INSERT INTO public.aprobacion_catalogo(id_version,id_ronda,id_revisor,id_autorizacion,decision,observacion)
        VALUES($1,$2,$3,$4,$5,$6)`,[x.id_version,idRonda,actorId,x.id_autorizacion,decision,observacion]);
      await c.query("UPDATE public.revision_asignada SET estado='completada',completada_en=now() WHERE id_ronda=$1 AND id_revisor=$2",[idRonda,actorId]);
      await this.#auditar(c,actorId,'registrar_decision','ronda_revision',idRonda,{version:x.id_version,decision});
      return {idRonda:Number(idRonda),decision};
    });
  }

  async cerrarRonda({ actorId, idRonda, motivo = null }) {
    return this.db.transaccion(async (c) => {
      const q=await c.query(`SELECT rr.*,vc.id_version,vc.estado AS version_estado,vc.id_catalogo,vc.tipo_contenido,vc.enfermedad,vc.poblacion,vc.autor_id_usuario FROM public.ronda_revision rr
        JOIN public.version_catalogo vc USING(id_version) WHERE rr.id_ronda=$1 FOR UPDATE OF rr,vc`,[idRonda]);
      const x=q.rows[0]; if(!x||x.estado!=='abierta')throw new Conflicto('Ronda no abierta');
      await this.#autorizacion(c,{usuarioId:actorId,capacidad:'coordinador',tipoContenido:x.tipo_contenido,idCatalogo:x.id_catalogo,enfermedad:x.enfermedad,poblacion:x.poblacion,lock:true});
      const pendientes=await c.query("SELECT 1 FROM public.revision_asignada WHERE id_ronda=$1 AND estado NOT IN ('completada','retirada') LIMIT 1",[idRonda]);
      if(pendientes.rowCount)throw new Conflicto('No se puede cerrar la ronda mientras existan revisiones pendientes');
      const votes=await c.query("SELECT decision FROM public.aprobacion_catalogo WHERE id_ronda=$1",[idRonda]);
      const resultado=this.politicaPublicacion.resultadoRonda(votes.rows);
      if(resultado==='aprobada') {
        new VersionCatalogo({id:x.id_version,idCatalogo:x.id_catalogo,estado:x.version_estado,autorIdUsuario:x.autor_id_usuario,tipoContenido:x.tipo_contenido,enfermedad:x.enfermedad,poblacion:x.poblacion}).exigirTransicion('aprobada');
        await c.query("UPDATE public.version_catalogo SET estado='aprobada' WHERE id_version=$1",[x.id_version]);
      } else if(resultado==='cancelada') {
        new VersionCatalogo({id:x.id_version,idCatalogo:x.id_catalogo,estado:x.version_estado,autorIdUsuario:x.autor_id_usuario,tipoContenido:x.tipo_contenido,enfermedad:x.enfermedad,poblacion:x.poblacion}).exigirTransicion('cancelada');
        await c.query("UPDATE public.version_catalogo SET estado='cancelada',motivo_terminal=$2 WHERE id_version=$1",[x.id_version,motivo?.trim()||'La revisión requiere una nueva versión']);
      }
      await c.query("UPDATE public.ronda_revision SET estado='cerrada',cerrada_por=$2,cerrada_en=now(),motivo_cierre=$3 WHERE id_ronda=$1",[idRonda,actorId,motivo]);
      await this.#auditar(c,actorId,'cerrar_ronda','ronda_revision',idRonda,{motivo});
      return {idRonda:Number(idRonda),estado:'cerrada'};
    });
  }

  async publicarVersion({ actorId, idVersion, validarPolitica = (contexto)=>this.politicaPublicacion.validar(contexto) }) {
    return this.db.transaccion(async (c) => {
      const base=await c.query('SELECT * FROM public.version_catalogo WHERE id_version=$1',[idVersion]);
      if(!base.rows[0])throw new NoEncontrado('Versión no encontrada');
      const idCatalogo=base.rows[0].id_catalogo;
      const cat=await c.query('SELECT * FROM public.catalogo_medicion WHERE id_catalogo=$1 FOR UPDATE',[idCatalogo]);
      if(cat.rows[0]?.estado==='retirado')throw new Conflicto('No se puede publicar en un catálogo retirado');
      const vq=await c.query('SELECT * FROM public.version_catalogo WHERE id_version=$1 FOR UPDATE',[idVersion]);
      const v=vq.rows[0];
      if(!v||v.estado!=='aprobada')throw new Conflicto('La versión aún no cuenta con aprobación suficiente');
      new VersionCatalogo({id:v.id_version,idCatalogo:v.id_catalogo,estado:v.estado,autorIdUsuario:v.autor_id_usuario,tipoContenido:v.tipo_contenido,enfermedad:v.enfermedad,poblacion:v.poblacion}).exigirTransicion('vigente');
      const rq=await c.query("SELECT * FROM public.ronda_revision WHERE id_version=$1 AND estado='cerrada' ORDER BY numero_ronda DESC LIMIT 1 FOR UPDATE",[idVersion]);
      const ronda=rq.rows[0]; if(!ronda)throw new Conflicto('Se requiere una ronda cerrada');
      const aprob=await c.query(`SELECT a.*,ra.estado AS revision_estado FROM public.aprobacion_catalogo a
        JOIN public.revision_asignada ra ON ra.id_ronda=a.id_ronda AND ra.id_revisor=a.id_revisor
        WHERE a.id_version=$1 AND a.id_ronda=$2 ORDER BY a.id_revisor FOR UPDATE OF a,ra`,[idVersion,ronda.id_ronda]);
      const decisiones=aprob.rows;
      const ids=[Number(v.autor_id_usuario),Number(actorId),...decisiones.map(d=>Number(d.id_revisor))].sort((a,b)=>a-b);
      const users=await c.query('SELECT id_usuario,activo FROM public.usuario WHERE id_usuario=ANY($1::int[]) ORDER BY id_usuario FOR UPDATE',[[...new Set(ids)]]);
      await this.#autorizacion(c,{usuarioId:actorId,capacidad:'publicador',tipoContenido:v.tipo_contenido,idCatalogo:v.id_catalogo,enfermedad:v.enfermedad,poblacion:v.poblacion,lock:true});
      for(const d of decisiones) await this.#autorizacion(c,{usuarioId:d.id_revisor,capacidad:'revisor',tipoContenido:v.tipo_contenido,idCatalogo:v.id_catalogo,enfermedad:v.enfermedad,poblacion:v.poblacion,idAutorizacion:d.id_autorizacion,lock:true});
      const fuentes=await c.query(`SELECT vf.*,f.estado AS estado_fuente FROM public.version_fuente vf JOIN public.fuente_clinica f USING(id_fuente)
        WHERE vf.id_version=$1 ORDER BY vf.id_fuente FOR UPDATE OF f`,[idVersion]);
      validarPolitica({version:v,ronda,decisiones,usuarios:users.rows,fuentes:fuentes.rows,actorId});
      const anterior=await c.query("SELECT * FROM public.version_catalogo WHERE id_catalogo=$1 AND estado='vigente' FOR UPDATE",[idCatalogo]);
      if(anterior.rows[0]) await c.query("UPDATE public.version_catalogo SET estado='sustituida' WHERE id_version=$1",[anterior.rows[0].id_version]);
      await c.query("UPDATE public.version_catalogo SET estado='vigente',publicada_en=now(),publicada_por=$2,sustituye_a=$3 WHERE id_version=$1",[idVersion,actorId,anterior.rows[0]?.id_version ?? null]);
      await c.query("UPDATE public.catalogo_medicion SET estado='activo' WHERE id_catalogo=$1 AND estado='borrador'",[idCatalogo]);
      await this.#auditar(c,actorId,'publicar','version_catalogo',idVersion,{idRonda:ronda.id_ronda,aprobaciones:decisiones.map(d=>d.id_aprobacion)});
      return {idVersion:Number(idVersion),estado:'vigente',publicadaPor:Number(actorId)};
    });
  }

  async retirarCatalogo({ actorId, idCatalogo, motivo }) {
    return this.db.transaccion(async (c) => {
      const cat=await c.query('SELECT * FROM public.catalogo_medicion WHERE id_catalogo=$1 FOR UPDATE',[idCatalogo]);
      if(!cat.rows[0])throw new NoEncontrado('Catálogo no encontrado');
      if(typeof motivo!=='string'||!motivo.trim())throw new Conflicto('El motivo de retiro es obligatorio');
      await this.#autorizacion(c,{usuarioId:actorId,capacidad:'publicador',tipoContenido:'catalogo_medicion',idCatalogo,lock:true});
      await c.query("UPDATE public.ronda_revision SET estado='cancelada',cerrada_por=$2,cerrada_en=now(),motivo_cierre=$3 WHERE id_version IN (SELECT id_version FROM public.version_catalogo WHERE id_catalogo=$1) AND estado='abierta'",[idCatalogo,actorId,motivo]);
      await c.query(`UPDATE public.version_catalogo SET
        estado=CASE WHEN estado IN ('borrador','en_revision') THEN 'cancelada' ELSE 'retirada' END,
        motivo_terminal=$2 WHERE id_catalogo=$1 AND estado IN ('borrador','en_revision','aprobada','vigente','sustituida')`,[idCatalogo,motivo]);
      await c.query("UPDATE public.catalogo_medicion SET estado='retirado',retirado_en=now(),motivo_retiro=$2 WHERE id_catalogo=$1",[idCatalogo,motivo]);
      await this.#auditar(c,actorId,'retirar','catalogo_medicion',idCatalogo,{motivo});
      return {idCatalogo:Number(idCatalogo),estado:'retirado'};
    });
  }

  async consultarAuditoria({ actorId, limit = 100 }) {
    await this.#autorizacion(this.db,{usuarioId:actorId,capacidad:'coordinador',tipoContenido:'catalogo_medicion'});
    const {rows}=await this.db.query('SELECT * FROM public.catalogo_auditoria ORDER BY ocurrido_en DESC LIMIT $1',[Math.min(Math.max(Number(limit)||100,1),500)]);
    return rows;
  }

  async consultarVersiones({ actorId, idCatalogo }) {
    await this.#autorizacion(this.db,{usuarioId:actorId,capacidad:'coordinador',tipoContenido:'catalogo_medicion',idCatalogo});
    const {rows}=await this.db.query('SELECT * FROM public.version_catalogo WHERE id_catalogo=$1 ORDER BY creada_en DESC',[idCatalogo]); return rows;
  }

  async consultarFuentes({ actorId, idVersion }) {
    const {rows}=await this.db.query(`SELECT vc.id_catalogo,vc.tipo_contenido,vc.enfermedad,vc.poblacion FROM public.version_catalogo vc WHERE vc.id_version=$1`,[idVersion]);
    const v=rows[0]; if(!v)throw new NoEncontrado('Versión no encontrada');
    await this.#autorizacion(this.db,{usuarioId:actorId,capacidad:'coordinador',tipoContenido:v.tipo_contenido,idCatalogo:v.id_catalogo,enfermedad:v.enfermedad,poblacion:v.poblacion});
    const q=await this.db.query('SELECT * FROM public.version_fuente WHERE id_version=$1 ORDER BY id_fuente',[idVersion]); return q.rows;
  }
}
