import { useCallback,useEffect,useState } from 'react';
import { api } from '../api.js';
import Campo from '../componentes/Campo.jsx';
import Mensaje from '../componentes/Mensaje.jsx';

const tipoUnidad={glucosa:'mg/dL',presion_arterial:'mmHg',hba1c:'%'};
const inicial=()=>({codigo:'',nombre:'',version:'',tipoMedicion:'',enfermedad:'',poblacion:'',padecimientoPosible:'',condicion:'',mensajeOrientacion:''});
export default function CatalogoSeguridad(){
  const [items,setItems]=useState([]);const [form,setForm]=useState(inicial());
  const [error,setError]=useState('');const [aviso,setAviso]=useState('');const [busy,setBusy]=useState(false);const [motivos,setMotivos]=useState({});const [editandoId,setEditandoId]=useState(null);
  const cargar=useCallback(async()=>{setError('');try{setItems(await api.listarCriteriosSeguridad());}catch(e){setError(e.message);}},[]);
  useEffect(()=>{cargar();},[cargar]);
  const ejecutar=async(fn,mensaje)=>{setBusy(true);setError('');setAviso('');try{await fn();setAviso(mensaje);await cargar();return true;}catch(e){setError(e.message);return false;}finally{setBusy(false);}};
  const crear=async(e)=>{e.preventDefault();let condicion;try{condicion=JSON.parse(form.condicion);}catch{setError('La condición debe ser JSON válido.');return;}
    if(form.padecimientoPosible)condicion.padecimientoPosible=form.padecimientoPosible;else delete condicion.padecimientoPosible;
    const datos={...form,unidad:tipoUnidad[form.tipoMedicion],enfermedad:form.enfermedad||null,condicion};
    const ok=await ejecutar(()=>editandoId?api.actualizarCriterioSeguridad(editandoId,datos):api.crearCriterioSeguridad(datos),editandoId?'Borrador actualizado. Aún no se usa para evaluar mediciones.':'Borrador creado. Aún no se usa para evaluar mediciones.');
    if(ok){setForm(inicial());setEditandoId(null);}};
  const decision=(id,valor)=>ejecutar(()=>api.criterioSeguridadOperacion(id,'decisiones',{decision:valor}), 'Decisión registrada con tu cuenta.');
  return <div className="editorial-seguridad"><section className="tarjeta"><h2>Criterios de seguridad clínica</h2>
    <p className="descripcion-seccion">Los criterios solo se evalúan después de dos revisiones médicas independientes y publicación por un médico autorizado. No hay umbrales o mensajes precargados.</p>
    <Mensaje>{error}</Mensaje><Mensaje tipo="exito">{aviso}</Mensaje>
    {items.length?<ul className="lista">{items.map((x)=><li key={x.id}>
      <div className="alerta-profesional-titulo"><strong>{x.codigo} · versión {x.version}</strong><span className="estado-cuenta">{x.estado}</span></div>
      <div>{x.nombre} · {x.tipoMedicion} ({x.unidad}) · {x.poblacion}{x.enfermedad?` · ${x.enfermedad}`:''}</div>
      {x.tituloFuente&&<div className="detalle">Fuente: {x.institucionFuente} · {x.tituloFuente}</div>}<div className="detalle">Ronda {x.rondaActual} · autor #{x.autorId}</div>
      <p>{x.mensajeOrientacion}</p><details><summary>Condición versionada y revisiones</summary><pre>{JSON.stringify(x.condicion,null,2)}</pre>{(x.revisiones??[]).map((r,i)=><div className="detalle" key={`${r.revisorId}-${i}`}>Revisor #{r.revisorId}: {r.decision} · {new Date(r.fecha).toLocaleString('es-MX')}{r.observacion?` · ${r.observacion}`:''}</div>)}</details>
      {x.condicion?.padecimientoPosible&&<div className="detalle">Padecimiento informativo: {{diabetes_tipo_1:'Diabetes tipo 1',diabetes_tipo_2:'Diabetes tipo 2',hipertension:'Hipertensión arterial'}[x.condicion.padecimientoPosible]??x.condicion.padecimientoPosible}</div>}
      {x.estado==='borrador'&&x.autorId===x.actorId&&<div className="acciones-inline"><button type="button" className="secundario" disabled={busy} onClick={()=>{setEditandoId(x.id);setForm({codigo:x.codigo,nombre:x.nombre,version:x.version,tipoMedicion:x.tipoMedicion,unidad:x.unidad,enfermedad:x.enfermedad??'',poblacion:x.poblacion,padecimientoPosible:x.condicion?.padecimientoPosible??'',condicion:JSON.stringify(x.condicion,null,2),mensajeOrientacion:x.mensajeOrientacion});}}>Editar borrador</button><button type="button" disabled={busy} onClick={()=>ejecutar(()=>api.criterioSeguridadOperacion(x.id,'enviar'),'Enviado a revisión.')}>Enviar a revisión</button></div>}
      {x.estado==='en_revision'&&x.autorId===x.actorId&&<button type="button" className="secundario" disabled={busy} onClick={()=>ejecutar(()=>api.criterioSeguridadOperacion(x.id,'devolver'),'Devuelto a borrador para cambios.')}>Devolver a edición</button>}
      {x.estado==='en_revision'&&<div className="acciones-inline"><button type="button" className="secundario" disabled={busy||x.autorId===x.actorId} onClick={()=>decision(x.id,'aprobada')}>Aprobar (revisor)</button><button type="button" className="secundario" disabled={busy||x.autorId===x.actorId} onClick={()=>decision(x.id,'requiere_cambios')}>Solicitar cambios</button></div>}
      {x.estado==='aprobada'&&<button type="button" disabled={busy||x.autorId===x.actorId} onClick={()=>{if(window.confirm('¿Confirmas publicar este criterio clínico ya aprobado?'))ejecutar(()=>api.criterioSeguridadOperacion(x.id,'activar'),'Criterio activado por publicador autorizado.');}}>Activar con autorización clínica</button>}
      {x.estado==='activa'&&<div className="rejilla"><Campo etiqueta="Motivo de retiro" value={motivos[x.id]??''} onChange={(e)=>setMotivos({...motivos,[x.id]:e.target.value})}/><button type="button" className="secundario" disabled={busy||!motivos[x.id]?.trim()} onClick={()=>ejecutar(()=>api.criterioSeguridadOperacion(x.id,'retirar',{motivo:motivos[x.id]}),'Criterio retirado.')}>Retirar criterio</button></div>}
    </li>)}</ul>:!error?<p className="vacio">No hay criterios. Crear un borrador no los activa.</p>:null}
  </section>
  <section className="tarjeta"><h2>{editandoId?'Editar borrador de criterio':'Crear borrador de criterio'}</h2><p className="descripcion-seccion">Redacta el criterio y su orientación. La revisión clínica sigue siendo necesaria antes de activarlo.</p>
    <form onSubmit={crear} className="rejilla"><Campo etiqueta="Código" value={form.codigo} onChange={(e)=>setForm({...form,codigo:e.target.value})} required ayuda="Minúsculas, números y guion bajo."/><Campo etiqueta="Nombre" value={form.nombre} onChange={(e)=>setForm({...form,nombre:e.target.value})} required/><Campo etiqueta="Versión" value={form.version} onChange={(e)=>setForm({...form,version:e.target.value})} required/>
      <label className="campo"><span>Medición</span><select required value={form.tipoMedicion} onChange={(e)=>setForm({...form,tipoMedicion:e.target.value})}><option value="">Selecciona</option><option value="glucosa">Glucosa</option><option value="presion_arterial">Presión arterial</option><option value="hba1c">HbA1c</option></select></label>
      <label className="campo"><span>Población</span><select required value={form.poblacion} onChange={(e)=>setForm({...form,poblacion:e.target.value})}><option value="">Selecciona</option><option value="adolescente_13_17">Adolescentes 13–17</option><option value="adulto_18_mas">Adultos 18+</option></select></label>
      <label className="campo"><span>Enfermedad aplicable (opcional)</span><select value={form.enfermedad} onChange={(e)=>setForm({...form,enfermedad:e.target.value})}><option value="">Sin especificar</option><option value="diabetes_tipo_1">Diabetes tipo 1</option><option value="diabetes_tipo_2">Diabetes tipo 2</option><option value="hipertension">Hipertensión</option></select><small>Si la especificas, se requiere ese diagnóstico confirmado. Déjala vacía para una señal preventiva que pueda aplicar sin diagnóstico.</small></label>
      <label className="campo"><span>Padecimiento posible para mostrar en la alerta</span><select value={form.padecimientoPosible} onChange={(e)=>setForm({...form,padecimientoPosible:e.target.value})}><option value="">No mostrar padecimiento</option><option value="diabetes_tipo_1">Diabetes tipo 1</option><option value="diabetes_tipo_2">Diabetes tipo 2</option><option value="hipertension">Hipertensión arterial</option></select><small>Es una referencia informativa versionada; no es un diagnóstico ni modifica el requisito de diagnóstico del criterio.</small></label>
      <label className="campo" style={{gridColumn:'1/-1'}}><span>Condición estructurada JSON (sin valores sugeridos)</span><textarea rows="4" value={form.condicion} onChange={(e)=>setForm({...form,condicion:e.target.value})} required /><small>Puede incluir <code>contexto</code> para aplicarla solo cuando coincida con el contexto capturado. Si se omite, aplica a cualquier contexto.</small></label>
      <label className="campo" style={{gridColumn:'1/-1'}}><span>Mensaje de orientación revisado</span><textarea rows="3" value={form.mensajeOrientacion} onChange={(e)=>setForm({...form,mensajeOrientacion:e.target.value})} required /><small>Para una señal preventiva, el texto debe aclarar que el resultado no confirma un diagnóstico.</small></label>
      <p className="descripcion-seccion" style={{gridColumn:'1/-1'}}>El tipo fija la unidad: {tipoUnidad[form.tipoMedicion]??'selecciona una medición'}. No se incluyen diagnósticos ni recomendaciones de tratamiento.</p>
      <button disabled={busy}>{busy?'Guardando…':editandoId?'Actualizar borrador':'Guardar borrador'}</button>{editandoId&&<button type="button" className="secundario" disabled={busy} onClick={()=>{setEditandoId(null);setForm(inicial());}}>Cancelar edición</button>}
    </form>
  </section></div>;
}
