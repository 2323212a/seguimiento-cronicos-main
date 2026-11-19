import 'dotenv/config';
import { construirConPostgres } from './config/container.js';
import { crearApp } from './infrastructure/http/crearApp.js';
import { Jwt } from './infrastructure/security/Jwt.js';
import { Csrf } from './infrastructure/security/Csrf.js';
import { OutboxDispatcher, validarConfiguracionOutbox } from './infrastructure/eventos/OutboxDispatcher.js';

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) throw new Error('JWT_SECRET es obligatorio; configura un secreto aleatorio de al menos 32 caracteres.');
const outboxActivo = process.env.OUTBOX_WORKER_ACTIVO === 'true';
if (outboxActivo) validarConfiguracionOutbox({ url: process.env.N8N_WEBHOOK_URL, apiKey: process.env.N8N_API_KEY });
const jwt = new Jwt({ secreto: jwtSecret });
const csrf = new Csrf(jwtSecret);

const { db, casosDeUso, usuarioRepository, pacienteRepository, asignacionRepository, alertaRepository, seguimientoRepository,
  outboxRepository, eventoRecibidoRepository } = await construirConPostgres();
console.log('PostgreSQL conectado:', await db.probarConexion());

const puerto = Number(process.env.PORT) || 3000;
const origenesPermitidos = (process.env.FRONTEND_ORIGINS ?? 'http://localhost:5173').split(',').map((x) => x.trim()).filter(Boolean);
const servidor = crearApp({ casosDeUso, jwt, csrf, usuarioRepository, pacienteRepository, asignacionRepository,
  alertaRepository, seguimientoRepository, eventoRecibidoRepository,
  apiKeyAutomatizacion: process.env.N8N_API_KEY, origenesPermitidos }).listen(puerto, () => {
  console.log(`API escuchando en http://localhost:${puerto}`);
});

const dispatcher = outboxActivo ? new OutboxDispatcher({ outboxRepository, url: process.env.N8N_WEBHOOK_URL, apiKey: process.env.N8N_API_KEY }) : null;
const dispatcherTask = dispatcher?.iniciar();

const apagar = async () => {
  dispatcher?.parar();
  await new Promise((resolve) => servidor.close(resolve));
  await dispatcherTask;
  await db.cerrar();
};
process.on('SIGINT', apagar);
process.on('SIGTERM', apagar);
