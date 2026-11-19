import { DiagnosticoRepository } from '../../../application/ports/DiagnosticoRepository.js';
import { Conflicto,NoEncontrado } from '../../../domain/errors.js';

const mapear=(r)=>({id:Number(r.id_diagnostico),idPaciente:Number(r.id_paciente),codigo:r.codigo,estado:r.estado,
  confirmadoEn:r.confirmado_en,cerradoEn:r.cerrado_en,idMedico:Number(r.id_medico),creadoEn:r.creado_en});

export class PgDiagnosticoRepository extends DiagnosticoRepository {
  constructor(db){super();this.db=db;}
  async registrar(diagnostico,actorId){
    try{return await this.db.transaccion(async c=>{
      const p=await c.query(`SELECT p.id_paciente FROM public.paciente p JOIN public.usuario u ON u.id_usuario=p.id_usuario
        WHERE p.id_paciente=$1 AND u.activo AND u.rol='paciente' FOR UPDATE OF p`,[diagnostico.idPaciente]);
      if(!p.rowCount)throw new NoEncontrado('Paciente no encontrado');
      const m=await c.query(`SELECT 1 FROM public.usuario u JOIN public.medico_paciente mp ON mp.id_medico=u.id_usuario
        WHERE u.id_usuario=$1 AND u.activo AND u.rol='medico' AND mp.id_paciente=$2 AND mp.activo`,[actorId,diagnostico.idPaciente]);
      if(!m.rowCount)throw new NoEncontrado('Paciente no encontrado');
      await c.query("SELECT set_config('app.usuario_actor',$1,true)",[String(actorId)]);
      const {rows}=await c.query(`INSERT INTO public.diagnostico(id_paciente,codigo,confirmado_en,id_medico)
        VALUES($1,$2,$3,$4) RETURNING *`,[diagnostico.idPaciente,diagnostico.codigo,diagnostico.confirmadoEn,actorId]);
      return mapear(rows[0]);
    });}catch(e){if(e.code==='23505')throw new Conflicto('Este diagnóstico ya está confirmado para el paciente');throw e;}
  }
  async listar(idPaciente,actorId,rol){
    const {rows}=await this.db.query(`SELECT d.* FROM public.diagnostico d
      JOIN public.paciente p ON p.id_paciente=d.id_paciente JOIN public.usuario up ON up.id_usuario=p.id_usuario
      JOIN public.usuario actor ON actor.id_usuario=$2
      WHERE d.id_paciente=$1 AND up.activo AND up.rol='paciente' AND actor.activo AND actor.rol=$3 AND
       (($3='paciente' AND p.id_usuario=$2) OR ($3='medico' AND EXISTS(SELECT 1 FROM public.medico_paciente mp
         WHERE mp.id_paciente=d.id_paciente AND mp.id_medico=$2 AND mp.activo)))
      ORDER BY d.confirmado_en DESC,d.id_diagnostico DESC`,[idPaciente,actorId,rol]);
    return rows.map(mapear);
  }
  async cerrar(idDiagnostico,idPaciente,actorId){
    return this.db.transaccion(async c=>{
      const {rows}=await c.query(`SELECT d.id_diagnostico FROM public.diagnostico d
        JOIN public.medico_paciente mp ON mp.id_paciente=d.id_paciente AND mp.id_medico=$3 AND mp.activo
        JOIN public.usuario u ON u.id_usuario=$3 AND u.activo AND u.rol='medico'
        WHERE d.id_diagnostico=$1 AND d.id_paciente=$2 AND d.estado='confirmado' FOR UPDATE OF d`,[idDiagnostico,idPaciente,actorId]);
      if(!rows[0])throw new NoEncontrado('Diagnóstico no encontrado');
      await c.query("SELECT set_config('app.usuario_actor',$1,true)",[String(actorId)]);
      const result=await c.query(`UPDATE public.diagnostico SET estado='cerrado',cerrado_en=CURRENT_DATE WHERE id_diagnostico=$1 RETURNING *`,[idDiagnostico]);
      return mapear(result.rows[0]);
    });
  }
}
