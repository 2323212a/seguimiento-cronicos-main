import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import Mensaje from '../componentes/Mensaje.jsx';
import OrientacionPadecimiento from '../componentes/OrientacionPadecimiento.jsx';

export default function Alertas() {
  const [alertas, setAlertas] = useState([]); const [error, setError] = useState(''); const [cargando, setCargando] = useState(true);
  const cargar = useCallback(async () => { setCargando(true); setError(''); try { setAlertas(await api.listarAlertasPropias()); } catch (e) { setError(e.message); } finally { setCargando(false); } }, []);
  useEffect(() => { cargar(); const timer = window.setInterval(() => api.listarAlertasPropias().then(setAlertas).catch(() => {}), 30000); return () => window.clearInterval(timer); }, [cargar]);
  return <section className="tarjeta"><h2>Mis alertas</h2><p className="descripcion-seccion">Avisos relacionados con tu seguimiento. Para dudas sobre tu salud, contacta a tu equipo de atención.</p><Mensaje>{error}</Mensaje>
    {cargando ? <p role="status">Cargando alertas…</p> : error ? <button type="button" className="secundario" onClick={cargar}>Reintentar</button> : alertas.length ? <ul className="lista">{alertas.map((a) => <li key={a.id}>
      <strong>{a.tipo}</strong> · {a.estado}
      <div className="detalle">{new Date(a.fechaGeneracion).toLocaleString('es-MX')}</div>
      <div>{a.motivo}</div>
      {a.clasificacion === 'seguridad' && <p role="note">Aviso preventivo: esta alerta no confirma un diagnóstico. Consulta su significado con tu profesional de salud.</p>}
      {a.medicion && <div className="detalle">Medición: {a.medicion.tipo === 'glucosa' || a.medicion.tipo==='hba1c' ? `${a.medicion.valor} ${a.medicion.unidad}` : `${a.medicion.sistolica}/${a.medicion.diastolica} ${a.medicion.unidad}`}{a.medicion.contexto ? ` · ${a.medicion.contexto}` : ''}</div>}
      {a.criterioActivado && <div className="detalle">Criterio: {a.criterioActivado}</div>}
      {a.indicacionPaciente && <p><strong>{a.clasificacion === 'seguridad' ? 'Orientación aprobada para este criterio:' : 'Indicación registrada por tu médico:'}</strong> {a.indicacionPaciente}</p>}
      {a.fuente && <div className="detalle">Fuente aprobada: {a.fuente.institucion} · {a.fuente.titulo} · <a href={a.fuente.url} target="_blank" rel="noreferrer">Consultar fuente</a></div>}
      <OrientacionPadecimiento codigo={a.padecimientoPosible ?? a.condicionAplicada?.padecimientoPosible} />
    </li>)}</ul> : <p className="vacio">No hay alertas registradas.</p>}
  </section>;
}
