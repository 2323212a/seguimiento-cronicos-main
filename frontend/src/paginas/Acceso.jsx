import { useRef, useState } from 'react';
import { api } from '../api.js';
import Campo from '../componentes/Campo.jsx';
import Mensaje from '../componentes/Mensaje.jsx';

const VACIO = { nombre: '', apellidoPaterno: '', apellidoMaterno: '', fechaNacimiento: '', correo: '', contrasena: '', telefono: '' };

export default function Acceso({ onEntrar }) {
  const [modo, setModo] = useState('ingresar');
  const [form, setForm] = useState(VACIO);
  const [login, setLogin] = useState({ correo: '', contrasena: '' });
  const [error, setError] = useState(''); const [aviso, setAviso] = useState(''); const [cargando, setCargando] = useState(false);
  const envioEnCurso = useRef(false);
  const iniciarEnvio = () => { if (envioEnCurso.current) return false; envioEnCurso.current = true; setCargando(true); return true; };
  const terminarEnvio = () => { envioEnCurso.current = false; setCargando(false); };
  const cambiar = (e) => setForm({ ...form, [e.target.name]: e.target.value });
  const cambiarLogin = (e) => setLogin({ ...login, [e.target.name]: e.target.value });

  const registrar = async (e) => {
    e.preventDefault(); if (!iniciarEnvio()) return; setError(''); setAviso('');
    try {
      const datos = { ...form };
      for (const k of ['apellidoMaterno', 'telefono']) if (!datos[k]) delete datos[k];
      await api.registrarPaciente(datos);
      setAviso('Tu cuenta quedó pendiente de validación. Podrás iniciar sesión cuando el administrador la active.');
      setModo('ingresar');
    } catch (err) { setError(err.message); } finally { terminarEnvio(); }
  };
  const ingresar = async (e) => {
    e.preventDefault(); if (!iniciarEnvio()) return; setError(''); setAviso('');
    try { onEntrar(await api.iniciarSesion(login)); } catch (err) {
      setError(err.status === 401 ? 'No se pudo iniciar sesión. Verifica tus datos o contacta al administrador si tu cuenta aún no está activa.' : err.message);
    } finally { terminarEnvio(); }
  };

  return <section className="tarjeta acceso">
    <div className="acceso-intro"><span className="inicio-eyebrow">Seguimiento de salud</span><h2>{modo === 'ingresar' ? 'Inicia sesión' : 'Solicita una cuenta'}</h2><p>{modo === 'ingresar' ? 'Accede a la información disponible para tu cuenta.' : 'Regístrate para solicitar acceso. El administrador debe validar la cuenta.'}</p></div>
    <div className="pestanas">
      <button type="button" aria-pressed={modo === 'ingresar'} className={modo === 'ingresar' ? 'activa' : ''} onClick={() => { setModo('ingresar'); setError(''); }}>Iniciar sesión</button>
      <button type="button" aria-pressed={modo === 'registro'} className={modo === 'registro' ? 'activa' : ''} onClick={() => { setModo('registro'); setError(''); }}>Crear cuenta</button>
    </div>
    {modo === 'registro' ? <form onSubmit={registrar}>
      <div className="rejilla">
        <Campo etiqueta="Nombre" name="nombre" value={form.nombre} onChange={cambiar} required />
        <Campo etiqueta="Apellido paterno" name="apellidoPaterno" value={form.apellidoPaterno} onChange={cambiar} required />
        <Campo etiqueta="Apellido materno" name="apellidoMaterno" value={form.apellidoMaterno} onChange={cambiar} />
        <Campo etiqueta="Fecha de nacimiento" type="date" name="fechaNacimiento" value={form.fechaNacimiento} onChange={cambiar} required />
        <Campo etiqueta="Correo" type="email" name="correo" value={form.correo} onChange={cambiar} required />
        <Campo etiqueta="Contraseña" type="password" name="contrasena" value={form.contrasena} onChange={cambiar} minLength={8} required ayuda="Mínimo 8 caracteres" />
        <Campo etiqueta="Teléfono (opcional)" name="telefono" value={form.telefono} onChange={cambiar} />
      </div>
      <Mensaje>{error}</Mensaje><Mensaje tipo="exito">{aviso}</Mensaje>
      <button type="submit" disabled={cargando}>{cargando ? 'Enviando solicitud…' : 'Solicitar cuenta'}</button>
    </form> : <form onSubmit={ingresar}>
      <Campo etiqueta="Correo" type="email" name="correo" value={login.correo} onChange={cambiarLogin} required />
      <Campo etiqueta="Contraseña" type="password" name="contrasena" value={login.contrasena} onChange={cambiarLogin} required />
      <Mensaje>{error}</Mensaje><Mensaje tipo="exito">{aviso}</Mensaje>
      <button type="submit" disabled={cargando}>{cargando ? 'Entrando…' : 'Entrar'}</button>
    </form>}
  </section>;
}
