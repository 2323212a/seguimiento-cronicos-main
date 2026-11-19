import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import Campo from '../componentes/Campo.jsx';
import Mensaje from '../componentes/Mensaje.jsx';
import Grafica from '../componentes/Grafica.jsx';

const ahoraLocal = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};
const FORM_INICIAL = () => ({
  tipo: 'glucosa', glucosa: '', sistolica: '', diastolica: '', hba1c: '', contexto: '', fechaHora: ahoraLocal(), observaciones: '',
});
const formatoFecha = (f) => new Date(f).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });

export default function Mediciones() {
  const [filtro, setFiltro] = useState('glucosa');
  const [lista, setLista] = useState([]);
  const [form, setForm] = useState(FORM_INICIAL);
  const [erroresCampos, setErroresCampos] = useState({});
  const [error, setError] = useState('');
  const [errorCarga, setErrorCarga] = useState('');
  const [aviso, setAviso] = useState('');
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const envioEnCurso = useRef(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setErrorCarga('');
    try { setLista(await api.listarMediciones({ tipo: filtro })); } catch (e) { setErrorCarga(e.message); }
    finally { setCargando(false); }
  }, [filtro]);

  useEffect(() => { cargar(); }, [cargar]);

  const cambiar = (e) => {
    const { name, value } = e.target;
    setForm((actual) => ({ ...actual, [name]: value }));
    setErroresCampos((actual) => ({ ...actual, [name]: '' }));
    setError('');
  };

  const guardar = async (e) => {
    e.preventDefault();
    setError(''); setAviso('');
    const errores = {};
    if (form.tipo === 'glucosa') {
      if (!form.glucosa || !Number.isFinite(Number(form.glucosa)) || Number(form.glucosa) <= 0) errores.glucosa = 'Ingresa un valor numérico mayor que cero en mg/dL.';
      else if (Number(form.glucosa) > 9999.99) errores.glucosa = 'El valor excede el máximo que el sistema puede almacenar.';
      else if (!/^\d+(\.\d{1,2})?$/.test(form.glucosa)) errores.glucosa = 'Usa hasta dos cifras decimales.';
    }
    if (form.tipo === 'presion_arterial') {
      if (!form.sistolica || !Number.isInteger(Number(form.sistolica)) || Number(form.sistolica) <= 0 || Number(form.sistolica) > 32767) errores.sistolica = 'Ingresa un entero positivo representable en mmHg.';
      if (!form.diastolica || !Number.isInteger(Number(form.diastolica)) || Number(form.diastolica) <= 0 || Number(form.diastolica) > 32767) errores.diastolica = 'Ingresa un entero positivo representable en mmHg.';
      if (!errores.sistolica && !errores.diastolica && Number(form.sistolica) <= Number(form.diastolica)) errores.sistolica = 'Debe ser mayor que el valor diastólico.';
    }
    if (form.tipo === 'hba1c') {
      if(!form.hba1c||!Number.isFinite(Number(form.hba1c))||Number(form.hba1c)<=0) errores.hba1c='Ingresa un porcentaje positivo.';
      else if(Number(form.hba1c)>999.99) errores.hba1c='El valor excede la capacidad técnica del sistema.';
      else if(!/^\d+(\.\d{1,2})?$/.test(form.hba1c)) errores.hba1c='Usa hasta dos cifras decimales.';
    }
    setErroresCampos(errores);
    if (Object.keys(errores).length) return;
    if (!window.confirm('Confirma que deseas guardar esta medición en tu historial.')) return;
    if (envioEnCurso.current) return;
    envioEnCurso.current = true; setGuardando(true);
    const base = {
      tipo: form.tipo,
      unidad: form.tipo === 'glucosa' ? 'mg/dL' : form.tipo === 'presion_arterial' ? 'mmHg' : '%',
      fechaHora: new Date(form.fechaHora).toISOString(),
      ...(form.contexto && { contexto: form.contexto }),
      ...(form.observaciones && { observaciones: form.observaciones }),
    };
    const datos = form.tipo === 'glucosa'
      ? { ...base, glucosaMgDl: Number(form.glucosa) }
      : form.tipo === 'presion_arterial' ? { ...base, sistolicaMmhg: Number(form.sistolica), diastolicaMmhg: Number(form.diastolica) }
        : { ...base, hba1cPercent: Number(form.hba1c) };
    try {
      await api.registrarMedicion(datos);
      setAviso('Medición guardada.');
      setForm({ ...FORM_INICIAL(), tipo: form.tipo });
      setErroresCampos({});
      if (filtro !== form.tipo) setFiltro(form.tipo);
      else await cargar();
    } catch (err) { setError(err.message); }
    finally { envioEnCurso.current = false; setGuardando(false); }
  };

  const cronologica = [...lista].reverse();
  const series = filtro === 'glucosa'
    ? [{ nombre: 'Glucosa', puntos: cronologica.map((m) => ({ x: new Date(m.fechaHora), y: m.glucosaMgDl })) }]
    : filtro === 'hba1c' ? [{ nombre: 'HbA1c', puntos: cronologica.map((m)=>({x:new Date(m.fechaHora),y:m.hba1cPercent})) }]
      : [
      { nombre: 'Sistólica', puntos: cronologica.map((m) => ({ x: new Date(m.fechaHora), y: m.sistolicaMmhg })) },
      { nombre: 'Diastólica', puntos: cronologica.map((m) => ({ x: new Date(m.fechaHora), y: m.diastolicaMmhg })) },
    ];

  return (
    <div className="dos-columnas">
      <section className="tarjeta">
        <h2>Nueva medición</h2>
        <p className="descripcion-seccion">Registra el valor y el momento en que lo tomaste. Los campos con * son obligatorios.</p>
        <form onSubmit={guardar}>
          <label className="campo">
            <span>Tipo</span>
            <select name="tipo" value={form.tipo} onChange={cambiar}>
              <option value="glucosa">Glucosa</option>
              <option value="presion_arterial">Presión arterial</option>
              <option value="hba1c">HbA1c</option>
            </select>
          </label>
          {form.tipo === 'glucosa' ? (
          <Campo etiqueta="Glucosa (mg/dL)" type="number" step="0.01" min="0.01" max="9999.99" name="glucosa" value={form.glucosa} onChange={cambiar} error={erroresCampos.glucosa} required />
          ) : form.tipo === 'presion_arterial' ? (
            <div className="rejilla">
              <Campo etiqueta="Sistólica (mmHg)" type="number" step="1" min="1" max="32767" name="sistolica" value={form.sistolica} onChange={cambiar} error={erroresCampos.sistolica} required />
              <Campo etiqueta="Diastólica (mmHg)" type="number" step="1" min="1" max="32767" name="diastolica" value={form.diastolica} onChange={cambiar} error={erroresCampos.diastolica} required />
            </div>
          ) : <Campo etiqueta="HbA1c (%)" type="number" step="0.01" min="0.01" max="999.99" name="hba1c" value={form.hba1c} onChange={cambiar} error={erroresCampos.hba1c} required />}
          <Campo etiqueta="Fecha y hora" type="datetime-local" name="fechaHora" value={form.fechaHora} onChange={cambiar} required />
          <Campo etiqueta="Contexto (opcional)" name="contexto" value={form.contexto} onChange={cambiar} ayuda="Ej. en ayunas, después de comer" />
          <Campo etiqueta="Observaciones (opcional)" name="observaciones" value={form.observaciones} onChange={cambiar} />
          <Mensaje>{error}</Mensaje>
          <Mensaje tipo="exito">{aviso}</Mensaje>
          <button type="submit" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar medición'}</button>
        </form>
      </section>

      <section className="tarjeta">
        <div className="titulo-fila">
          <div><h2>Historial</h2><p className="descripcion-seccion">Consulta tus registros anteriores por tipo de medición.</p></div>
          <select value={filtro} onChange={(e) => setFiltro(e.target.value)} aria-label="Filtrar por tipo">
            <option value="glucosa">Glucosa</option>
            <option value="presion_arterial">Presión arterial</option><option value="hba1c">HbA1c</option>
          </select>
        </div>
        {cargando ? <p role="status">Cargando historial…</p> : errorCarga ? <><p className="vacio">No se pudo cargar el historial.</p><button type="button" className="secundario" onClick={cargar}>Reintentar</button></> : <>
        <Grafica series={series} unidad={filtro === 'glucosa' ? 'mg/dL' : filtro === 'presion_arterial' ? 'mmHg' : '%'} />
        {lista.length === 0 ? <p className="vacio">Aún no hay mediciones de este tipo.</p> : (
          <div className="tabla-scroll">
            <table>
              <thead><tr><th>Fecha</th><th>Valor</th><th>Contexto</th></tr></thead>
              <tbody>
                {lista.map((m) => (
                  <tr key={m.id}>
                    <td>{formatoFecha(m.fechaHora)}</td>
                    <td>{filtro === 'glucosa' ? `${m.glucosaMgDl} mg/dL` : filtro === 'presion_arterial' ? `${m.sistolicaMmhg}/${m.diastolicaMmhg} mmHg` : `${m.hba1cPercent} %`}</td>
                    <td>{m.contexto ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        </>}
      </section>
    </div>
  );
}
