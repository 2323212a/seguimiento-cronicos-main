import { CriterioSeguridadRepository } from '../../../application/ports/CriterioSeguridadRepository.js';
import { Conflicto, NoAutorizado, NoEncontrado } from '../../../domain/errors.js';

const condicionesValidas = (tipo, condicion) => {
  const permitidos = tipo === 'glucosa' ? ['glucosaMgDl'] : tipo === 'presion_arterial'
    ? ['sistolicaMmhg','diastolicaMmhg'] : tipo === 'hba1c' ? ['hba1cPercent'] : [];
  const padecimientos = ['diabetes_tipo_1','diabetes_tipo_2','hipertension'];
  const padecimientoValido = condicion?.padecimientoPosible === undefined
    || padecimientos.includes(condicion.padecimientoPosible);
  const contextoValido = condicion?.contexto == null || (typeof condicion.contexto === 'string'
    && condicion.contexto.trim().length > 0 && condicion.contexto.trim().length <= 50);
  return Array.isArray(condicion?.any) && condicion.any.length > 0 && condicion.any.length <= 20
    && contextoValido && padecimientoValido
    && condicion.any.every((x) => x && Object.keys(x).sort().join(',') === 'campo,operador,valor'
      && permitidos.includes(x.campo) && ['gt','gte','lt','lte'].includes(x.operador)
      && typeof x.valor === 'number' && Number.isFinite(x.valor));
};

export class PgGestionCriteriosSeguridadRepository extends CriterioSeguridadRepository {
  constructor(db) { super(); this.db = db; }
  async ejecutar(operacion, datos) {
    const metodo = this[operacion];
    if (typeof metodo !== 'function' || ['constructor','ejecutar'].includes(operacion)) throw new Conflicto('Operación no válida');
    try { return await metodo.call(this, datos); }
    catch (e) { if (['23505','23503','23514'].includes(e.code)) throw new Conflicto('El criterio o la revisión infringe una regla de integridad'); throw e; }
  }
  async #contexto(c, actorId, capacidad, v = {}) {
    const { rows } = await c.query(`SELECT a.id_autorizacion FROM public.usuario u
      JOIN public.autorizacion_editorial a ON a.id_usuario=u.id_usuario
      JOIN public.alcance_editorial s ON s.id_autorizacion=a.id_autorizacion
      WHERE u.id_usuario=$1 AND u.activo AND u.rol='medico' AND a.capacidad=$2 AND a.estado='activa'
        AND a.vigente_desde<=now() AND (a.vigente_hasta IS NULL OR a.vigente_hasta>now())
        AND s.tipo_contenido='seguridad_medicion'
        AND (s.enfermedad IS NULL OR s.enfermedad IS NOT DISTINCT FROM $3)
        AND (s.poblacion IS NULL OR s.poblacion IS NOT DISTINCT FROM $4)
      ORDER BY a.id_autorizacion DESC LIMIT 1 FOR UPDATE OF u,a`,
    [actorId, capacidad, v.enfermedad ?? null, v.poblacion ?? null]);
    if (!rows[0]) throw new NoAutorizado(`Se requiere autorización clínica vigente: ${capacidad}`);
    return Number(rows[0].id_autorizacion);
  }
  async #auditar(c, actorId, accion, id, detalles = {}) {
    await c.query(`INSERT INTO public.catalogo_auditoria(actor_id_usuario,accion,entidad,id_entidad,detalles)
      VALUES($1,$2,'version_criterio_seguridad',$3,$4::jsonb)`, [actorId,accion,id,JSON.stringify(detalles)]);
  }
  async listar({ actorId }) {
    const { rows: actor } = await this.db.query(`SELECT 1 FROM public.usuario u WHERE u.id_usuario=$1 AND u.activo AND u.rol='medico'
      AND EXISTS (SELECT 1 FROM public.autorizacion_editorial a JOIN public.alcance_editorial s USING(id_autorizacion)
       WHERE a.id_usuario=u.id_usuario AND a.estado='activa' AND a.capacidad IN ('autor','revisor','publicador','coordinador')
        AND a.vigente_desde<=now() AND (a.vigente_hasta IS NULL OR a.vigente_hasta>now()) AND s.tipo_contenido='seguridad_medicion')`, [actorId]);
    if (!actor.length) throw new NoAutorizado('Se requiere autorización clínica vigente');
    const { rows } = await this.db.query(`SELECT v.id_version_criterio AS id,$1::integer AS "actorId",c.codigo,c.nombre,v.numero_version AS version,
      v.tipo_medicion AS "tipoMedicion",v.unidad,v.enfermedad,v.poblacion,v.condicion,v.mensaje_orientacion AS "mensajeOrientacion",
      v.estado,v.ronda_actual AS "rondaActual",v.id_version_fuente AS "idVersionFuente",v.autor_id_usuario AS "autorId",
      vf.titulo_snapshot AS "tituloFuente",vf.institucion_snapshot AS "institucionFuente",
      (SELECT jsonb_agg(jsonb_build_object('revisorId',r.id_revisor,'decision',r.decision,'fecha',r.decidido_en,'observacion',r.observacion)
        ORDER BY r.decidido_en) FROM public.revision_criterio_seguridad r
        WHERE r.id_version_criterio=v.id_version_criterio) AS revisiones
      FROM public.version_criterio_seguridad v JOIN public.criterio_seguridad c USING(id_criterio)
      LEFT JOIN public.version_fuente vf USING(id_version_fuente)
      WHERE EXISTS (SELECT 1 FROM public.alcance_editorial s JOIN public.autorizacion_editorial a USING(id_autorizacion)
        WHERE a.id_usuario=$1 AND a.estado='activa' AND a.vigente_desde<=now()
          AND (a.vigente_hasta IS NULL OR a.vigente_hasta>now()) AND s.tipo_contenido='seguridad_medicion'
          AND (s.enfermedad IS NULL OR s.enfermedad IS NOT DISTINCT FROM v.enfermedad)
          AND (s.poblacion IS NULL OR s.poblacion IS NOT DISTINCT FROM v.poblacion))
      ORDER BY v.creado_en DESC`, [actorId]);
    return rows;
  }
  async crearBorrador({ actorId, codigo, nombre, version, tipoMedicion, unidad, enfermedad=null,
    poblacion, condicion, mensajeOrientacion }) {
    if (!/^[a-z][a-z0-9_]{1,39}$/.test(codigo ?? '') || typeof nombre!=='string' || !nombre.trim() || nombre.length>120
      || typeof version!=='string' || !version.trim() || version.length>40 || !['adolescente_13_17','adulto_18_mas'].includes(poblacion)
      || (enfermedad!==null&&!['diabetes_tipo_1','diabetes_tipo_2','hipertension'].includes(enfermedad))
      || !condicionesValidas(tipoMedicion,condicion) || typeof mensajeOrientacion!=='string'
      || !mensajeOrientacion.trim() || mensajeOrientacion.length>2000) {
      throw new Conflicto('Datos del criterio incompletos o con estructura no válida');
    }
    const unidadEsperada={glucosa:'mg/dL',presion_arterial:'mmHg',hba1c:'%'}[tipoMedicion];
    if(unidad!==unidadEsperada) throw new Conflicto('La unidad no corresponde al tipo de medición');
    return this.db.transaccion(async c=>{
      const idAuth=await this.#contexto(c,actorId,'autor',{enfermedad,poblacion});
      let criterio=await c.query('SELECT id_criterio FROM public.criterio_seguridad WHERE codigo=$1 FOR UPDATE',[codigo]);
      if(!criterio.rowCount) criterio=await c.query('INSERT INTO public.criterio_seguridad(codigo,nombre) VALUES($1,$2) RETURNING id_criterio',[codigo,nombre.trim()]);
      const {rows}=await c.query(`INSERT INTO public.version_criterio_seguridad
        (id_criterio,numero_version,tipo_medicion,unidad,enfermedad,poblacion,condicion,mensaje_orientacion,
         autor_id_usuario,id_autorizacion_autor)
        VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10) RETURNING id_version_criterio,estado`,
      [criterio.rows[0].id_criterio,version.trim(),tipoMedicion,unidad,enfermedad,poblacion,JSON.stringify(condicion),mensajeOrientacion.trim(),actorId,idAuth]);
      await this.#auditar(c,actorId,'crear_borrador_criterio',rows[0].id_version_criterio,{codigo,version});
      return {id:Number(rows[0].id_version_criterio),estado:rows[0].estado};
    });
  }
  async actualizarBorrador({actorId,id,tipoMedicion,unidad,enfermedad=null,poblacion,condicion,mensajeOrientacion}) {
    if(!['adolescente_13_17','adulto_18_mas'].includes(poblacion)
      ||(enfermedad!==null&&!['diabetes_tipo_1','diabetes_tipo_2','hipertension'].includes(enfermedad))
      ||!condicionesValidas(tipoMedicion,condicion)||typeof mensajeOrientacion!=='string'||!mensajeOrientacion.trim()
      ||mensajeOrientacion.length>2000)throw new Conflicto('Contenido del borrador no válido');
    if(unidad!==({glucosa:'mg/dL',presion_arterial:'mmHg',hba1c:'%'})[tipoMedicion])throw new Conflicto('Unidad incompatible');
    return this.db.transaccion(async c=>{
      const q=await c.query('SELECT * FROM public.version_criterio_seguridad WHERE id_version_criterio=$1 FOR UPDATE',[id]);
      const v=q.rows[0];if(!v||v.estado!=='borrador'||Number(v.autor_id_usuario)!==Number(actorId))throw new NoEncontrado('Borrador no encontrado');
      await this.#contexto(c,actorId,'autor',{enfermedad,poblacion});
      await c.query(`UPDATE public.version_criterio_seguridad SET tipo_medicion=$2,unidad=$3,enfermedad=$4,poblacion=$5,
        condicion=$6::jsonb,mensaje_orientacion=$7 WHERE id_version_criterio=$1`,
      [id,tipoMedicion,unidad,enfermedad,poblacion,JSON.stringify(condicion),mensajeOrientacion.trim()]);
      await this.#auditar(c,actorId,'editar_borrador_criterio',id,{campos:['tipo_medicion','poblacion','enfermedad','condicion','mensaje_orientacion']});
      return {id:Number(id),estado:'borrador'};
    });
  }
  async enviarRevision({ actorId,id }) {
    return this.db.transaccion(async c=>{
      const q=await c.query('SELECT * FROM public.version_criterio_seguridad WHERE id_version_criterio=$1 FOR UPDATE',[id]);
      const v=q.rows[0]; if(!v||v.estado!=='borrador'||Number(v.autor_id_usuario)!==Number(actorId))throw new NoEncontrado('Borrador no encontrado');
      await this.#contexto(c,actorId,'autor',v);
      await c.query("UPDATE public.version_criterio_seguridad SET estado='en_revision' WHERE id_version_criterio=$1",[id]);
      await this.#auditar(c,actorId,'enviar_revision_criterio',id,{ronda:Number(v.ronda_actual)+1});
      return {id:Number(id),estado:'en_revision',ronda:Number(v.ronda_actual)+1};
    });
  }
  async registrarDecision({ actorId,id,decision,observacion=null }) {
    if(!['aprobada','rechazada','requiere_cambios'].includes(decision))throw new Conflicto('Decisión no válida');
    return this.db.transaccion(async c=>{
      const q=await c.query('SELECT * FROM public.version_criterio_seguridad WHERE id_version_criterio=$1 FOR UPDATE',[id]);
      const v=q.rows[0]; if(!v||v.estado!=='en_revision')throw new NoEncontrado('Versión en revisión no encontrada');
      const auth=await this.#contexto(c,actorId,'revisor',v);
      await c.query(`INSERT INTO public.revision_criterio_seguridad(id_version_criterio,ronda,id_revisor,id_autorizacion,decision,observacion)
        VALUES($1,$2,$3,$4,$5,$6)`,[id,v.ronda_actual,actorId,auth,decision,observacion]);
      await this.#auditar(c,actorId,'decision_criterio',id,{ronda:v.ronda_actual,decision});
      if(decision==='aprobada') {
        const r=await c.query(`SELECT count(*) FILTER(WHERE decision='aprobada') AS ok,
          count(*) FILTER(WHERE decision<>'aprobada') AS no FROM public.revision_criterio_seguridad WHERE id_version_criterio=$1 AND ronda=$2`,[id,v.ronda_actual]);
        if(Number(r.rows[0].ok)>=2&&Number(r.rows[0].no)===0) await c.query("UPDATE public.version_criterio_seguridad SET estado='aprobada' WHERE id_version_criterio=$1",[id]);
      }
      const estado=await c.query('SELECT estado FROM public.version_criterio_seguridad WHERE id_version_criterio=$1',[id]);
      return {id:Number(id),decision,estado:estado.rows[0].estado};
    });
  }
  async devolverEdicion({actorId,id}) {
    return this.db.transaccion(async c=>{
      const q=await c.query('SELECT * FROM public.version_criterio_seguridad WHERE id_version_criterio=$1 FOR UPDATE',[id]);
      const v=q.rows[0];if(!v||v.estado!=='en_revision'||Number(v.autor_id_usuario)!==Number(actorId))throw new NoEncontrado('Revisión no encontrada');
      await this.#contexto(c,actorId,'autor',v);
      await c.query("UPDATE public.version_criterio_seguridad SET estado='borrador' WHERE id_version_criterio=$1",[id]);
      await this.#auditar(c,actorId,'devolver_edicion_criterio',id,{ronda:v.ronda_actual}); return {id:Number(id),estado:'borrador'};
    });
  }
  async activar({actorId,id}) {
    return this.db.transaccion(async c=>{
      const q=await c.query('SELECT * FROM public.version_criterio_seguridad WHERE id_version_criterio=$1 FOR UPDATE',[id]);
      const v=q.rows[0];if(!v||v.estado!=='aprobada')throw new Conflicto('Solo una versión con dos aprobaciones clínicas puede activarse');
      const auth=await this.#contexto(c,actorId,'publicador',v);
      await c.query("UPDATE public.version_criterio_seguridad SET estado='activa',activado_por=$2,id_autorizacion_activador=$3 WHERE id_version_criterio=$1",[id,actorId,auth]);
      await this.#auditar(c,actorId,'activar_criterio',id,{version:v.numero_version}); return {id:Number(id),estado:'activa'};
    });
  }
  async retirar({actorId,id,motivo}) {
    if(typeof motivo!=='string'||!motivo.trim())throw new Conflicto('Se requiere motivo de retiro');
    return this.db.transaccion(async c=>{
      const q=await c.query('SELECT * FROM public.version_criterio_seguridad WHERE id_version_criterio=$1 FOR UPDATE',[id]);
      const v=q.rows[0];if(!v||!['activa','aprobada'].includes(v.estado))throw new Conflicto('Solo se pueden retirar criterios aprobados o activos');
      const auth=await this.#contexto(c,actorId,'publicador',v);
      await c.query("UPDATE public.version_criterio_seguridad SET estado='retirada',retirado_por=$2,id_autorizacion_retiro=$3,motivo_retiro=$4 WHERE id_version_criterio=$1",[id,actorId,auth,motivo.trim()]);
      await this.#auditar(c,actorId,'retirar_criterio',id,{motivo:motivo.trim()}); return {id:Number(id),estado:'retirada'};
    });
  }
}
