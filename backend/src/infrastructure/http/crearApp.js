import express from 'express';
import cors from 'cors';
import { ErrorDeDominio, NoAutorizado, NoEncontrado, Conflicto } from '../../domain/errors.js';
import { Csrf } from '../security/Csrf.js';

const asincrono = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const cookiesDe = (req) => Object.fromEntries((req.headers.cookie ?? '').split(';').map((x) => x.trim()).filter(Boolean).map((x) => {
  const i = x.indexOf('='); return [decodeURIComponent(x.slice(0, i)), decodeURIComponent(x.slice(i + 1))];
}));
const idDe = (v) => { const n = Number(v); if (!Number.isInteger(n) || n <= 0) throw new ErrorDeDominio('Identificador no válido'); return n; };
const pacienteAutenticado = async (req, repository) => {
  const paciente = await repository.buscarPorUsuario(req.usuario.id);
  if (paciente) return paciente;
  if (req.usuario.idPaciente) return repository.buscarPorId(req.usuario.idPaciente);
  return null;
};
const ROLES = new Set(['paciente', 'medico', 'seguimiento', 'administrador']);

export function crearApp({ casosDeUso, jwt, csrf: csrfInjected, usuarioRepository, pacienteRepository,
  asignacionRepository, alertaRepository, seguimientoRepository, eventoRecibidoRepository, apiKeyAutomatizacion = null,
  origenesPermitidos = ['http://localhost:5173'] }) {
  const app = express();
  const csrf = csrfInjected ?? new Csrf(process.env.JWT_SECRET ?? '');
  const origenes = new Set(origenesPermitidos);
  const seguro = process.env.NODE_ENV === 'production';
  const cookieBase = `Path=/; SameSite=Lax${seguro ? '; Secure' : ''}`;
  const cookieToken = (res, token) => res.append('Set-Cookie', `sesion=${encodeURIComponent(token)}; ${cookieBase}; HttpOnly; Max-Age=900`);
  const cookieCsrf = (res, token) => res.append('Set-Cookie', `csrf_token=${encodeURIComponent(token)}; ${cookieBase}; Max-Age=900`);
  const borrarCookies = (res) => {
    res.append('Set-Cookie', `sesion=; ${cookieBase}; HttpOnly; Max-Age=0`);
    res.append('Set-Cookie', `csrf_token=; ${cookieBase}; Max-Age=0`);
  };

  app.use(cors({ credentials: true, origin(origin, callback) {
    if (!origin || origenes.has(origin)) return callback(null, true);
    return callback(new Error('Origen no permitido'));
  }, allowedHeaders: ['content-type', 'x-csrf-token', 'x-api-key'], methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'] }));
  app.use('/api', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.use(express.json({ limit: '32kb' }));
  app.get('/', (_req, res) => res.json({ servicio: 'Seguimiento de salud', estado: 'ok' }));
  app.get('/api/salud', (_req, res) => res.json({ estado: 'ok' }));

  const csrfRequerido = (req, res, next) => {
    const origin = req.get('origin');
    if (origin && !origenes.has(origin)) return res.status(403).json({ error: 'Origen no permitido' });
    const cookies = cookiesDe(req);
    if (!csrf.valido(cookies.csrf_token) || cookies.csrf_token !== req.get('x-csrf-token')) {
      return res.status(403).json({ error: 'Validación CSRF requerida' });
    }
    return next();
  };
  const autenticado = asincrono(async (req, res, next) => {
    const token = cookiesDe(req).sesion;
    const claims = token && jwt?.verificar(token);
    if (!claims) throw new NoAutorizado('Sesión no válida');
    const usuario = await usuarioRepository.buscarActual(idDe(claims.sub));
    if (!usuario?.activo || !ROLES.has(usuario.rol)) throw new NoAutorizado('Sesión no válida');
    req.usuario = usuario;
    next();
  });
  const rol = (...permitidos) => (req, res, next) => {
    if (!permitidos.includes(req.usuario?.rol)) return res.status(403).json({ error: 'Permiso insuficiente' });
    next();
  };
  const apiKey = (req, res, next) => {
    if (!apiKeyAutomatizacion) return res.status(503).json({ error: 'Automatización no configurada' });
    if (req.get('x-api-key') !== apiKeyAutomatizacion) return res.status(401).json({ error: 'Credencial de automatización inválida' });
    next();
  };

  app.get('/api/auth/csrf', (_req, res) => {
    const token = csrf.crear(); cookieCsrf(res, token); res.json({ csrfToken: token });
  });
  app.post('/api/auth/registro', csrfRequerido, asincrono(async (req, res) => {
    await casosDeUso.registrarPaciente.ejecutar(req.body);
    res.status(202).json({ estado: 'pendiente_validacion' });
  }));
  app.post('/api/auth/login', csrfRequerido, asincrono(async (req, res) => {
    const usuario = await casosDeUso.iniciarSesion.ejecutar(req.body);
    cookieToken(res, jwt.firmar({ sub: usuario.id }));
    const tokenCsrf = csrf.crear(); cookieCsrf(res, tokenCsrf);
    res.json({ usuario: { id: usuario.id, rol: usuario.rol, idPaciente: usuario.idPaciente, nombre: usuario.nombre }, csrfToken: tokenCsrf });
  }));
  app.post('/api/auth/logout', csrfRequerido, (_req, res) => { borrarCookies(res); res.status(204).end(); });
  app.get('/api/auth/me', autenticado, (req, res) => res.json({ id: req.usuario.id, correo: req.usuario.correo, rol: req.usuario.rol, idPaciente: req.usuario.idPaciente, nombre: req.usuario.nombre }));

  app.get('/api/pacientes/me', autenticado, rol('paciente'), asincrono(async (req, res) => {
    const p = await pacienteAutenticado(req, pacienteRepository);
    if (!p) throw new NoEncontrado('Perfil de paciente no encontrado');
    res.json(p);
  }));
  app.post('/api/pacientes/me/mediciones', csrfRequerido, autenticado, rol('paciente'), asincrono(async (req, res) => {
    const paciente = await pacienteAutenticado(req, pacienteRepository);
    if (!paciente) throw new NoEncontrado('Perfil de paciente no encontrado');
    res.status(201).json(await casosDeUso.registrarMedicion.ejecutar({ ...req.body, idPaciente: paciente.id }, req.usuario.id));
  }));
  app.get('/api/pacientes/me/mediciones', autenticado, rol('paciente'), asincrono(async (req, res) => {
    const p = await pacienteAutenticado(req, pacienteRepository);
    if (!p) throw new NoEncontrado('Perfil de paciente no encontrado');
    res.json(await casosDeUso.consultarHistorial.ejecutar({ idPaciente: p.id, tipo: req.query.tipo, desde: req.query.desde, hasta: req.query.hasta, usuarioId: req.usuario.id, rol: 'paciente' }));
  }));
  app.get('/api/pacientes/me/medicamentos', autenticado, rol('paciente'), asincrono(async (req, res) => {
    const p = await pacienteAutenticado(req, pacienteRepository);
    if (!p) throw new NoEncontrado('Perfil de paciente no encontrado');
    res.json(await casosDeUso.consultarMedicamentos.ejecutar({ idPaciente: p.id, usuarioId: req.usuario.id, rol: 'paciente' }));
  }));
  app.get('/api/pacientes/me/alertas', autenticado, rol('paciente'), asincrono(async (req, res) => {
    const p = await pacienteAutenticado(req, pacienteRepository);
    if (!p) throw new NoEncontrado('Perfil de paciente no encontrado');
    res.json(await alertaRepository.listarPorPaciente(p.id, { usuarioId: req.usuario.id, rol: 'paciente' }));
  }));
  app.post('/api/pacientes/me/telegram/vincular', csrfRequerido, autenticado, rol('paciente'), asincrono(async (req, res) => {
    const paciente = await pacienteAutenticado(req, pacienteRepository);
    if (!paciente) throw new NoEncontrado('Perfil de paciente no encontrado');
    if (!casosDeUso.gestionarVinculoTelegram) throw new ErrorDeDominio('La vinculación de Telegram no está disponible');
    res.json(await casosDeUso.gestionarVinculoTelegram.confirmar({ idPaciente: paciente.id, codigo: req.body.codigo }));
  }));
  app.get('/api/pacientes/me/objetivos', autenticado, rol('paciente'), asincrono(async (req, res) => {
    const p = await pacienteAutenticado(req, pacienteRepository);
    if (!p) throw new NoEncontrado('Perfil de paciente no encontrado');
    if (!casosDeUso.gestionarObjetivosMedicion) return res.json([]);
    res.json(await casosDeUso.gestionarObjetivosMedicion.listar({ idPaciente: p.id, actorId: req.usuario.id, rol: 'paciente' }));
  }));
  app.get('/api/pacientes/me/diagnosticos', autenticado, rol('paciente'), asincrono(async (req,res)=>{
    const p=await pacienteAutenticado(req,pacienteRepository);
    if(!p)throw new NoEncontrado('Perfil de paciente no encontrado');
    res.json(await casosDeUso.gestionarDiagnosticos.listar(p.id,req.usuario.id,'paciente'));
  }));

  for (const tipo of ['medico', 'seguimiento']) {
    const prefijo = `/api/${tipo}`;
    app.get(`${prefijo}/pacientes`, autenticado, rol(tipo), asincrono(async (req, res) => {
      res.json(await pacienteRepository.listarAsignados(req.usuario.id, tipo));
    }));
    app.get(`${prefijo}/pacientes/:idPaciente/mediciones`, autenticado, rol(tipo), asincrono(async (req, res) => {
      const id = idDe(req.params.idPaciente);
      if (!(await pacienteRepository.estaAsignado(req.usuario.id, id, tipo))) throw new NoEncontrado('Paciente no encontrado');
      res.json(await casosDeUso.consultarHistorial.ejecutar({ idPaciente: id, tipo: req.query.tipo, desde: req.query.desde, hasta: req.query.hasta, usuarioId: req.usuario.id, rol: tipo }));
    }));
    app.get(`${prefijo}/pacientes/:idPaciente/alertas`, autenticado, rol(tipo), asincrono(async (req, res) => {
      const id = idDe(req.params.idPaciente);
      if (!(await pacienteRepository.estaAsignado(req.usuario.id, id, tipo))) throw new NoEncontrado('Paciente no encontrado');
      res.json(await alertaRepository.listarPorPaciente(id, { usuarioId: req.usuario.id, rol: tipo }));
    }));
    app.get(`${prefijo}/pacientes/:idPaciente/objetivos`, autenticado, rol(tipo), asincrono(async (req, res) => {
      if (tipo !== 'medico' || !casosDeUso.gestionarObjetivosMedicion) throw new NoEncontrado('Paciente no encontrado');
      const id = idDe(req.params.idPaciente);
      if (!(await pacienteRepository.estaAsignado(req.usuario.id, id, tipo))) throw new NoEncontrado('Paciente no encontrado');
      res.json(await casosDeUso.gestionarObjetivosMedicion.listar({ idPaciente: id, actorId: req.usuario.id, rol: tipo }));
    }));
    app.get(`${prefijo}/pacientes/:idPaciente/diagnosticos`, autenticado, rol(tipo), asincrono(async(req,res)=>{
      if(tipo!=='medico')throw new NoEncontrado('Paciente no encontrado');
      const id=idDe(req.params.idPaciente);
      if(!(await pacienteRepository.estaAsignado(req.usuario.id,id,'medico')))throw new NoEncontrado('Paciente no encontrado');
      res.json(await casosDeUso.gestionarDiagnosticos.listar(id,req.usuario.id,'medico'));
    }));
    if(tipo==='medico'){
      app.post(`${prefijo}/pacientes/:idPaciente/diagnosticos`,csrfRequerido,autenticado,rol('medico'),asincrono(async(req,res)=>{
        const id=idDe(req.params.idPaciente);
        if(!(await pacienteRepository.estaAsignado(req.usuario.id,id,'medico')))throw new NoEncontrado('Paciente no encontrado');
        const entrada={...req.body};delete entrada.idMedico;delete entrada.actorId;
        res.status(201).json(await casosDeUso.gestionarDiagnosticos.registrar({...entrada,idPaciente:id},req.usuario.id));
      }));
      app.patch(`${prefijo}/pacientes/:idPaciente/diagnosticos/:id/cerrar`,csrfRequerido,autenticado,rol('medico'),asincrono(async(req,res)=>{
        const idPaciente=idDe(req.params.idPaciente);
        if(!(await pacienteRepository.estaAsignado(req.usuario.id,idPaciente,'medico')))throw new NoEncontrado('Paciente no encontrado');
        res.json(await casosDeUso.gestionarDiagnosticos.cerrar(idDe(req.params.id),idPaciente,req.usuario.id));
      }));
    }
    if (tipo === 'medico') app.post(`${prefijo}/pacientes/:idPaciente/objetivos`, csrfRequerido, autenticado, rol('medico'), asincrono(async (req, res) => {
      if (!casosDeUso.gestionarObjetivosMedicion) throw new ErrorDeDominio('La gestión de objetivos no está disponible');
      const id = idDe(req.params.idPaciente);
      if (!(await pacienteRepository.estaAsignado(req.usuario.id, id, tipo))) throw new NoEncontrado('Paciente no encontrado');
      const entrada = { ...req.body }; delete entrada.idMedico; delete entrada.actorId;
      res.status(201).json(await casosDeUso.gestionarObjetivosMedicion.crear({ ...entrada, idPaciente: id }, req.usuario.id));
    }));
  }
  app.get('/api/medico/pacientes/:idPaciente/medicamentos', autenticado, rol('medico'), asincrono(async (req, res) => {
    const id = idDe(req.params.idPaciente);
    if (!(await pacienteRepository.estaAsignado(req.usuario.id, id, 'medico'))) throw new NoEncontrado('Paciente no encontrado');
    res.json(await casosDeUso.consultarMedicamentos.ejecutar({ idPaciente: id, usuarioId: req.usuario.id, rol: 'medico' }));
  }));
  app.post('/api/medico/pacientes/:idPaciente/medicamentos', csrfRequerido, autenticado, rol('medico'), asincrono(async (req, res) => {
    const id = idDe(req.params.idPaciente);
    if (!(await pacienteRepository.estaAsignado(req.usuario.id, id, 'medico'))) throw new NoEncontrado('Paciente no encontrado');
    res.status(201).json(await casosDeUso.registrarMedicamento.ejecutar({ ...req.body, idPaciente: id }, req.usuario.id));
  }));
  app.patch('/api/medico/alertas/:id/estado', csrfRequerido, autenticado, rol('medico'), asincrono(async (req, res) => {
    const alerta = await alertaRepository.buscarPorId(idDe(req.params.id));
    if (!alerta || !(await pacienteRepository.estaAsignado(req.usuario.id, alerta.idPaciente, 'medico'))) throw new NoEncontrado('Alerta no encontrada');
    res.json(await alertaRepository.cambiarEstado(alerta.id, req.body.estado, alerta.idPaciente, req.usuario.id));
  }));
  app.get('/api/seguimiento/pacientes/:idPaciente/medicamentos', autenticado, rol('seguimiento'), (_req, res) => res.status(403).json({ error: 'El rol de seguimiento no consulta medicamentos' }));
  app.get('/api/seguimiento/pacientes/:idPaciente/acciones', autenticado, rol('seguimiento'), asincrono(async (req, res) => {
    const id = idDe(req.params.idPaciente);
    if (!(await pacienteRepository.estaAsignado(req.usuario.id, id, 'seguimiento'))) throw new NoEncontrado('Paciente no encontrado');
    res.json(await seguimientoRepository.listar({ idUsuario: req.usuario.id, idPaciente: id }));
  }));
  app.post('/api/seguimiento/pacientes/:idPaciente/acciones', csrfRequerido, autenticado, rol('seguimiento'), asincrono(async (req, res) => {
    const id = idDe(req.params.idPaciente);
    if (!['llamada', 'mensaje', 'revision', 'visita', 'observacion', 'otro'].includes(req.body.tipoAccion)) throw new ErrorDeDominio('Tipo de acción no válido');
    if (typeof req.body.descripcion !== 'string' || !req.body.descripcion.trim()) throw new ErrorDeDominio('La descripción es obligatoria');
    res.status(201).json(await seguimientoRepository.registrar({ idUsuario: req.usuario.id, idPaciente: id, tipoAccion: req.body.tipoAccion, descripcion: req.body.descripcion.trim() }));
  }));

  app.get('/api/admin/usuarios', autenticado, rol('administrador'), asincrono(async (req, res) => {
    res.json(await usuarioRepository.listarCuentas({ rol: req.query.rol, activo: req.query.activo === undefined ? undefined : req.query.activo === 'true' }));
  }));

  // Criterios de seguridad: solo personal médico con autorización editorial puede operar.
  const criteriosSeguridad=casosDeUso.gestionarCriteriosSeguridad;
  if(criteriosSeguridad){
    app.get('/api/editorial/seguridad/criterios',autenticado,rol('medico'),asincrono(async(req,res)=>res.json(await criteriosSeguridad.ejecutar('listar',req.usuario.id))));
    app.post('/api/editorial/seguridad/criterios',csrfRequerido,autenticado,rol('medico'),asincrono(async(req,res)=>{
      const entrada={...req.body};delete entrada.actorId;delete entrada.autorId;delete entrada.idUsuario;
      res.status(201).json(await criteriosSeguridad.ejecutar('crearBorrador',req.usuario.id,entrada));
    }));
    app.patch('/api/editorial/seguridad/criterios/:id',csrfRequerido,autenticado,rol('medico'),asincrono(async(req,res)=>{
      const entrada={...req.body};delete entrada.actorId;delete entrada.autorId;delete entrada.idUsuario;
      res.json(await criteriosSeguridad.ejecutar('actualizarBorrador',req.usuario.id,{...entrada,id:idDe(req.params.id)}));
    }));
    app.post('/api/editorial/seguridad/criterios/:id/enviar',csrfRequerido,autenticado,rol('medico'),asincrono(async(req,res)=>res.json(await criteriosSeguridad.ejecutar('enviarRevision',req.usuario.id,{id:idDe(req.params.id)}))));
    app.post('/api/editorial/seguridad/criterios/:id/decisiones',csrfRequerido,autenticado,rol('medico'),asincrono(async(req,res)=>{
      const entrada={decision:req.body.decision,observacion:req.body.observacion};
      res.json(await criteriosSeguridad.ejecutar('registrarDecision',req.usuario.id,{...entrada,id:idDe(req.params.id)}));
    }));
    app.post('/api/editorial/seguridad/criterios/:id/devolver',csrfRequerido,autenticado,rol('medico'),asincrono(async(req,res)=>res.json(await criteriosSeguridad.ejecutar('devolverEdicion',req.usuario.id,{id:idDe(req.params.id)}))));
    app.post('/api/editorial/seguridad/criterios/:id/activar',csrfRequerido,autenticado,rol('medico'),asincrono(async(req,res)=>res.json(await criteriosSeguridad.ejecutar('activar',req.usuario.id,{id:idDe(req.params.id)}))));
    app.post('/api/editorial/seguridad/criterios/:id/retirar',csrfRequerido,autenticado,rol('medico'),asincrono(async(req,res)=>res.json(await criteriosSeguridad.ejecutar('retirar',req.usuario.id,{id:idDe(req.params.id),motivo:req.body.motivo}))));
  }
  app.post('/api/admin/usuarios', csrfRequerido, autenticado, rol('administrador'), asincrono(async (req, res) => {
    const { correo, contrasena, rol: nuevoRol } = req.body;
    if (!['medico', 'seguimiento', 'administrador'].includes(nuevoRol)) throw new ErrorDeDominio('Rol de cuenta profesional no válido');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo ?? '')) throw new ErrorDeDominio('El correo no es válido');
    if (typeof contrasena !== 'string' || contrasena.length < 12) throw new ErrorDeDominio('La contraseña inicial debe tener al menos 12 caracteres');
    const cuenta = await usuarioRepository.crearCuenta({ actorId: req.usuario.id, correo: String(correo ?? '').trim().toLowerCase(), contrasenaHash: await casosDeUso.passwordHasher.hash(contrasena), rol: nuevoRol, activo: false });
    res.status(201).json(cuenta);
  }));
  app.patch('/api/admin/usuarios/:id/estado', csrfRequerido, autenticado, rol('administrador'), asincrono(async (req, res) => {
    if (typeof req.body.activo !== 'boolean') throw new ErrorDeDominio('activo debe ser booleano');
    res.json(await usuarioRepository.cambiarEstado({ actorId: req.usuario.id, objetivoId: idDe(req.params.id), activo: req.body.activo }));
  }));
  app.patch('/api/admin/usuarios/:id/rol', csrfRequerido, autenticado, rol('administrador'), asincrono(async (req, res) => {
    if (!['medico', 'seguimiento', 'administrador'].includes(req.body.rol)) throw new ErrorDeDominio('Rol no válido');
    res.json(await usuarioRepository.cambiarRol({ actorId: req.usuario.id, objetivoId: idDe(req.params.id), rol: req.body.rol }));
  }));
  app.get('/api/admin/asignaciones', autenticado, rol('administrador'), asincrono(async (_req, res) => res.json(await asignacionRepository.listarParaAdministrador())));
  for (const tipo of ['medico', 'seguimiento']) {
    app.put(`/api/admin/pacientes/:idPaciente/asignacion-${tipo}`, csrfRequerido, autenticado, rol('administrador'), asincrono(async (req, res) => {
      const idProfesional = idDe(tipo === 'medico' ? req.body.idMedico : req.body.idSeguimiento);
      res.json(await asignacionRepository.asignar({ actorId: req.usuario.id, idPaciente: idDe(req.params.idPaciente), idProfesional, tipo }));
    }));
    app.delete(`/api/admin/pacientes/:idPaciente/asignacion-${tipo}`, csrfRequerido, autenticado, rol('administrador'), asincrono(async (req, res) => {
      res.json(await asignacionRepository.cerrar({ actorId: req.usuario.id, idPaciente: idDe(req.params.idPaciente), tipo }));
    }));
  }

  app.get('/api/automatizacion/recordatorios', apiKey, asincrono(async (req, res) => {
    const items = await casosDeUso.obtenerRecordatorios.ejecutar({ hora: req.query.hora });
    res.json(items.map((x) => ({ idHorario: x.idHorario, idPaciente: x.idPaciente, telegramChatId: x.telegramChatId, texto: 'Tienes un recordatorio pendiente. Revisa tu cuenta segura.' })));
  }));
  app.post('/api/automatizacion/telegram/vinculos', apiKey, asincrono(async (req, res) => {
    if (!casosDeUso.gestionarVinculoTelegram) throw new ErrorDeDominio('La vinculación de Telegram no está disponible');
    res.status(201).json(await casosDeUso.gestionarVinculoTelegram.crear(req.body.chatId));
  }));
  app.get('/api/automatizacion/telegram/alertas', apiKey, asincrono(async (req, res) => {
    res.json(await casosDeUso.consultarEstadoAlertasTelegram.ejecutar(req.query.chatId));
  }));
  app.get('/api/automatizacion/telegram/datos', apiKey, asincrono(async (req, res) => {
    res.json(await casosDeUso.consultarDatosTelegram.ejecutar({ chatId: req.query.chatId, seccion: req.query.seccion }));
  }));
  app.post('/api/automatizacion/notificaciones', apiKey, asincrono(async (req, res) => {
    const mensajesPermitidos = new Set([
      'Tienes un recordatorio pendiente. Revisa tu cuenta segura.',
      'Hay una actualización disponible en tu cuenta segura. Inicia sesión para consultarla.',
    ]);
    if (!mensajesPermitidos.has(req.body.mensaje)) throw new ErrorDeDominio('Solo se permiten mensajes genéricos predefinidos');
    res.status(201).json(await casosDeUso.registrarNotificacion.ejecutar(req.body));
  }));
  app.post('/api/automatizacion/eventos/:eventId/reclamar', apiKey, asincrono(async (req, res) => {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(req.params.eventId)) throw new ErrorDeDominio('eventId inválido');
    const resultado = await eventoRecibidoRepository.reclamar(req.params.eventId);
    if (resultado.ocupado) return res.status(409).json({ procesar: false, estado: 'procesando' });
    if (resultado.estado === 'desconocido') throw new NoEncontrado('Evento no encontrado');
    res.json(resultado);
  }));
  app.post('/api/automatizacion/eventos/:eventId/completar', apiKey, asincrono(async (req, res) => {
    const ok = await eventoRecibidoRepository.completar(req.params.eventId);
    if (!ok) throw new Conflicto('El evento no está reclamado o su lease venció');
    res.json({ completado: true });
  }));

  // Editorial clínico: separado de la administración de cuentas. Los casos de uso
  // y el repositorio verifican capacidad, vigencia, alcance y usuario activo.
  const editorial = casosDeUso.gestionEditorialCatalogo;
  if (editorial) {
    const ejecutarEditorial = (op, datos = (req) => req.body) => asincrono(async (req, res) => {
      const entrada = { ...datos(req) };
      delete entrada.actorId;
      delete entrada.idUsuarioActor;
      const resultado = await editorial.ejecutar(op, req.usuario.id, entrada);
      res.json(resultado);
    });
    app.get('/api/editorial/catalogos', autenticado, asincrono(async (req,res) => res.json(await editorial.ejecutar('listarCatalogos',req.usuario.id))));
    app.post('/api/editorial/catalogos', csrfRequerido, autenticado, ejecutarEditorial('crearCatalogo'));
    app.post('/api/editorial/catalogos/:id/versiones', csrfRequerido, autenticado, ejecutarEditorial('crearVersion',(req)=>({...req.body,idCatalogo:idDe(req.params.id)})));
    app.post('/api/editorial/fuentes', csrfRequerido, autenticado, ejecutarEditorial('registrarFuente'));
    app.patch('/api/editorial/fuentes/:id/estado', csrfRequerido, autenticado, ejecutarEditorial('revisarFuente',(req)=>({...req.body,idFuente:idDe(req.params.id)})));
    app.post('/api/editorial/versiones/:id/fuentes', csrfRequerido, autenticado, ejecutarEditorial('asociarFuente',(req)=>({...req.body,idVersion:idDe(req.params.id)})));
    app.post('/api/admin/editorial/autorizaciones', csrfRequerido, autenticado, rol('administrador'), ejecutarEditorial('concederAutorizacion'));
    app.get('/api/admin/editorial/autorizaciones', autenticado, rol('administrador'), asincrono(async (req,res)=>res.json(await editorial.ejecutar('listarAutorizaciones',req.usuario.id))));
    app.patch('/api/admin/editorial/autorizaciones/:id/revocar', csrfRequerido, autenticado, rol('administrador'), ejecutarEditorial('revocarAutorizacion',(req)=>({...req.body,idAutorizacion:idDe(req.params.id)})));
    app.post('/api/editorial/versiones/:id/solicitar-revision', csrfRequerido, autenticado, ejecutarEditorial('abrirRonda',(req)=>({idVersion:idDe(req.params.id)})));
    app.post('/api/editorial/rondas/:id/asignaciones', csrfRequerido, autenticado, ejecutarEditorial('asignarRevisores',(req)=>({...req.body,idRonda:idDe(req.params.id)})));
    app.post('/api/editorial/rondas/:id/decisiones', csrfRequerido, autenticado, ejecutarEditorial('registrarDecision',(req)=>({...req.body,idRonda:idDe(req.params.id)})));
    app.post('/api/editorial/rondas/:id/cerrar', csrfRequerido, autenticado, ejecutarEditorial('cerrarRonda',(req)=>({...req.body,idRonda:idDe(req.params.id)})));
    app.post('/api/editorial/versiones/:id/publicar', csrfRequerido, autenticado, ejecutarEditorial('publicarVersion',(req)=>({idVersion:idDe(req.params.id)})));
    app.post('/api/editorial/catalogos/:id/retirar', csrfRequerido, autenticado, ejecutarEditorial('retirarCatalogo',(req)=>({...req.body,idCatalogo:idDe(req.params.id)})));
    app.get('/api/editorial/catalogos/:id/versiones', autenticado, ejecutarEditorial('consultarVersiones',(req)=>({idCatalogo:idDe(req.params.id)})));
    app.get('/api/editorial/versiones/:id/fuentes', autenticado, ejecutarEditorial('consultarFuentes',(req)=>({idVersion:idDe(req.params.id)})));
    app.get('/api/editorial/auditoria', autenticado, ejecutarEditorial('consultarAuditoria',(req)=>({limit:req.query.limit})));
  }

  app.use((error, _req, res, _next) => {
    if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON no válido' });
    if (error instanceof NoAutorizado) return res.status(401).json({ error: error.message });
    if (error instanceof NoEncontrado) return res.status(404).json({ error: error.message });
    if (error instanceof Conflicto) return res.status(409).json({ error: error.message });
    if (error instanceof ErrorDeDominio) return res.status(400).json({ error: error.message });
    console.error(error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  });
  return app;
}
