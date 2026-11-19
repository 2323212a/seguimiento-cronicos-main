import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import Mensaje from '../componentes/Mensaje.jsx';
import VincularTelegram from '../componentes/VincularTelegram.jsx';

const fechaLocal = (valor) => {
  if (!valor) return '—';
  const fecha = String(valor).slice(0, 10);
  const [anio, mes, dia] = fecha.split('-').map(Number);
  return new Date(anio, mes - 1, dia).toLocaleDateString('es-MX');
};

export default function Perfil() {
  const [perfil, setPerfil] = useState(null);
  const [objetivos, setObjetivos] = useState([]);
  const [diagnosticos, setDiagnosticos] = useState([]);
  const [error, setError] = useState('');
  const [errorComplementario, setErrorComplementario] = useState('');
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    setCargando(true); setError(''); setErrorComplementario('');
    try {
      const p = await api.perfilPaciente();
      setPerfil(p);
      const [o, d] = await Promise.allSettled([
        api.listarObjetivosPropios(),
        api.listarDiagnosticosPropios(),
      ]);
      setObjetivos(o.status === 'fulfilled' ? o.value : []);
      setDiagnosticos(d.status === 'fulfilled' ? d.value : []);
      if (o.status === 'rejected' || d.status === 'rejected') {
        setErrorComplementario('No se pudieron cargar algunos datos clínicos. Puedes seguir consultando tu perfil y vincular Telegram.');
      }
    } catch (e) {
      setPerfil(null);
      if (e.status === 404) {
        try {
          const sesion = await api.sesion();
          if (sesion.rol === 'paciente' && sesion.idPaciente) {
            setPerfil({ id: sesion.idPaciente, nombre: sesion.nombre, telegramVerificado: false, datosIncompletos: true });
            setErrorComplementario('No se cargaron los datos completos del perfil. Puedes intentar vincular Telegram; si falla, vuelve a iniciar sesión y reintenta.');
            return;
          }
        } catch { /* Se conserva el error original del perfil. */ }
      }
      setError(e.message);
    }
    finally { setCargando(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  if (cargando) return <section className="tarjeta"><p role="status">Cargando tu información…</p></section>;
  return <section className="tarjeta">
    <h2>Mi información</h2>
    <p className="descripcion-seccion">Datos básicos asociados a tu cuenta.</p>
    <Mensaje>{error}</Mensaje>
    <Mensaje>{errorComplementario}</Mensaje>
    {error && <button type="button" className="secundario" onClick={cargar}>Reintentar</button>}
    {perfil && <dl className="perfil">
      <dt>Nombre</dt><dd>{[perfil.nombre, perfil.apellidoPaterno, perfil.apellidoMaterno].filter(Boolean).join(' ')}</dd>
      {!perfil.datosIncompletos && <><dt>Fecha de nacimiento</dt><dd>{fechaLocal(perfil.fechaNacimiento)}</dd>
      <dt>Teléfono</dt><dd>{perfil.telefono || 'No registrado'}</dd></>}
      <dt>Telegram</dt><dd>{perfil.datosIncompletos ? 'Estado no disponible' : perfil.telegramVerificado ? 'Vinculado para avisos genéricos' : 'No vinculado'}</dd>
    </dl>}
    <VincularTelegram perfil={perfil} onVinculado={cargar} />
    {perfil && !perfil.datosIncompletos && <section className="seccion-objetivos"><h3>Objetivos e indicaciones de tu médico</h3><p className="descripcion-seccion">Estos objetivos fueron registrados para ti por tu médico. No son un diagnóstico ni sustituyen una consulta.</p>
      {objetivos.filter((o) => o.estado === 'vigente').length ? <ul className="lista">{objetivos.filter((o) => o.estado === 'vigente').map((o) => <li key={o.id}>
        <strong>{o.tipoMedicion === 'glucosa' ? 'Glucosa' : 'Presión arterial'}{o.contexto ? ` · ${o.contexto}` : ''}</strong>
        <div className="detalle">Vigente desde {fechaLocal(o.vigenteDesde)}{o.vigenteHasta ? ` hasta ${fechaLocal(o.vigenteHasta)}` : ''}</div>
        <p>{o.indicacionPaciente}</p>
      </li>)}</ul> : <p className="vacio">Tu médico aún no ha registrado objetivos individuales.</p>}
    </section>}
    {perfil && !perfil.datosIncompletos && <section className="seccion-objetivos"><h3>Diagnósticos confirmados por el equipo médico</h3><p className="descripcion-seccion">Esta lista muestra únicamente registros confirmados por un médico; no se infieren a partir de tus mediciones.</p>
      {diagnosticos.length?<ul className="lista">{diagnosticos.map((d)=><li key={d.id}><strong>{{diabetes_tipo_1:'Diabetes tipo 1',diabetes_tipo_2:'Diabetes tipo 2',hipertension:'Hipertensión arterial'}[d.codigo]??d.codigo}</strong><div className="detalle">{d.estado} · confirmado {String(d.confirmadoEn).slice(0,10)}</div></li>)}</ul>:<p className="vacio">No hay diagnósticos confirmados registrados.</p>}
    </section>}
  </section>;
}
