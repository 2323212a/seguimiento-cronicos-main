#!/usr/bin/env bash
# Agrega el frontend (React + Vite) al proyecto.
# Uso: desde la carpeta seguimiento-cronicos ->  bash agregar_frontend.sh
set -euo pipefail
[ -d backend/src ] || { echo "Ejecuta este script dentro de la carpeta seguimiento-cronicos"; exit 1; }
mkdir -p "frontend" "frontend/src" "frontend/src/componentes" "frontend/src/paginas"
cat > "README.md" << '__FIN_ARCHIVO__'
# App de seguimiento para pacientes con enfermedades crónicas

Backend en Node.js con **arquitectura hexagonal** (puertos y adaptadores) y PostgreSQL.
Taller de Desarrollo 3 — UNACH.

## Estructura (backend/src)

    domain/            Entidades y reglas (Paciente, Medicion, Medicamento, errores)
    application/
      ports/           Contratos (repositorios, hasher, evaluador de alertas)
      use-cases/       Casos de uso (registrar paciente/medición/medicamento, historial)
    infrastructure/
      persistence/     Adaptadores PostgreSQL (con Database Singleton) y en memoria
      http/            Adaptador de entrada (Express)
      security/        Hash de contraseñas (bcryptjs)
      alertas/         Evaluador de alertas provisional (criterios clínicos pendientes)
    config/container.js   Raíz de composición
    server.js             Arranque

## Arranque

    cd backend
    cp .env.example .env
    docker compose up -d        # PostgreSQL con sql/schema.sql (o usa tu pgAdmin)
    npm test
    npm run dev

## Endpoints

    GET  /api/salud
    POST /api/pacientes
    POST /api/pacientes/:id/mediciones
    GET  /api/pacientes/:id/mediciones?tipo=&desde=&hasta=
    POST /api/pacientes/:id/medicamentos
    GET  /api/pacientes/:id/medicamentos

## Frontend (React + Vite)

    cd frontend
    npm install
    npm run dev          # http://localhost:5173 (usa proxy /api -> localhost:3000)

Pantallas: crear cuenta / entrar con ID, registro e historial de mediciones (con gráfica),
registro y lista de medicamentos con horarios.

## Integración con n8n

El backend avisa a n8n y n8n llama al backend (rutas protegidas con `x-api-key`):

    Backend --(webhook evento medicion.registrada)--> n8n --> Telegram
    n8n (cada minuto) --> GET  /api/automatizacion/recordatorios?hora=HH:MM --> Telegram
    n8n --> POST /api/automatizacion/notificaciones   (registra lo enviado)

Workflows importables en `backend/n8n/`. Variables en `.env`: N8N_API_KEY y N8N_WEBHOOK_URL.

## Pendiente

Autenticación (JWT), alertas (criterios clínicos), Telegram, reportes, frontend, app móvil, automatizaciones y despliegue en EC2.
__FIN_ARCHIVO__
cat > "frontend/.env.example" << '__FIN_ARCHIVO__'
# En desarrollo se usa el proxy de Vite hacia http://localhost:3000.
# Para apuntar a otra API (p. ej. EC2) descomenta y ajusta:
# VITE_API_URL=http://TU-IP-PUBLICA:3000/api
__FIN_ARCHIVO__
cat > "frontend/.gitignore" << '__FIN_ARCHIVO__'
node_modules/
dist/
.env
__FIN_ARCHIVO__
cat > "frontend/index.html" << '__FIN_ARCHIVO__'
<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Seguimiento de salud</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
__FIN_ARCHIVO__
cat > "frontend/package.json" << '__FIN_ARCHIVO__'
{
  "name": "seguimiento-cronicos-frontend",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.4",
    "vite": "^5.4.11"
  }
}
__FIN_ARCHIVO__
cat > "frontend/src/App.jsx" << '__FIN_ARCHIVO__'
import { useSesion } from './useSesion.js';
import Acceso from './paginas/Acceso.jsx';
import Panel from './paginas/Panel.jsx';

export default function App() {
  const { sesion, entrar, salir } = useSesion();

  return (
    <div className="app">
      <header className="encabezado">
        <h1>🩺 Seguimiento de salud</h1>
        {sesion && (
          <div className="sesion">
            <span>{sesion.nombre ? `${sesion.nombre} · ` : ''}Paciente #{sesion.idPaciente}</span>
            <button className="secundario" onClick={salir}>Salir</button>
          </div>
        )}
      </header>

      <main>
        {sesion ? <Panel idPaciente={sesion.idPaciente} /> : <Acceso onEntrar={entrar} />}
      </main>

      <footer className="pie">
        Esta aplicación sirve para registrar y organizar tu información de seguimiento.
        No diagnostica enfermedades ni sustituye la atención médica.
      </footer>
    </div>
  );
}
__FIN_ARCHIVO__
cat > "frontend/src/api.js" << '__FIN_ARCHIVO__'
// Cliente de la API del backend (adaptador hacia el servidor).
const BASE = import.meta.env.VITE_API_URL ?? '/api';

async function pedir(ruta, opciones = {}) {
  const respuesta = await fetch(BASE + ruta, {
    headers: { 'content-type': 'application/json' },
    ...opciones,
  });
  const datos = await respuesta.json().catch(() => null);
  if (!respuesta.ok) throw new Error(datos?.error ?? `Error ${respuesta.status}`);
  return datos;
}

const post = (ruta, cuerpo) => pedir(ruta, { method: 'POST', body: JSON.stringify(cuerpo) });

export const api = {
  registrarPaciente: (datos) => post('/pacientes', datos),
  // Verifica que el paciente exista (404 si no)
  comprobarPaciente: (id) => pedir(`/pacientes/${id}/medicamentos`),
  listarMediciones: (id, { tipo } = {}) =>
    pedir(`/pacientes/${id}/mediciones${tipo ? `?tipo=${tipo}` : ''}`),
  registrarMedicion: (id, datos) => post(`/pacientes/${id}/mediciones`, datos),
  listarMedicamentos: (id) => pedir(`/pacientes/${id}/medicamentos`),
  registrarMedicamento: (id, datos) => post(`/pacientes/${id}/medicamentos`, datos),
};
__FIN_ARCHIVO__
cat > "frontend/src/componentes/Campo.jsx" << '__FIN_ARCHIVO__'
export default function Campo({ etiqueta, ayuda, ...props }) {
  return (
    <label className="campo">
      <span>{etiqueta}</span>
      <input {...props} />
      {ayuda && <small>{ayuda}</small>}
    </label>
  );
}
__FIN_ARCHIVO__
cat > "frontend/src/componentes/Grafica.jsx" << '__FIN_ARCHIVO__'
// Gráfica de líneas simple en SVG (sin librerías).
const ANCHO = 640;
const ALTO = 220;
const M = { izq: 44, der: 12, arr: 12, aba: 28 };
const COLORES = ['#2563eb', '#dc2626'];

export default function Grafica({ series, unidad }) {
  const todos = series.flatMap((s) => s.puntos);
  if (todos.length < 2) {
    return <p className="vacio">Registra al menos 2 mediciones para ver la evolución.</p>;
  }
  const xs = todos.map((p) => p.x.getTime());
  const ys = todos.map((p) => p.y);
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const margen = (Math.max(...ys) - Math.min(...ys)) * 0.1 || 5;
  const [y0, y1] = [Math.min(...ys) - margen, Math.max(...ys) + margen];

  const px = (x) => M.izq + ((x - x0) / (x1 - x0 || 1)) * (ANCHO - M.izq - M.der);
  const py = (y) => ALTO - M.aba - ((y - y0) / (y1 - y0 || 1)) * (ALTO - M.arr - M.aba);
  const marcas = [y0, (y0 + y1) / 2, y1];
  const fecha = (t) => new Date(t).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });

  return (
    <div className="grafica">
      <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} role="img" aria-label={`Evolución en ${unidad}`}>
        {marcas.map((m) => (
          <g key={m}>
            <line x1={M.izq} x2={ANCHO - M.der} y1={py(m)} y2={py(m)} stroke="#e5e7eb" />
            <text x={M.izq - 6} y={py(m) + 4} textAnchor="end" fontSize="11" fill="#6b7280">{Math.round(m)}</text>
          </g>
        ))}
        <text x={M.izq} y={ALTO - 8} fontSize="11" fill="#6b7280">{fecha(x0)}</text>
        <text x={ANCHO - M.der} y={ALTO - 8} fontSize="11" fill="#6b7280" textAnchor="end">{fecha(x1)}</text>
        {series.map((s, i) => (
          <g key={s.nombre}>
            <polyline fill="none" stroke={COLORES[i]} strokeWidth="2"
              points={s.puntos.map((p) => `${px(p.x.getTime())},${py(p.y)}`).join(' ')} />
            {s.puntos.map((p) => (
              <circle key={p.x.getTime()} cx={px(p.x.getTime())} cy={py(p.y)} r="3" fill={COLORES[i]} />
            ))}
          </g>
        ))}
      </svg>
      <div className="leyenda">
        {series.map((s, i) => (
          <span key={s.nombre}><i style={{ background: COLORES[i] }} /> {s.nombre} ({unidad})</span>
        ))}
      </div>
    </div>
  );
}
__FIN_ARCHIVO__
cat > "frontend/src/componentes/Mensaje.jsx" << '__FIN_ARCHIVO__'
export default function Mensaje({ tipo = 'error', children }) {
  if (!children) return null;
  return <div className={`mensaje ${tipo}`} role={tipo === 'error' ? 'alert' : 'status'}>{children}</div>;
}
__FIN_ARCHIVO__
cat > "frontend/src/main.jsx" << '__FIN_ARCHIVO__'
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
__FIN_ARCHIVO__
cat > "frontend/src/paginas/Acceso.jsx" << '__FIN_ARCHIVO__'
import { useState } from 'react';
import { api } from '../api.js';
import Campo from '../componentes/Campo.jsx';
import Mensaje from '../componentes/Mensaje.jsx';

const VACIO = {
  nombre: '', apellidoPaterno: '', apellidoMaterno: '', fechaNacimiento: '',
  correo: '', contrasena: '', telefono: '', telegramChatId: '',
};

export default function Acceso({ onEntrar }) {
  const [modo, setModo] = useState('registro');
  const [form, setForm] = useState(VACIO);
  const [idExistente, setIdExistente] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  const cambiar = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const registrar = async (e) => {
    e.preventDefault();
    setError(''); setCargando(true);
    try {
      const datos = { ...form };
      for (const k of ['apellidoMaterno', 'telefono', 'telegramChatId']) if (!datos[k]) delete datos[k];
      const paciente = await api.registrarPaciente(datos);
      onEntrar({ idPaciente: paciente.id, nombre: paciente.nombre });
    } catch (err) { setError(err.message); } finally { setCargando(false); }
  };

  const ingresar = async (e) => {
    e.preventDefault();
    setError(''); setCargando(true);
    try {
      const id = Number(idExistente);
      await api.comprobarPaciente(id);
      onEntrar({ idPaciente: id });
    } catch (err) { setError(err.message); } finally { setCargando(false); }
  };

  return (
    <section className="tarjeta acceso">
      <div className="pestanas">
        <button className={modo === 'registro' ? 'activa' : ''} onClick={() => { setModo('registro'); setError(''); }}>
          Crear cuenta
        </button>
        <button className={modo === 'ingresar' ? 'activa' : ''} onClick={() => { setModo('ingresar'); setError(''); }}>
          Ya tengo ID
        </button>
      </div>

      {modo === 'registro' ? (
        <form onSubmit={registrar}>
          <div className="rejilla">
            <Campo etiqueta="Nombre" name="nombre" value={form.nombre} onChange={cambiar} required />
            <Campo etiqueta="Apellido paterno" name="apellidoPaterno" value={form.apellidoPaterno} onChange={cambiar} required />
            <Campo etiqueta="Apellido materno" name="apellidoMaterno" value={form.apellidoMaterno} onChange={cambiar} />
            <Campo etiqueta="Fecha de nacimiento" type="date" name="fechaNacimiento" value={form.fechaNacimiento} onChange={cambiar} required />
            <Campo etiqueta="Correo" type="email" name="correo" value={form.correo} onChange={cambiar} required />
            <Campo etiqueta="Contraseña" type="password" name="contrasena" value={form.contrasena} onChange={cambiar} minLength={8} required ayuda="Mínimo 8 caracteres" />
            <Campo etiqueta="Teléfono (opcional)" name="telefono" value={form.telefono} onChange={cambiar} />
            <Campo etiqueta="ID de chat de Telegram (opcional)" name="telegramChatId" value={form.telegramChatId} onChange={cambiar} ayuda="Para recibir recordatorios por Telegram" />
          </div>
          <Mensaje>{error}</Mensaje>
          <button type="submit" disabled={cargando}>{cargando ? 'Creando…' : 'Crear cuenta'}</button>
        </form>
      ) : (
        <form onSubmit={ingresar}>
          <Campo etiqueta="ID de paciente" type="number" min="1" value={idExistente} onChange={(e) => setIdExistente(e.target.value)} required
            ayuda="Es el número que aparece arriba al crear tu cuenta" />
          <Mensaje>{error}</Mensaje>
          <button type="submit" disabled={cargando}>{cargando ? 'Entrando…' : 'Entrar'}</button>
        </form>
      )}
    </section>
  );
}
__FIN_ARCHIVO__
cat > "frontend/src/paginas/Medicamentos.jsx" << '__FIN_ARCHIVO__'
import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import Campo from '../componentes/Campo.jsx';
import Mensaje from '../componentes/Mensaje.jsx';

const FORM_INICIAL = {
  nombre: '', dosis: '', frecuencia: '', fechaInicio: new Date().toISOString().slice(0, 10),
  fechaFin: '', horarios: '', observaciones: '',
};
const formatoFecha = (f) => new Date(f).toLocaleDateString('es-MX', { timeZone: 'UTC' });

export default function Medicamentos({ idPaciente }) {
  const [lista, setLista] = useState([]);
  const [form, setForm] = useState(FORM_INICIAL);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  const cargar = useCallback(async () => {
    try { setLista(await api.listarMedicamentos(idPaciente)); } catch (e) { setError(e.message); }
  }, [idPaciente]);

  useEffect(() => { cargar(); }, [cargar]);

  const cambiar = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const guardar = async (e) => {
    e.preventDefault();
    setError(''); setAviso('');
    const horarios = form.horarios.split(',').map((h) => h.trim()).filter(Boolean);
    const datos = {
      nombre: form.nombre, dosis: form.dosis, frecuencia: form.frecuencia,
      fechaInicio: form.fechaInicio, horarios,
      ...(form.fechaFin && { fechaFin: form.fechaFin }),
      ...(form.observaciones && { observaciones: form.observaciones }),
    };
    try {
      await api.registrarMedicamento(idPaciente, datos);
      setAviso('Medicamento guardado.');
      setForm(FORM_INICIAL);
      cargar();
    } catch (err) { setError(err.message); }
  };

  return (
    <div className="dos-columnas">
      <section className="tarjeta">
        <h2>Nuevo medicamento</h2>
        <form onSubmit={guardar}>
          <Campo etiqueta="Nombre" name="nombre" value={form.nombre} onChange={cambiar} required />
          <div className="rejilla">
            <Campo etiqueta="Dosis" name="dosis" value={form.dosis} onChange={cambiar} required ayuda="Ej. 850 mg" />
            <Campo etiqueta="Frecuencia" name="frecuencia" value={form.frecuencia} onChange={cambiar} required ayuda="Ej. cada 12 horas" />
            <Campo etiqueta="Fecha de inicio" type="date" name="fechaInicio" value={form.fechaInicio} onChange={cambiar} required />
            <Campo etiqueta="Fecha de fin (opcional)" type="date" name="fechaFin" value={form.fechaFin} onChange={cambiar} />
          </div>
          <Campo etiqueta="Horarios (para recordatorios)" name="horarios" value={form.horarios} onChange={cambiar} ayuda="Formato HH:MM separados por coma. Ej. 08:00, 20:00" />
          <Campo etiqueta="Observaciones (opcional)" name="observaciones" value={form.observaciones} onChange={cambiar} />
          <Mensaje>{error}</Mensaje>
          <Mensaje tipo="exito">{aviso}</Mensaje>
          <button type="submit">Guardar medicamento</button>
        </form>
      </section>

      <section className="tarjeta">
        <h2>Mis medicamentos</h2>
        {lista.length === 0 ? <p className="vacio">Aún no has registrado medicamentos.</p> : (
          <ul className="lista">
            {lista.map((m) => (
              <li key={m.id}>
                <strong>{m.nombre}</strong> — {m.dosis}
                <div className="detalle">
                  {m.frecuencia} · desde {formatoFecha(m.fechaInicio)}{m.fechaFin ? ` hasta ${formatoFecha(m.fechaFin)}` : ''}
                </div>
                {m.horarios.length > 0 && <div className="detalle">Horarios: {m.horarios.join(', ')}</div>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
__FIN_ARCHIVO__
cat > "frontend/src/paginas/Mediciones.jsx" << '__FIN_ARCHIVO__'
import { useCallback, useEffect, useState } from 'react';
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
  tipo: 'glucosa', glucosa: '', sistolica: '', diastolica: '', contexto: '', fechaHora: ahoraLocal(), observaciones: '',
});
const formatoFecha = (f) => new Date(f).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });

export default function Mediciones({ idPaciente }) {
  const [filtro, setFiltro] = useState('glucosa');
  const [lista, setLista] = useState([]);
  const [form, setForm] = useState(FORM_INICIAL);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  const cargar = useCallback(async () => {
    try { setLista(await api.listarMediciones(idPaciente, { tipo: filtro })); } catch (e) { setError(e.message); }
  }, [idPaciente, filtro]);

  useEffect(() => { cargar(); }, [cargar]);

  const cambiar = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const guardar = async (e) => {
    e.preventDefault();
    setError(''); setAviso('');
    const base = {
      tipo: form.tipo,
      fechaHora: new Date(form.fechaHora).toISOString(),
      ...(form.contexto && { contexto: form.contexto }),
      ...(form.observaciones && { observaciones: form.observaciones }),
    };
    const datos = form.tipo === 'glucosa'
      ? { ...base, glucosaMgDl: Number(form.glucosa) }
      : { ...base, sistolicaMmhg: Number(form.sistolica), diastolicaMmhg: Number(form.diastolica) };
    try {
      const { alerta } = await api.registrarMedicion(idPaciente, datos);
      setAviso(alerta ? `Medición guardada. Se generó una alerta: ${alerta.motivo}` : 'Medición guardada.');
      setForm({ ...FORM_INICIAL(), tipo: form.tipo });
      setFiltro(form.tipo);
      cargar();
    } catch (err) { setError(err.message); }
  };

  const cronologica = [...lista].reverse();
  const series = filtro === 'glucosa'
    ? [{ nombre: 'Glucosa', puntos: cronologica.map((m) => ({ x: new Date(m.fechaHora), y: m.glucosaMgDl })) }]
    : [
      { nombre: 'Sistólica', puntos: cronologica.map((m) => ({ x: new Date(m.fechaHora), y: m.sistolicaMmhg })) },
      { nombre: 'Diastólica', puntos: cronologica.map((m) => ({ x: new Date(m.fechaHora), y: m.diastolicaMmhg })) },
    ];

  return (
    <div className="dos-columnas">
      <section className="tarjeta">
        <h2>Nueva medición</h2>
        <form onSubmit={guardar}>
          <label className="campo">
            <span>Tipo</span>
            <select name="tipo" value={form.tipo} onChange={cambiar}>
              <option value="glucosa">Glucosa</option>
              <option value="presion_arterial">Presión arterial</option>
            </select>
          </label>
          {form.tipo === 'glucosa' ? (
            <Campo etiqueta="Glucosa (mg/dL)" type="number" step="0.1" min="0" name="glucosa" value={form.glucosa} onChange={cambiar} required />
          ) : (
            <div className="rejilla">
              <Campo etiqueta="Sistólica (mmHg)" type="number" min="0" name="sistolica" value={form.sistolica} onChange={cambiar} required />
              <Campo etiqueta="Diastólica (mmHg)" type="number" min="0" name="diastolica" value={form.diastolica} onChange={cambiar} required />
            </div>
          )}
          <Campo etiqueta="Fecha y hora" type="datetime-local" name="fechaHora" value={form.fechaHora} onChange={cambiar} required />
          <Campo etiqueta="Contexto (opcional)" name="contexto" value={form.contexto} onChange={cambiar} ayuda="Ej. en ayunas, después de comer" />
          <Campo etiqueta="Observaciones (opcional)" name="observaciones" value={form.observaciones} onChange={cambiar} />
          <Mensaje>{error}</Mensaje>
          <Mensaje tipo="exito">{aviso}</Mensaje>
          <button type="submit">Guardar medición</button>
        </form>
      </section>

      <section className="tarjeta">
        <div className="titulo-fila">
          <h2>Historial</h2>
          <select value={filtro} onChange={(e) => setFiltro(e.target.value)} aria-label="Filtrar por tipo">
            <option value="glucosa">Glucosa</option>
            <option value="presion_arterial">Presión arterial</option>
          </select>
        </div>
        <Grafica series={series} unidad={filtro === 'glucosa' ? 'mg/dL' : 'mmHg'} />
        {lista.length === 0 ? <p className="vacio">Aún no hay mediciones de este tipo.</p> : (
          <div className="tabla-scroll">
            <table>
              <thead><tr><th>Fecha</th><th>Valor</th><th>Contexto</th></tr></thead>
              <tbody>
                {lista.map((m) => (
                  <tr key={m.id}>
                    <td>{formatoFecha(m.fechaHora)}</td>
                    <td>{filtro === 'glucosa' ? `${m.glucosaMgDl} mg/dL` : `${m.sistolicaMmhg}/${m.diastolicaMmhg} mmHg`}</td>
                    <td>{m.contexto ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
__FIN_ARCHIVO__
cat > "frontend/src/paginas/Panel.jsx" << '__FIN_ARCHIVO__'
import { useState } from 'react';
import Mediciones from './Mediciones.jsx';
import Medicamentos from './Medicamentos.jsx';

export default function Panel({ idPaciente }) {
  const [vista, setVista] = useState('mediciones');
  return (
    <>
      <nav className="pestanas">
        <button className={vista === 'mediciones' ? 'activa' : ''} onClick={() => setVista('mediciones')}>Mediciones</button>
        <button className={vista === 'medicamentos' ? 'activa' : ''} onClick={() => setVista('medicamentos')}>Medicamentos</button>
      </nav>
      {vista === 'mediciones' ? <Mediciones idPaciente={idPaciente} /> : <Medicamentos idPaciente={idPaciente} />}
    </>
  );
}
__FIN_ARCHIVO__
cat > "frontend/src/styles.css" << '__FIN_ARCHIVO__'
:root {
  --azul: #0b4f9e; --azul-claro: #e8f0fb; --texto: #1f2937; --suave: #6b7280;
  --borde: #d6dbe3; --fondo: #f4f6f9; --error: #b42318; --exito: #0f7b3d;
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  color: var(--texto);
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--fondo); }
.app { max-width: 1100px; margin: 0 auto; padding: 16px; min-height: 100vh; display: flex; flex-direction: column; }
.encabezado { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
.encabezado h1 { margin: 0; font-size: 1.4rem; color: var(--azul); }
.sesion { display: flex; align-items: center; gap: 10px; color: var(--suave); font-size: .9rem; }
main { flex: 1; }
.tarjeta { background: #fff; border: 1px solid var(--borde); border-radius: 12px; padding: 18px; margin-bottom: 16px; }
.tarjeta h2 { margin: 0 0 12px; font-size: 1.1rem; }
.acceso { max-width: 640px; margin: 0 auto; }
.dos-columnas { display: grid; grid-template-columns: minmax(280px, 380px) 1fr; gap: 16px; align-items: start; }
.rejilla { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 0 12px; }
.campo { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; font-size: .9rem; }
.campo span { font-weight: 600; }
.campo small { color: var(--suave); }
input, select { font: inherit; padding: 8px 10px; border: 1px solid var(--borde); border-radius: 8px; background: #fff; }
input:focus, select:focus { outline: 2px solid var(--azul); outline-offset: 0; }
button { font: inherit; padding: 9px 16px; border: 0; border-radius: 8px; background: var(--azul); color: #fff; cursor: pointer; font-weight: 600; }
button:disabled { opacity: .6; cursor: wait; }
button.secundario { background: transparent; color: var(--azul); border: 1px solid var(--azul); padding: 5px 12px; }
.pestanas { display: flex; gap: 8px; margin-bottom: 16px; }
.pestanas button { background: #fff; color: var(--azul); border: 1px solid var(--borde); }
.pestanas button.activa { background: var(--azul); color: #fff; border-color: var(--azul); }
.mensaje { padding: 8px 12px; border-radius: 8px; margin-bottom: 12px; font-size: .9rem; }
.mensaje.error { background: #fdecea; color: var(--error); }
.mensaje.exito { background: #e6f6ec; color: var(--exito); }
.titulo-fila { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.titulo-fila h2 { margin: 0; }
.vacio { color: var(--suave); }
.tabla-scroll { overflow-x: auto; margin-top: 12px; }
table { width: 100%; border-collapse: collapse; font-size: .9rem; }
th, td { text-align: left; padding: 8px; border-bottom: 1px solid var(--borde); white-space: nowrap; }
th { color: var(--suave); font-weight: 600; }
.grafica svg { width: 100%; height: auto; }
.leyenda { display: flex; gap: 16px; font-size: .85rem; color: var(--suave); }
.leyenda i { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 4px; }
.lista { list-style: none; padding: 0; margin: 0; }
.lista li { padding: 10px 0; border-bottom: 1px solid var(--borde); }
.detalle { color: var(--suave); font-size: .9rem; }
.pie { text-align: center; color: var(--suave); font-size: .8rem; padding: 16px 0 4px; }
@media (max-width: 800px) { .dos-columnas { grid-template-columns: 1fr; } }
__FIN_ARCHIVO__
cat > "frontend/src/useSesion.js" << '__FIN_ARCHIVO__'
import { useState } from 'react';

const CLAVE = 'seguimiento.sesion';

const leer = () => {
  try { return JSON.parse(localStorage.getItem(CLAVE)); } catch { return null; }
};

// Sesión provisional: guarda el id del paciente. Se reemplazará por JWT cuando exista login.
export function useSesion() {
  const [sesion, setSesion] = useState(leer);
  const entrar = (datos) => {
    try { localStorage.setItem(CLAVE, JSON.stringify(datos)); } catch { /* sin almacenamiento */ }
    setSesion(datos);
  };
  const salir = () => {
    try { localStorage.removeItem(CLAVE); } catch { /* sin almacenamiento */ }
    setSesion(null);
  };
  return { sesion, entrar, salir };
}
__FIN_ARCHIVO__
cat > "frontend/vite.config.js" << '__FIN_ARCHIVO__'
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// El proxy evita problemas de CORS en desarrollo: /api -> backend local
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3000' },
  },
});
__FIN_ARCHIVO__
cd frontend
npm install
npm run build
echo ""
echo "Frontend listo. Para usarlo:"
echo "  1) En una terminal:  cd backend && npm run dev"
echo "  2) En otra terminal: cd frontend && npm run dev   y abre http://localhost:5173"
