import { useCallback,useEffect,useState } from 'react';
import { api } from '../api.js';
import Campo from '../componentes/Campo.jsx';
import Mensaje from '../componentes/Mensaje.jsx';

const nombres={diabetes_tipo_1:'Diabetes tipo 1',diabetes_tipo_2:'Diabetes tipo 2',hipertension:'Hipertensión arterial'};
export default function DiagnosticosMedico({idPaciente}){
  const [items,setItems]=useState([]);const [codigo,setCodigo]=useState('');const [fecha,setFecha]=useState('');
  const [error,setError]=useState('');const [aviso,setAviso]=useState('');const [guardando,setGuardando]=useState(false);
  const cargar=useCallback(async()=>{setError('');try{setItems(await api.listarDiagnosticosPaciente(idPaciente));}catch(e){setError(e.message);}},[idPaciente]);
  useEffect(()=>{cargar();},[cargar]);
  const registrar=async(e)=>{e.preventDefault();setError('');setAviso('');setGuardando(true);try{
    await api.registrarDiagnosticoPaciente(idPaciente,{codigo,confirmadoEn:fecha||undefined});setCodigo('');setFecha('');setAviso('Diagnóstico registrado por ti; el historial conserva la confirmación.');await cargar();
  }catch(err){setError(err.message);}finally{setGuardando(false);}};
  const cerrar=async(id)=>{if(!window.confirm('¿Confirmas cerrar este registro? Se conservará en el historial.'))return;setError('');try{await api.cerrarDiagnosticoPaciente(idPaciente,id);setAviso('Registro cerrado.');await cargar();}catch(e){setError(e.message);}};
  return <>
    <section className="tarjeta"><h2>Diagnósticos confirmados</h2><p className="descripcion-seccion">Solo se muestran diagnósticos que tú o el equipo autorizado registraron. No se infieren a partir de mediciones.</p><Mensaje>{error}</Mensaje>
      {items.length?<ul className="lista">{items.map((x)=><li key={x.id}><strong>{nombres[x.codigo]??x.codigo}</strong><div className="detalle">Confirmado: {String(x.confirmadoEn).slice(0,10)} · {x.estado}</div>{x.estado==='confirmado'&&<button type="button" className="secundario" disabled={guardando} onClick={()=>cerrar(x.id)}>Cerrar registro</button>}</li>)}</ul>:<p className="vacio">No hay diagnósticos registrados.</p>}
    </section>
    <section className="tarjeta"><h2>Registrar diagnóstico confirmado</h2><p className="descripcion-seccion">Registra únicamente diagnósticos establecidos clínicamente. No se genera ninguno automáticamente.</p>
      <form onSubmit={registrar}><label className="campo"><span>Diagnóstico confirmado <span className="campo-obligatorio" aria-hidden="true">*</span></span><select value={codigo} onChange={(e)=>setCodigo(e.target.value)} required><option value="">Selecciona</option>{Object.entries(nombres).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
        <Campo etiqueta="Fecha de confirmación" type="date" value={fecha} onChange={(e)=>setFecha(e.target.value)} />
        <Mensaje>{error}</Mensaje><Mensaje tipo="exito">{aviso}</Mensaje><button disabled={guardando}>{guardando?'Guardando…':'Registrar diagnóstico'}</button>
      </form>
    </section>
  </>;
}
