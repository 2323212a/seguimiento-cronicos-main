import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import Mensaje from '../componentes/Mensaje.jsx';
import { catalogoMedicamentosEducativo } from '../datos/catalogoMedicamentosEducativo.js';

const formatoFecha = (f) => new Date(f).toLocaleDateString('es-MX', { timeZone: 'UTC' });

export default function Medicamentos() {
  const [lista, setLista] = useState([]); const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);
  const cargar = useCallback(async () => { setCargando(true); setError(''); try { setLista(await api.listarMedicamentos()); } catch (e) { setError(e.message); } finally { setCargando(false); } }, []);
  useEffect(() => { cargar(); }, [cargar]);
  return <>
  <section className="tarjeta">
    <h2>Mis medicamentos prescritos</h2><p className="descripcion-seccion">Consulta las dosis y horarios registrados para ti por tu médico.</p><Mensaje>{error}</Mensaje>
    {cargando ? <p role="status">Cargando medicamentos…</p> : error ? <button type="button" className="secundario" onClick={cargar}>Reintentar</button> : lista.length === 0 ? <p className="vacio">Aún no hay medicamentos prescritos registrados.</p> : <ul className="lista">
      {lista.map((m) => <li key={m.id}>
        <strong>{m.nombre}</strong> — {m.dosis}
        <div className="detalle">{m.frecuencia} · desde {formatoFecha(m.fechaInicio)}{m.fechaFin ? ` hasta ${formatoFecha(m.fechaFin)}` : ''}</div>
        {m.horarios.length > 0 && <div className="detalle">Horarios: {m.horarios.join(', ')}</div>}
      </li>)}
    </ul>}
  </section>
  <section className="tarjeta" aria-labelledby="catalogo-medicamentos-titulo">
    <h2 id="catalogo-medicamentos-titulo">Medicamentos utilizados por padecimiento</h2>
    <p className="descripcion-seccion">Información general de guías clínicas. La lista no asigna tratamientos: tu receta individual es la que muestra qué debes tomar y en qué dosis.</p>
    <div className="catalogo-medicamentos">
      {catalogoMedicamentosEducativo.map((item) => <article className="catalogo-medicamento" key={item.padecimiento}>
        <h3>{item.padecimiento}</h3>
        {item.grupos.map((grupo) => <div className="catalogo-medicamento-grupo" key={grupo.nombre}>
          <strong>{grupo.nombre}</strong><p><b>Grupos:</b> {grupo.ejemplos}</p><p>{grupo.alcance}</p>
        </div>)}
        <div className="catalogo-fuentes"><strong>Fuentes</strong><ul>{item.fuentes.map((fuente) => <li key={fuente.url}><a href={fuente.url} target="_blank" rel="noreferrer">{fuente.nombre}</a></li>)}</ul></div>
      </article>)}
    </div>
  </section>
  </>;
}
