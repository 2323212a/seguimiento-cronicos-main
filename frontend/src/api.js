const BASE = import.meta.env.VITE_API_URL ?? '/api';
let csrfToken = null;
let csrfPending = null;

function mensajeHttp(status, codigo) {
  if (codigo === 'Validación CSRF requerida') return 'No se pudo validar la solicitud. Actualiza la página e inténtalo de nuevo.';
  if (codigo === 'Origen no permitido') return 'No se pudo completar la solicitud desde esta página.';
  if (codigo === 'Código de vinculación no válido') return 'El código debe tener 12 caracteres. Cópialo completo desde el mensaje del bot.';
  if (codigo === 'El código venció o no es válido. Solicita otro en Telegram.') return 'El código venció, ya se usó o fue reemplazado. Envía /vincular al bot una vez y pega el código más reciente dentro de 10 minutos.';
  if (codigo === 'Este chat ya está vinculado a otra cuenta') return 'Este Telegram ya está vinculado a otra cuenta. Contacta al administrador para corregir la vinculación.';
  if (status === 400 || status === 422) return 'Revisa los datos ingresados e inténtalo de nuevo.';
  if (status === 401) {
    if (codigo === 'Sesión no válida') return 'Tu sesión venció o no es válida. Inicia sesión de nuevo.';
    if (codigo) return codigo;
    return 'No se pudo autenticar la solicitud. Inicia sesión de nuevo.';
  }
  if (status === 403) return 'No tienes permiso para realizar esta acción.';
  if (status === 404) return 'No se encontró la información solicitada. Actualiza la pantalla e inténtalo de nuevo.';
  if (status === 409) return 'No se pudo completar el cambio porque los datos ya cambiaron o existe un conflicto. Actualiza la pantalla e inténtalo de nuevo.';
  if (status >= 500) return 'El servicio no pudo completar la solicitud. Inténtalo más tarde.';
  return 'No se pudo completar la solicitud. Inténtalo de nuevo.';
}

function errorDeRed(error) {
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
    return new Error('La solicitud tardó demasiado. Comprueba tu conexión e inténtalo de nuevo.');
  }
  return new Error('No se pudo conectar con el servicio. Comprueba tu conexión e inténtalo de nuevo.');
}

async function pedir(ruta, opciones = {}) {
  const metodo = opciones.method ?? 'GET';
  const headers = { 'content-type': 'application/json', ...(opciones.headers ?? {}) };
  if (!['GET', 'HEAD', 'OPTIONS'].includes(metodo)) {
    if (!csrfToken) await api.csrf();
    headers['x-csrf-token'] = csrfToken;
  }
  const enviar = async () => {
    try {
      const respuesta = await fetch(BASE + ruta, {
        credentials: 'include', ...opciones, method: metodo, headers,
        signal: opciones.signal ?? AbortSignal.timeout(15000),
      });
      const datos = await respuesta.json().catch(() => null);
      return { respuesta, datos };
    } catch (error) { throw errorDeRed(error); }
  };
  let { respuesta, datos } = await enviar();
  if (respuesta.status === 403 && datos?.error === 'Validación CSRF requerida' && !['GET', 'HEAD', 'OPTIONS'].includes(metodo)) {
    csrfToken = null;
    try { await api.csrf({ renovar: true }); } catch (error) { throw errorDeRed(error); }
    headers['x-csrf-token'] = csrfToken;
    ({ respuesta, datos } = await enviar());
  }
  if (!respuesta.ok) {
    const error = new Error(mensajeHttp(respuesta.status, datos?.error));
    error.status = respuesta.status;
    throw error;
  }
  return datos;
}
const post = (ruta, cuerpo) => pedir(ruta, { method: 'POST', body: JSON.stringify(cuerpo) });
const patch = (ruta, cuerpo) => pedir(ruta, { method: 'PATCH', body: JSON.stringify(cuerpo) });

export const api = {
  async csrf({ renovar = false } = {}) {
    if (csrfToken && !renovar) return { csrfToken };
    if (renovar) csrfToken = null;
    if (!csrfPending) csrfPending = pedir('/auth/csrf').then((datos) => { csrfToken = datos.csrfToken; return datos; }).finally(() => { csrfPending = null; });
    return csrfPending;
  },
  registrarPaciente: (datos) => post('/auth/registro', datos),
  async iniciarSesion(datos) {
    const resultado = await post('/auth/login', datos);
    csrfToken = resultado.csrfToken;
    return resultado.usuario;
  },
  sesion: () => pedir('/auth/me'),
  perfilPaciente: () => pedir('/pacientes/me'),
  vincularTelegram: (codigo) => post('/pacientes/me/telegram/vincular', { codigo }),
  async salir() { try { await post('/auth/logout', {}); } finally { csrfToken = null; } },
  listarMediciones: (opciones = {}) => pedir(`/pacientes/me/mediciones${opciones.tipo ? `?tipo=${opciones.tipo}` : ''}`),
  registrarMedicion: (datos) => post('/pacientes/me/mediciones', datos),
  listarMedicamentos: () => pedir('/pacientes/me/medicamentos'),
  listarAlertasPropias: () => pedir('/pacientes/me/alertas'),
  listarObjetivosPropios: () => pedir('/pacientes/me/objetivos'),
  registrarMedicamento: (idPaciente, datos) => post(`/medico/pacientes/${idPaciente}/medicamentos`, datos),
  listarPacientesAsignados: (rol) => pedir(`/${rol}/pacientes`),
  listarMedicionesPaciente: (rol, id) => pedir(`/${rol}/pacientes/${id}/mediciones`),
  listarMedicamentosPaciente: (id) => pedir(`/medico/pacientes/${id}/medicamentos`),
  listarAlertasPaciente: (rol, id) => pedir(`/${rol}/pacientes/${id}/alertas`),
  listarObjetivosPaciente: (rol, id) => pedir(`/${rol}/pacientes/${id}/objetivos`),
  registrarObjetivoPaciente: (id, datos) => post(`/medico/pacientes/${id}/objetivos`, datos),
  listarDiagnosticosPropios: () => pedir('/pacientes/me/diagnosticos'),
  listarDiagnosticosPaciente: (id) => pedir(`/medico/pacientes/${id}/diagnosticos`),
  registrarDiagnosticoPaciente: (id, datos) => post(`/medico/pacientes/${id}/diagnosticos`, datos),
  cerrarDiagnosticoPaciente: (idPaciente,idDiagnostico) => pedir(`/medico/pacientes/${idPaciente}/diagnosticos/${idDiagnostico}/cerrar`, {method:'PATCH',body:JSON.stringify({})}),
  listarCriteriosSeguridad: () => pedir('/editorial/seguridad/criterios'),
  crearCriterioSeguridad: (datos) => post('/editorial/seguridad/criterios',datos),
  actualizarCriterioSeguridad: (id,datos) => pedir(`/editorial/seguridad/criterios/${id}`,{method:'PATCH',body:JSON.stringify(datos)}),
  criterioSeguridadOperacion: (id,accion,datos={}) => post(`/editorial/seguridad/criterios/${id}/${accion}`,datos),
  listarAccionesSeguimiento: (id) => pedir(`/seguimiento/pacientes/${id}/acciones`),
  registrarAccionSeguimiento: (id, datos) => post(`/seguimiento/pacientes/${id}/acciones`, datos),
  listarUsuariosAdmin: () => pedir('/admin/usuarios'),
  listarAsignacionesAdmin: () => pedir('/admin/asignaciones'),
  crearUsuarioAdmin: (datos) => post('/admin/usuarios', datos),
  asignarProfesional: (tipo, paciente, profesional) => pedir(`/admin/pacientes/${paciente}/asignacion-${tipo}`, {
    method: 'PUT', body: JSON.stringify(tipo === 'medico' ? { idMedico: profesional } : { idSeguimiento: profesional }),
  }),
  cambiarEstadoUsuario: (id, activo) => patch(`/admin/usuarios/${id}/estado`, { activo }),
  cambiarRolUsuario: (id, rol) => patch(`/admin/usuarios/${id}/rol`, { rol }),
};
