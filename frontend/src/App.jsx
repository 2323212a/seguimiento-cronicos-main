import { useState } from 'react';
import { useSesion } from './useSesion.js';
import Acceso from './paginas/Acceso.jsx';
import Panel from './paginas/Panel.jsx';
import Mensaje from './componentes/Mensaje.jsx';

export default function App() {
  const { sesion, entrar, salir, cargando } = useSesion();
  const [errorSalida, setErrorSalida] = useState('');
  const [saliendo, setSaliendo] = useState(false);
  const cerrarSesion = async () => {
    setSaliendo(true); setErrorSalida('');
    try { await salir(); } catch (e) { setErrorSalida(e.message); }
    finally { setSaliendo(false); }
  };

  return (
    <div className="app">
      <header className="encabezado">
        <h1><span aria-hidden="true">✚</span> Seguimiento de salud</h1>
        {sesion && (
          <div className="sesion">
            <span>{sesion.nombre ? `${sesion.nombre} · ` : ''}{sesion.rol}</span>
            <button className="secundario" onClick={cerrarSesion} disabled={saliendo}>{saliendo ? 'Saliendo…' : 'Salir'}</button>
          </div>
        )}
      </header>

      <Mensaje>{errorSalida}</Mensaje>

      <main>
        {cargando ? <p role="status">Comprobando sesión…</p> : sesion ? <Panel sesion={sesion} /> : <Acceso onEntrar={entrar} />}
      </main>

      <footer className="pie">
        Esta aplicación sirve para registrar y organizar tu información de seguimiento.
        No diagnostica enfermedades ni sustituye la atención médica.
      </footer>
    </div>
  );
}
