import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import Campo from '../componentes/Campo.jsx';
import Mensaje from '../componentes/Mensaje.jsx';
import OrientacionPadecimiento from '../componentes/OrientacionPadecimiento.jsx';
import DiagnosticosMedico from './DiagnosticosMedico.jsx';
import CatalogoSeguridad from './CatalogoSeguridad.jsx';

const fechaHoyLocal = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const etiquetaAccion = (tipo) => ({ llamada: 'Llamada', mensaje: 'Mensaje', revision: 'Revisión', visita: 'Visita', observacion: 'Observación', otro: 'Otro' }[tipo] ?? tipo);

export default function PanelPersonal({ sesion }) {
  const [pacientes, setPacientes] = useState([]); const [seleccionado, setSeleccionado] = useState('');
  const [mediciones, setMediciones] = useState([]); const [alertas, setAlertas] = useState([]); const [acciones, setAcciones] = useState([]); const [medicamentos, setMedicamentos] = useState([]);
  const [objetivos, setObjetivos] = useState([]);
  const [diagnosticos,setDiagnosticos]=useState([]);
  const [usuarios, setUsuarios] = useState([]); const [asignaciones, setAsignaciones] = useState([]);
  const [vistaAdmin, setVistaAdmin] = useState('usuarios');
  const [vistaProfesional, setVistaProfesional] = useState('resumen');
  const [cargandoLista, setCargandoLista] = useState(true); const [cargandoDetalle, setCargandoDetalle] = useState(false); const [guardando, setGuardando] = useState(false);
  const envioEnCurso = useRef(false);
  const iniciarEnvio = () => { if (envioEnCurso.current) return false; envioEnCurso.current = true; setGuardando(true); return true; };
  const terminarEnvio = () => { envioEnCurso.current = false; setGuardando(false); };
  const [versionDetalle, setVersionDetalle] = useState(0);
  const [error, setError] = useState(''); const [aviso, setAviso] = useState('');
  const [errorDetalle, setErrorDetalle] = useState('');
  const [asignacion, setAsignacion] = useState({ tipo: 'medico', paciente: '', profesional: '' });
  const [nuevoUsuario, setNuevoUsuario] = useState({ correo: '', contrasena: '', rol: 'medico' });
  const [nuevoMedicamento, setNuevoMedicamento] = useState({ nombre: '', dosis: '', frecuencia: '', fechaInicio: fechaHoyLocal(), horarios: '' });
  const [accion, setAccion] = useState({ tipoAccion: 'llamada', descripcion: '' });
  const [nuevoObjetivo, setNuevoObjetivo] = useState({ tipoMedicion: 'glucosa', contexto: '', glucosaMin: '', glucosaMax: '', sistolicaMin: '', sistolicaMax: '', diastolicaMin: '', diastolicaMax: '', indicacionPaciente: '', vigenteDesde: fechaHoyLocal() });
  const cargarPacientes = useCallback(async () => {
    setCargandoLista(true); setError('');
    try { const rows = await api.listarPacientesAsignados(sesion.rol); setPacientes(rows); setSeleccionado((actual) => actual || (rows[0] ? String(rows[0].id) : '')); }
    catch (e) { setError(e.message); }
    finally { setCargandoLista(false); }
  }, [sesion.rol]);
  const cargarAdmin = useCallback(async () => { try {
    setCargandoLista(true); setError('');
    const [u, a] = await Promise.all([api.listarUsuariosAdmin(), api.listarAsignacionesAdmin()]); setUsuarios(u); setAsignaciones(a);
    return true;
  } catch (e) { setError(e.message); return false; } finally { setCargandoLista(false); } }, []);
  useEffect(() => { if (sesion.rol === 'administrador') cargarAdmin(); else cargarPacientes(); }, [sesion.rol, cargarAdmin, cargarPacientes]);
  useEffect(() => {
    if (!seleccionado || sesion.rol === 'administrador') return;
    let vivo = true;
    setCargandoDetalle(true); setError(''); setErrorDetalle('');
    Promise.all([
      api.listarMedicionesPaciente(sesion.rol, seleccionado),
      api.listarAlertasPaciente(sesion.rol, seleccionado),
      sesion.rol === 'seguimiento' ? api.listarAccionesSeguimiento(seleccionado) : Promise.resolve([]),
      sesion.rol === 'medico' ? api.listarMedicamentosPaciente(seleccionado) : Promise.resolve([]),
      sesion.rol === 'medico' ? api.listarObjetivosPaciente('medico', seleccionado) : Promise.resolve([]),
      sesion.rol === 'medico' ? api.listarDiagnosticosPaciente(seleccionado) : Promise.resolve([]),
    ]).then(([m, a, s, meds, objs, diags]) => { if (vivo) { setMediciones(m); setAlertas(a); setAcciones(s); setMedicamentos(meds); setObjetivos(objs); setDiagnosticos(diags); } })
      .catch((e) => { if (vivo) setErrorDetalle(e.message); })
      .finally(() => { if (vivo) setCargandoDetalle(false); });
    return () => { vivo = false; };
  }, [seleccionado, sesion.rol, versionDetalle]);

  useEffect(() => {
    if (!seleccionado || sesion.rol === 'administrador') return undefined;
    const timer = window.setInterval(() => api.listarAlertasPaciente(sesion.rol, seleccionado).then(setAlertas).catch(() => {}), 30000);
    return () => window.clearInterval(timer);
  }, [seleccionado, sesion.rol]);

  const guardarObjetivo = async (e) => {
    e.preventDefault(); setError(''); setAviso('');
    if (!window.confirm('Confirma que este objetivo individual y la indicación fueron definidos por ti para este paciente.')) return;
    if (!iniciarEnvio()) return;
    const num = (x) => x === '' ? null : Number(x);
    const datos = { ...nuevoObjetivo, contexto: nuevoObjetivo.contexto.trim() || null, vigenteDesde: nuevoObjetivo.vigenteDesde || undefined,
      glucosaMin: num(nuevoObjetivo.glucosaMin), glucosaMax: num(nuevoObjetivo.glucosaMax),
      sistolicaMin: num(nuevoObjetivo.sistolicaMin), sistolicaMax: num(nuevoObjetivo.sistolicaMax),
      diastolicaMin: num(nuevoObjetivo.diastolicaMin), diastolicaMax: num(nuevoObjetivo.diastolicaMax) };
    try {
      await api.registrarObjetivoPaciente(seleccionado, datos);
      setAviso('Objetivo guardado. Las mediciones futuras se compararán con este objetivo individual.');
      setNuevoObjetivo((o) => ({ ...o, contexto: '', glucosaMin: '', glucosaMax: '', sistolicaMin: '', sistolicaMax: '', diastolicaMin: '', diastolicaMax: '', indicacionPaciente: '' }));
      setVersionDetalle((v) => v + 1);
    } catch (e2) { setError(e2.message); } finally { terminarEnvio(); }
  };

  const guardarAccion = async (e) => {
    e.preventDefault(); setError(''); setAviso('');
    if (!window.confirm('Confirma que deseas registrar esta acción en el historial de seguimiento.')) return;
    if (!iniciarEnvio()) return;
    try {
      await api.registrarAccionSeguimiento(seleccionado, accion);
      setAccion((actual) => ({ ...actual, descripcion: '' })); setAviso('Acción guardada.');
      try { setAcciones(await api.listarAccionesSeguimiento(seleccionado)); }
      catch { setError('La acción quedó guardada, pero no se pudo actualizar el historial. Usa “Reintentar carga” para refrescarlo.'); }
    }
    catch (err) { setError(err.message); } finally { terminarEnvio(); }
  };
  const guardarMedicamento = async (e) => {
    e.preventDefault(); setError(''); setAviso('');
    if (!window.confirm('Confirma que deseas registrar este medicamento y sus horarios para el paciente seleccionado.')) return;
    if (!iniciarEnvio()) return;
    const datos = { ...nuevoMedicamento, horarios: nuevoMedicamento.horarios.split(',').map((x) => x.trim()).filter(Boolean) };
    try {
      await api.registrarMedicamento(seleccionado, datos);
      setNuevoMedicamento({ nombre: '', dosis: '', frecuencia: '', fechaInicio: fechaHoyLocal(), horarios: '' }); setAviso('Medicamento registrado.');
      try { setMedicamentos(await api.listarMedicamentosPaciente(seleccionado)); }
      catch { setError('El medicamento quedó registrado, pero no se pudo actualizar la lista. Usa “Reintentar carga” para refrescarla.'); }
    }
    catch (err) { setError(err.message); } finally { terminarEnvio(); }
  };
  const cambiarEstado = async (u) => {
    const accionEstado = u.activo ? 'desactivar' : 'activar';
    if (!window.confirm(`¿Confirmas ${accionEstado} la cuenta ${u.correo}?`)) return;
    if (!iniciarEnvio()) return;
    setError(''); setAviso('');
    try {
      await api.cambiarEstadoUsuario(u.id, !u.activo);
      setAviso(`Cuenta ${u.activo ? 'desactivada' : 'activada'}.`);
      try { setUsuarios(await api.listarUsuariosAdmin()); }
      catch { setError('El estado se actualizó, pero no se pudo refrescar la lista. Usa “Actualizar datos”.'); }
    } catch (e) { setError(e.message); } finally { terminarEnvio(); }
  };
  const cambiarRol = async (u, rol) => {
    if (!window.confirm(`¿Confirmas cambiar el rol de ${u.correo} a ${rol}?`)) { await cargarAdmin(); return; }
    if (!iniciarEnvio()) return;
    setError(''); setAviso('');
    try {
      await api.cambiarRolUsuario(u.id, rol);
      const listaActualizada = await cargarAdmin();
      setAviso(listaActualizada ? 'Rol actualizado.' : 'Rol actualizado. No se pudo refrescar la lista; usa “Actualizar datos”.');
    } catch (e) { await cargarAdmin(); setError(e.message); } finally { terminarEnvio(); }
  };
  const guardarAsignacion = async (e) => { e.preventDefault(); setError(''); setAviso('');
    if (!window.confirm('¿Confirmas guardar esta asignación? Si ya existe una activa, será reemplazada y conservará su historial.')) return;
    if (!iniciarEnvio()) return;
    try {
      await api.asignarProfesional(asignacion.tipo, asignacion.paciente, asignacion.profesional);
      const listaActualizada = await cargarAdmin();
      setAviso(listaActualizada ? 'Asignación actualizada.' : 'Asignación guardada. No se pudo refrescar el historial; usa “Actualizar datos”.');
    }
    catch (err) { setError(err.message); } finally { terminarEnvio(); }
  };
  const crearUsuario = async (e) => { e.preventDefault(); setError(''); setAviso('');
    if (!iniciarEnvio()) return;
    try {
      await api.crearUsuarioAdmin(nuevoUsuario);
      setNuevoUsuario({ correo: '', contrasena: '', rol: 'medico' });
      const listaActualizada = await cargarAdmin();
      setAviso(listaActualizada ? 'Cuenta creada inactiva; actívala después de validar su alta.' : 'Cuenta creada inactiva. No se pudo refrescar la lista; usa “Actualizar datos”.');
    }
    catch (err) { setError(err.message); } finally { terminarEnvio(); }
  };
  if (sesion.rol === 'administrador') {
    const activas = usuarios.filter((u) => u.activo).length;
    const pendientes = usuarios.length - activas;
    const asignacionesActivas = asignaciones.filter((a) => a.activo).length;
    return <div className="admin-panel">
      <section className="admin-hero">
        <div><span className="admin-eyebrow">Panel de control</span><h2>Administración</h2><p>Gestiona cuentas y relaciones de asignación.</p></div>
        <button type="button" className="secundario" onClick={cargarAdmin} disabled={cargandoLista}>{cargandoLista ? 'Actualizando…' : 'Actualizar datos'}</button>
      </section>
      <div className="admin-resumen" aria-label="Resumen de cuentas">
        <article className="admin-stat"><span>Cuentas</span><strong>{cargandoLista ? '—' : usuarios.length}</strong></article>
        <article className="admin-stat"><span>Activas</span><strong>{cargandoLista ? '—' : activas}</strong></article>
        <article className="admin-stat"><span>Cuentas inactivas</span><strong>{cargandoLista ? '—' : pendientes}</strong></article>
        <article className="admin-stat"><span>Asignaciones activas</span><strong>{cargandoLista ? '—' : asignacionesActivas}</strong></article>
      </div>
      <nav className="admin-nav" aria-label="Administración">
        <button type="button" aria-pressed={vistaAdmin === 'usuarios'} className={vistaAdmin === 'usuarios' ? 'activa' : ''} onClick={() => setVistaAdmin('usuarios')}>Cuentas</button>
        <button type="button" aria-pressed={vistaAdmin === 'asignaciones'} className={vistaAdmin === 'asignaciones' ? 'activa' : ''} onClick={() => setVistaAdmin('asignaciones')}>Asignaciones e historial</button>
      </nav>
      <Mensaje>{error}</Mensaje><Mensaje tipo="exito">{aviso}</Mensaje>
      {error && !cargandoLista && <button type="button" className="secundario admin-retry" onClick={cargarAdmin}>Reintentar carga</button>}
      {vistaAdmin === 'usuarios' ? <>
        <section className="tarjeta admin-seccion">
          <div className="admin-seccion-titulo"><div><h3>Cuentas de usuario</h3><p>Activa las cuentas validadas y asigna el rol correspondiente.</p></div><span>{usuarios.length} cuentas</span></div>
          {cargandoLista ? <p role="status">Cargando cuentas…</p> : <div className="tabla-scroll"><table><thead><tr><th>Cuenta</th><th>ID paciente</th><th>Correo</th><th>Rol</th><th>Estado</th><th>Acción</th></tr></thead>
            <tbody>{usuarios.length === 0 ? <tr><td colSpan="6">No hay cuentas para mostrar.</td></tr> : usuarios.map((u) => <tr key={u.id}>
              <td className="admin-id">#{u.id}</td><td>{u.idPaciente ?? '—'}</td><td>{u.correo}</td>
              <td><select aria-label={`Rol de ${u.correo}`} value={u.rol} disabled={u.rol === 'paciente' || u.id === sesion.id || guardando} onChange={(e) => cambiarRol(u, e.target.value)}>
                {['medico', 'seguimiento', 'administrador'].includes(u.rol) ? null : <option value={u.rol}>{u.rol}</option>}
                {['medico', 'seguimiento', 'administrador'].map((r) => <option key={r} value={r}>{r === 'medico' ? 'Médico' : r === 'seguimiento' ? 'Seguimiento' : 'Administrador'}</option>)}
              </select></td>
              <td><span className={`estado-cuenta ${u.activo ? 'estado-activa' : 'estado-inactiva'}`}>{u.activo ? 'Activa' : 'Inactiva'}</span></td>
              <td><button className="secundario" disabled={u.id === sesion.id || guardando} onClick={() => cambiarEstado(u)}>{u.activo ? 'Desactivar' : 'Activar'}</button></td>
            </tr>)}</tbody>
          </table></div>}
        </section>
        <section className="tarjeta admin-seccion admin-crear">
          <div className="admin-seccion-titulo"><div><h3>Crear cuenta de personal</h3><p>Las cuentas nuevas se crean inactivas y requieren validación.</p></div></div>
          <form onSubmit={crearUsuario} className="rejilla">
            <Campo etiqueta="Correo" type="email" value={nuevoUsuario.correo} onChange={(e) => setNuevoUsuario({ ...nuevoUsuario, correo: e.target.value })} required />
            <Campo etiqueta="Contraseña inicial" type="password" minLength={12} value={nuevoUsuario.contrasena} onChange={(e) => setNuevoUsuario({ ...nuevoUsuario, contrasena: e.target.value })} required ayuda="Mínimo 12 caracteres" />
            <label className="campo"><span>Rol</span><select value={nuevoUsuario.rol} onChange={(e) => setNuevoUsuario({ ...nuevoUsuario, rol: e.target.value })}><option value="medico">Médico</option><option value="seguimiento">Seguimiento</option><option value="administrador">Administrador</option></select></label>
            <button disabled={guardando}>{guardando ? 'Guardando…' : 'Crear cuenta inactiva'}</button>
          </form>
        </section>
      </> : <>
        <section className="tarjeta admin-seccion">
          <div className="admin-seccion-titulo"><div><h3>Asignar o reasignar profesional</h3><p>Elige una cuenta activa. La asignación anterior se conserva en el historial.</p></div></div>
          <form onSubmit={guardarAsignacion} className="admin-form-asignacion">
            <label className="campo"><span>Responsabilidad</span><select value={asignacion.tipo} onChange={(e) => setAsignacion({ ...asignacion, tipo: e.target.value, profesional: '' })}><option value="medico">Médico</option><option value="seguimiento">Personal de seguimiento</option></select></label>
            <label className="campo"><span>Paciente activo <span className="campo-obligatorio" aria-hidden="true">*</span></span><select value={asignacion.paciente} onChange={(e) => setAsignacion({ ...asignacion, paciente: e.target.value })} required>
              <option value="">Seleccionar paciente</option>{usuarios.filter((u) => u.rol === 'paciente' && u.activo && u.idPaciente).map((u) => <option key={u.idPaciente} value={u.idPaciente}>{u.idPaciente} · {u.correo}</option>)}
            </select></label>
            <label className="campo"><span>Profesional activo <span className="campo-obligatorio" aria-hidden="true">*</span></span><select value={asignacion.profesional} onChange={(e) => setAsignacion({ ...asignacion, profesional: e.target.value })} required>
              <option value="">Seleccionar cuenta</option>{usuarios.filter((u) => u.rol === asignacion.tipo && u.activo).map((u) => <option key={u.id} value={u.id}>{u.correo}</option>)}
            </select></label>
            <button disabled={guardando || cargandoLista}>{guardando ? 'Guardando…' : 'Guardar asignación'}</button>
          </form>
        </section>
        <section className="tarjeta admin-seccion">
          <div className="admin-seccion-titulo"><div><h3>Historial de asignaciones</h3><p>Consulta las asignaciones actuales y anteriores.</p></div><span>{asignaciones.length} registros</span></div>
          <div className="tabla-scroll"><table><thead><tr><th>Responsabilidad</th><th>ID paciente</th><th>Correo profesional</th><th>Fecha</th><th>Estado</th></tr></thead><tbody>
            {asignaciones.length === 0 ? <tr><td colSpan="5">Aún no hay asignaciones en el historial.</td></tr> : asignaciones.map((a) => <tr key={`${a.tipo}-${a.id}`}><td>{a.tipo === 'medico' ? 'Médico' : 'Seguimiento'}</td><td>#{a.id_paciente}</td><td>{a.correo_profesional}</td><td>{a.fecha_asignacion}</td><td><span className={`estado-cuenta ${a.activo ? 'estado-activa' : 'estado-inactiva'}`}>{a.activo ? 'Activa' : 'Cerrada'}</span></td></tr>)}
          </tbody></table></div>
        </section>
      </>}
      <p className="admin-nota">La administración gestiona cuentas y asignaciones. No tiene acceso a información clínica.</p>
    </div>;
  }

  const tabsProfesional = sesion.rol === 'medico'
    ? [{ id: 'resumen', nombre: 'Resumen' }, { id: 'mediciones', nombre: 'Mediciones' }, { id: 'alertas', nombre: 'Alertas' }, { id: 'objetivos', nombre: 'Objetivos e indicaciones' }, { id: 'diagnosticos', nombre: 'Diagnósticos' }, { id: 'catalogo_seguridad', nombre: 'Criterios de seguridad' }, { id: 'medicamentos', nombre: 'Medicamentos' }]
    : [{ id: 'resumen', nombre: 'Resumen' }, { id: 'mediciones', nombre: 'Mediciones' }, { id: 'alertas', nombre: 'Alertas' }, { id: 'acciones', nombre: 'Seguimiento' }];
  const pendientes = alertas.filter((a) => a.estado !== 'atendida').length;
  const tituloRol = sesion.rol === 'medico' ? 'Atención médica' : 'Seguimiento de pacientes';

  return <div className="panel-profesional">
    <section className="profesional-hero">
      <div><span className="inicio-eyebrow">{sesion.rol === 'medico' ? 'Médico' : 'Personal de seguimiento'}</span><h2>{tituloRol}</h2><p>Consulta únicamente la información de pacientes con asignación activa.</p></div>
    </section>
    <section className="tarjeta selector-paciente">
      <div><h3>Paciente asignado</h3><p className="descripcion-seccion">Selecciona a la persona cuyo seguimiento necesitas revisar.</p></div>
      {cargandoLista ? <p role="status">Cargando pacientes…</p> : error && pacientes.length === 0 ? <div><Mensaje>{error}</Mensaje><button type="button" className="secundario" onClick={cargarPacientes}>Reintentar</button></div> : pacientes.length === 0 ? <p className="vacio">No tienes pacientes asignados. Contacta al administrador para revisar tus asignaciones.</p> : <label className="campo"><span>Paciente</span>
        <select value={seleccionado} onChange={(e) => { setSeleccionado(e.target.value); setVistaProfesional('resumen'); }} aria-label="Seleccionar paciente asignado">{pacientes.map((p) => <option key={p.id} value={p.id}>{p.nombre} · #{p.id}</option>)}</select>
      </label>}
    </section>
    {seleccionado && !cargandoLista && <nav className="nav-profesional" aria-label="Secciones del paciente asignado">
      {tabsProfesional.map((tab) => <button type="button" key={tab.id} aria-pressed={vistaProfesional === tab.id} className={vistaProfesional === tab.id ? 'activa' : ''} onClick={() => setVistaProfesional(tab.id)}>{tab.nombre}{tab.id === 'alertas' && pendientes > 0 && <span className="contador-nav">{pendientes}</span>}</button>)}
    </nav>}
    {cargandoDetalle && <section className="tarjeta"><p role="status">Cargando información asignada…</p></section>}
    {errorDetalle && seleccionado && !cargandoDetalle && <section className="tarjeta"><Mensaje>{errorDetalle}</Mensaje><button type="button" className="secundario" onClick={() => setVersionDetalle((v) => v + 1)}>Reintentar carga</button></section>}
    {seleccionado && !cargandoDetalle && !errorDetalle && <>
      {vistaProfesional === 'resumen' && <section className="resumen-profesional">
        <div className="tarjeta"><span>Mediciones disponibles</span><strong>{mediciones.length}</strong><button type="button" className="secundario" onClick={() => setVistaProfesional('mediciones')}>Consultar historial</button></div>
        <div className="tarjeta"><span>Alertas por revisar</span><strong>{pendientes}</strong><button type="button" className="secundario" onClick={() => setVistaProfesional('alertas')}>Revisar alertas</button></div>
        {sesion.rol === 'medico' ? <div className="tarjeta"><span>Medicamentos registrados</span><strong>{medicamentos.length}</strong><button type="button" className="secundario" onClick={() => setVistaProfesional('medicamentos')}>Ver medicamentos</button></div> : <div className="tarjeta"><span>Acciones registradas</span><strong>{acciones.length}</strong><button type="button" className="secundario" onClick={() => setVistaProfesional('acciones')}>Abrir seguimiento</button></div>}
      </section>}
      {vistaProfesional === 'mediciones' && <section className="tarjeta">
        <h2>Historial de mediciones</h2><p className="descripcion-seccion">Registros disponibles para el paciente seleccionado.</p>
        {mediciones.length ? <div className="tabla-scroll"><table><thead><tr><th>Fecha y hora</th><th>Tipo</th><th>Valor</th></tr></thead><tbody>{mediciones.map((m) => <tr key={m.id}>
          <td>{new Date(m.fechaHora).toLocaleString('es-MX')}</td><td>{m.tipo === 'glucosa' ? 'Glucosa' : m.tipo==='presion_arterial'?'Presión arterial':'HbA1c'}</td><td>{m.tipo === 'glucosa' ? `${m.glucosaMgDl} mg/dL` : m.tipo==='presion_arterial'?`${m.sistolicaMmhg}/${m.diastolicaMmhg} mmHg`:`${m.hba1cPercent} %`}</td>
        </tr>)}</tbody></table></div> : <p className="vacio">Aún no hay mediciones para mostrar.</p>}
      </section>}
      {vistaProfesional === 'alertas' && <section className="tarjeta">
        <h2>Alertas del paciente</h2><p className="descripcion-seccion">Revisa los avisos disponibles para orientar el seguimiento.</p>
        {alertas.length ? <ul className="lista">{alertas.map((a) => <li key={a.id}><div className="alerta-profesional-titulo"><strong>{a.tipo}</strong><span className={`estado-cuenta ${a.estado === 'atendida' ? 'estado-activa' : 'estado-inactiva'}`}>{a.estado === 'atendida' ? 'Atendida' : a.estado === 'notificada' ? 'Notificada' : 'Generada'}</span></div><div className="detalle">{a.motivo}</div>{sesion.rol === 'medico' && a.medicion && <div className="detalle">Medición: {a.medicion.tipo === 'glucosa'||a.medicion.tipo==='hba1c' ? `${a.medicion.valor} ${a.medicion.unidad}` : `${a.medicion.sistolica}/${a.medicion.diastolica} ${a.medicion.unidad}`}{a.medicion.contexto ? ` · ${a.medicion.contexto}` : ''}</div>}{sesion.rol === 'medico' && a.criterioActivado && <div className="detalle">Criterio: {a.criterioActivado}</div>}{sesion.rol === 'medico' && a.fuente && <div className="detalle">Fuente: {a.fuente.institucion} · {a.fuente.titulo}</div>}{sesion.rol === 'medico' && a.indicacionPaciente && <p><strong>Indicación registrada:</strong> {a.indicacionPaciente}</p>}{sesion.rol === 'medico' && <OrientacionPadecimiento codigo={a.padecimientoPosible ?? a.condicionAplicada?.padecimientoPosible} />}</li>)}</ul> : <p className="vacio">No hay alertas registradas.</p>}
      </section>}
      {sesion.rol === 'medico' && vistaProfesional === 'objetivos' && <>
        <section className="tarjeta"><h2>Objetivos vigentes</h2><p className="descripcion-seccion">Solo se comparan mediciones con objetivos individuales que hayas registrado. No se aplican rangos predeterminados.</p>
          {objetivos.filter((o) => o.estado === 'vigente').length ? <ul className="lista">{objetivos.filter((o) => o.estado === 'vigente').map((o) => <li key={o.id}><strong>{o.tipoMedicion === 'glucosa' ? 'Glucosa' : 'Presión arterial'}{o.contexto ? ` · ${o.contexto}` : ''}</strong><div>{o.indicacionPaciente}</div><div className="detalle">Vigente desde {String(o.vigenteDesde).slice(0,10)}</div></li>)}</ul> : <p className="vacio">No hay objetivos individuales vigentes.</p>}
        </section>
        <section className="tarjeta"><h2>Registrar objetivo individual</h2><p className="descripcion-seccion">Ingresa únicamente el objetivo que definiste clínicamente y una indicación dirigida al paciente. Al sustituir un objetivo, su historial se conserva.</p>
          <form onSubmit={guardarObjetivo}><label className="campo"><span>Tipo de medición</span><select value={nuevoObjetivo.tipoMedicion} onChange={(e) => setNuevoObjetivo((o) => ({ ...o, tipoMedicion: e.target.value }))}><option value="glucosa">Glucosa (mg/dL)</option><option value="presion_arterial">Presión arterial (mmHg)</option></select></label>
            <Campo etiqueta="Contexto (opcional)" value={nuevoObjetivo.contexto} onChange={(e) => setNuevoObjetivo({ ...nuevoObjetivo, contexto: e.target.value })} ayuda="Ejemplo: ayuno, según lo acordado con el paciente." />
            {nuevoObjetivo.tipoMedicion === 'glucosa' ? <div className="rejilla"><Campo etiqueta="Límite inferior (mg/dL), opcional" type="number" min="0.01" step="0.01" value={nuevoObjetivo.glucosaMin} onChange={(e) => setNuevoObjetivo({ ...nuevoObjetivo, glucosaMin: e.target.value })} /><Campo etiqueta="Límite superior (mg/dL), opcional" type="number" min="0.01" step="0.01" value={nuevoObjetivo.glucosaMax} onChange={(e) => setNuevoObjetivo({ ...nuevoObjetivo, glucosaMax: e.target.value })} /></div> : <div className="rejilla"><Campo etiqueta="Sistólica mínima (mmHg)" type="number" min="1" value={nuevoObjetivo.sistolicaMin} onChange={(e) => setNuevoObjetivo({ ...nuevoObjetivo, sistolicaMin: e.target.value })} /><Campo etiqueta="Sistólica máxima (mmHg)" type="number" min="1" value={nuevoObjetivo.sistolicaMax} onChange={(e) => setNuevoObjetivo({ ...nuevoObjetivo, sistolicaMax: e.target.value })} /><Campo etiqueta="Diastólica mínima (mmHg)" type="number" min="1" value={nuevoObjetivo.diastolicaMin} onChange={(e) => setNuevoObjetivo({ ...nuevoObjetivo, diastolicaMin: e.target.value })} /><Campo etiqueta="Diastólica máxima (mmHg)" type="number" min="1" value={nuevoObjetivo.diastolicaMax} onChange={(e) => setNuevoObjetivo({ ...nuevoObjetivo, diastolicaMax: e.target.value })} /></div>}
            <Campo etiqueta="Indicación para el paciente" value={nuevoObjetivo.indicacionPaciente} onChange={(e) => setNuevoObjetivo({ ...nuevoObjetivo, indicacionPaciente: e.target.value })} required ayuda="Texto escrito por ti. No se generan recomendaciones automáticas ni sugerencias de medicamentos." />
            <Campo etiqueta="Vigente desde" type="date" value={nuevoObjetivo.vigenteDesde} onChange={(e) => setNuevoObjetivo({ ...nuevoObjetivo, vigenteDesde: e.target.value })} required />
            <Mensaje>{error}</Mensaje><Mensaje tipo="exito">{aviso}</Mensaje><button disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar objetivo'}</button>
          </form>
        </section>
      </>}
      {sesion.rol==='medico'&&vistaProfesional==='diagnosticos'&&<DiagnosticosMedico idPaciente={Number(seleccionado)} />}
      {sesion.rol==='medico'&&vistaProfesional==='catalogo_seguridad'&&<CatalogoSeguridad />}
      {sesion.rol === 'medico' && vistaProfesional === 'medicamentos' && <>
        <section className="tarjeta"><h2>Medicamentos</h2><p className="descripcion-seccion">Tratamientos registrados para el paciente.</p>{medicamentos.length ? <ul className="lista">{medicamentos.map((m) => <li key={m.id}><strong>{m.nombre}</strong><div className="detalle">{m.dosis} · {m.frecuencia}</div>{m.horarios?.length > 0 && <div className="detalle">Horarios: {m.horarios.join(', ')}</div>}</li>)}</ul> : <p className="vacio">No hay medicamentos registrados.</p>}</section>
        <section className="tarjeta"><h2>Registrar medicamento</h2><p className="descripcion-seccion">Completa la información indicada por el profesional responsable.</p><form onSubmit={guardarMedicamento}>
          <div className="rejilla">
            <Campo etiqueta="Nombre" value={nuevoMedicamento.nombre} onChange={(e) => setNuevoMedicamento({ ...nuevoMedicamento, nombre: e.target.value })} required />
            <Campo etiqueta="Dosis" value={nuevoMedicamento.dosis} onChange={(e) => setNuevoMedicamento({ ...nuevoMedicamento, dosis: e.target.value })} required />
            <Campo etiqueta="Frecuencia" value={nuevoMedicamento.frecuencia} onChange={(e) => setNuevoMedicamento({ ...nuevoMedicamento, frecuencia: e.target.value })} required />
            <Campo etiqueta="Fecha de inicio" type="date" value={nuevoMedicamento.fechaInicio} onChange={(e) => setNuevoMedicamento({ ...nuevoMedicamento, fechaInicio: e.target.value })} required />
          </div>
          <Campo etiqueta="Horarios" value={nuevoMedicamento.horarios} onChange={(e) => setNuevoMedicamento({ ...nuevoMedicamento, horarios: e.target.value })} ayuda="Usa formato HH:MM y separa varios horarios con comas." />
          <Mensaje>{error}</Mensaje>{error && <button type="button" className="secundario" onClick={() => setVersionDetalle((v) => v + 1)}>Reintentar carga</button>}<Mensaje tipo="exito">{aviso}</Mensaje><button disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar medicamento'}</button>
        </form></section>
      </>}
      {sesion.rol === 'seguimiento' && vistaProfesional === 'acciones' && <>
        <section className="tarjeta"><h2>Registrar acción de seguimiento</h2><p className="descripcion-seccion">Registra una llamada, mensaje, visita, revisión u observación realizada.</p><form onSubmit={guardarAccion}>
          <label className="campo"><span>Tipo de acción <span className="campo-obligatorio" aria-hidden="true">*</span></span><select value={accion.tipoAccion} onChange={(e) => setAccion({ ...accion, tipoAccion: e.target.value })}>
            {['llamada', 'mensaje', 'revision', 'visita', 'observacion', 'otro'].map((x) => <option key={x} value={x}>{etiquetaAccion(x)}</option>)}
          </select></label>
          <Campo etiqueta="Descripción" name="descripcion" value={accion.descripcion} onChange={(e) => setAccion({ ...accion, descripcion: e.target.value })} ayuda="Registra solo la información necesaria para el seguimiento." required />
          <Mensaje>{error}</Mensaje>{error && <button type="button" className="secundario" onClick={() => setVersionDetalle((v) => v + 1)}>Reintentar carga</button>}<Mensaje tipo="exito">{aviso}</Mensaje><button disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar acción'}</button>
        </form></section>
        <section className="tarjeta"><h2>Historial de acciones</h2>{acciones.length ? <ul className="lista">{acciones.map((a) => <li key={a.id}><strong>{etiquetaAccion(a.tipoAccion)}</strong><div className="detalle">{new Date(a.fechaAccion).toLocaleString('es-MX')}</div><p>{a.descripcion}</p></li>)}</ul> : <p className="vacio">Aún no hay acciones registradas para este paciente.</p>}</section>
      </>}
    </>}
  </div>;
}
