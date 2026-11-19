import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import Mensaje from '../componentes/Mensaje.jsx';
import VincularTelegram from '../componentes/VincularTelegram.jsx';

const fechaLocal = (valor) => {
  if (!valor) return '—';
  const [anio, mes, dia] = String(valor).slice(0, 10).split('-').map(Number);
  return new Date(anio, mes - 1, dia).toLocaleDateString('es-MX');
};

const ACCESOS = [
  { vista: 'mediciones', titulo: 'Registrar medición', texto: 'Agrega una medición y consulta su historial.', accion: 'Ir a mediciones' },
  { vista: 'medicamentos', titulo: 'Medicamentos', texto: 'Consulta tus medicamentos y horarios registrados.', accion: 'Ver medicamentos' },
  { vista: 'alertas', titulo: 'Notificaciones', texto: 'Revisa las alertas disponibles en tu cuenta.', accion: 'Ver alertas' },
];

export default function InicioPaciente({ onNavigate }) {
  const [perfil, setPerfil] = useState(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    setCargando(true); setError('');
    try { setPerfil(await api.perfilPaciente()); }
    catch (e) { setError(e.message); }
    finally { setCargando(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const nombre = perfil ? [perfil.nombre, perfil.apellidoPaterno, perfil.apellidoMaterno].filter(Boolean).join(' ') : '';
  return <div className="inicio-paciente">
    <section className="inicio-bienvenida">
      <span className="inicio-eyebrow">Tu espacio de seguimiento</span>
      <h2>{nombre ? `Hola, ${nombre}` : 'Bienvenido a tu seguimiento'}</h2>
      <p>Registra tus datos y consulta la información que tu equipo de atención tiene disponible.</p>
    </section>
    {cargando ? <section className="tarjeta"><p role="status">Cargando tu resumen…</p></section> : error ? <section className="tarjeta"><Mensaje>{error}</Mensaje><button className="secundario" type="button" onClick={cargar}>Reintentar</button></section> : perfil && <section className="tarjeta resumen-personal">
      <div><span className="resumen-etiqueta">Resumen personal</span><strong>{nombre || 'Nombre no disponible'}</strong></div>
      <dl><dt>Fecha de nacimiento</dt><dd>{fechaLocal(perfil.fechaNacimiento)}</dd><dt>Teléfono</dt><dd>{perfil.telefono || 'No registrado'}</dd></dl>
      <p>Telegram: {perfil.telegramVerificado ? 'vinculado' : 'sin vincular'}</p>
      <button className="secundario" type="button" onClick={() => onNavigate('perfil')}>
        {perfil.telegramVerificado ? 'Ver mi información' : 'Ingresar código de Telegram'}
      </button>
    </section>}
    {!cargando && !error && perfil && <VincularTelegram perfil={perfil} onVinculado={cargar} />}
    <section aria-labelledby="accesos-paciente">
      <div className="titulo-seccion"><div><h2 id="accesos-paciente">Accesos rápidos</h2><p>Elige qué quieres consultar o registrar.</p></div></div>
      <div className="accesos-paciente">
        {ACCESOS.map((item) => <article className="acceso-paciente" key={item.vista}>
          <h3>{item.titulo}</h3><p>{item.texto}</p><button type="button" className="secundario" onClick={() => onNavigate(item.vista)}>{item.accion}</button>
        </article>)}
      </div>
    </section>
  </div>;
}
