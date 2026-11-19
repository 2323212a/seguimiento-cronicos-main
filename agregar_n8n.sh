#!/usr/bin/env bash
# Agrega la integración con n8n a un proyecto ya creado.
# Uso: desde la carpeta seguimiento-cronicos ->  bash agregar_n8n.sh
set -euo pipefail
[ -d backend/src ] || { echo "Ejecuta este script dentro de la carpeta seguimiento-cronicos"; exit 1; }
mkdir -p "backend" "backend/n8n" "backend/src" "backend/src/application/ports" "backend/src/application/use-cases" "backend/src/config" "backend/src/infrastructure/eventos" "backend/src/infrastructure/http" "backend/src/infrastructure/persistence/memory" "backend/src/infrastructure/persistence/postgres" "backend/tests"
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

## Integración con n8n

El backend avisa a n8n y n8n llama al backend (rutas protegidas con `x-api-key`):

    Backend --(webhook evento medicion.registrada)--> n8n --> Telegram
    n8n (cada minuto) --> GET  /api/automatizacion/recordatorios?hora=HH:MM --> Telegram
    n8n --> POST /api/automatizacion/notificaciones   (registra lo enviado)

Workflows importables en `backend/n8n/`. Variables en `.env`: N8N_API_KEY y N8N_WEBHOOK_URL.

## Pendiente

Autenticación, alertas (criterios clínicos), Telegram, reportes, frontend, app móvil, automatizaciones y despliegue en EC2.
__FIN_ARCHIVO__
cat > "backend/.env.example" << '__FIN_ARCHIVO__'
PORT=3000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=seguimiento_cronicos
DB_USER=postgres
DB_PASSWORD=postgres

# --- Integración con n8n ---
# Clave compartida: n8n la envía en el header x-api-key al llamar /api/automatizacion/*
N8N_API_KEY=cambia-esta-clave
# Webhook de n8n que recibe el evento "medicion.registrada" (workflow activo)
N8N_WEBHOOK_URL=http://localhost:5678/webhook/medicion-registrada
__FIN_ARCHIVO__
cat > "backend/n8n/workflow-confirmacion-medicion.json" << '__FIN_ARCHIVO__'
{
  "name": "Seguimiento - Confirmación por Telegram (medición registrada)",
  "nodes": [
    {
      "parameters": {
        "httpMethod": "POST",
        "path": "medicion-registrada",
        "options": {}
      },
      "id": "a1f0c1d2-0001-4a00-9000-000000000001",
      "name": "Webhook medición",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 2,
      "position": [
        0,
        0
      ],
      "webhookId": "medicion-registrada"
    },
    {
      "parameters": {
        "conditions": {
          "boolean": [
            {
              "value1": "={{ !!$json.body.paciente.telegramChatId }}",
              "value2": true
            }
          ]
        }
      },
      "id": "a1f0c1d2-0002-4a00-9000-000000000002",
      "name": "¿Tiene Telegram?",
      "type": "n8n-nodes-base.if",
      "typeVersion": 1,
      "position": [
        240,
        0
      ]
    },
    {
      "parameters": {
        "chatId": "={{ $json.body.paciente.telegramChatId }}",
        "text": "={{ '✅ Hola ' + $json.body.paciente.nombre + ', registramos tu medición de ' + ($json.body.medicion.tipo === 'glucosa' ? ('glucosa: ' + $json.body.medicion.glucosaMgDl + ' mg/dL') : ('presión arterial: ' + $json.body.medicion.sistolicaMmhg + '/' + $json.body.medicion.diastolicaMmhg + ' mmHg')) + '.' + ($json.body.alerta ? '\\n\\n⚠️ Alerta: ' + $json.body.alerta.motivo : '') }}",
        "additionalFields": {}
      },
      "id": "a1f0c1d2-0003-4a00-9000-000000000003",
      "name": "Telegram confirmación",
      "type": "n8n-nodes-base.telegram",
      "typeVersion": 1.2,
      "position": [
        480,
        -60
      ],
      "credentials": {
        "telegramApi": {
          "id": "",
          "name": "Telegram account"
        }
      }
    },
    {
      "parameters": {
        "method": "POST",
        "url": "http://localhost:3000/api/automatizacion/notificaciones",
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            {
              "name": "x-api-key",
              "value": "cambia-esta-clave"
            }
          ]
        },
        "sendBody": true,
        "specifyBody": "json",
        "jsonBody": "={{ { idPaciente: $('Webhook medición').item.json.body.paciente.id, idAlerta: $('Webhook medición').item.json.body.alerta ? $('Webhook medición').item.json.body.alerta.id : null, tipo: $('Webhook medición').item.json.body.alerta ? 'alerta' : 'confirmacion', canal: 'telegram', mensaje: $json.result.text, estadoEnvio: 'enviado' } }}",
        "options": {}
      },
      "id": "a1f0c1d2-0004-4a00-9000-000000000004",
      "name": "Registrar notificación",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [
        720,
        -60
      ]
    }
  ],
  "connections": {
    "Webhook medición": {
      "main": [
        [
          {
            "node": "¿Tiene Telegram?",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "¿Tiene Telegram?": {
      "main": [
        [
          {
            "node": "Telegram confirmación",
            "type": "main",
            "index": 0
          }
        ],
        []
      ]
    },
    "Telegram confirmación": {
      "main": [
        [
          {
            "node": "Registrar notificación",
            "type": "main",
            "index": 0
          }
        ]
      ]
    }
  },
  "settings": {
    "executionOrder": "v1"
  }
}
__FIN_ARCHIVO__
cat > "backend/n8n/workflow-recordatorios-medicamentos.json" << '__FIN_ARCHIVO__'
{
  "name": "Seguimiento - Recordatorios de medicamentos (cada minuto)",
  "nodes": [
    {
      "parameters": {
        "rule": {
          "interval": [
            {
              "field": "minutes",
              "minutesInterval": 1
            }
          ]
        }
      },
      "id": "b2f0c1d2-0001-4a00-9000-000000000011",
      "name": "Cada minuto",
      "type": "n8n-nodes-base.scheduleTrigger",
      "typeVersion": 1.2,
      "position": [
        0,
        0
      ]
    },
    {
      "parameters": {
        "jsCode": "// Hora local HH:MM (zona horaria de n8n; define GENERIC_TIMEZONE=America/Mexico_City)\nconst hora = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });\nreturn [{ json: { hora } }];"
      },
      "id": "b2f0c1d2-0002-4a00-9000-000000000012",
      "name": "Hora actual",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [
        220,
        0
      ]
    },
    {
      "parameters": {
        "url": "http://localhost:3000/api/automatizacion/recordatorios",
        "sendQuery": true,
        "queryParameters": {
          "parameters": [
            {
              "name": "hora",
              "value": "={{ $json.hora }}"
            }
          ]
        },
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            {
              "name": "x-api-key",
              "value": "cambia-esta-clave"
            }
          ]
        },
        "options": {}
      },
      "id": "b2f0c1d2-0003-4a00-9000-000000000013",
      "name": "Consultar recordatorios",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [
        440,
        0
      ]
    },
    {
      "parameters": {
        "chatId": "={{ $json.telegramChatId }}",
        "text": "={{ '💊 Hola ' + $json.paciente + ', es hora de tu medicamento: ' + $json.medicamento + ' (' + $json.dosis + ').' }}",
        "additionalFields": {}
      },
      "id": "b2f0c1d2-0004-4a00-9000-000000000014",
      "name": "Telegram recordatorio",
      "type": "n8n-nodes-base.telegram",
      "typeVersion": 1.2,
      "position": [
        660,
        0
      ],
      "credentials": {
        "telegramApi": {
          "id": "",
          "name": "Telegram account"
        }
      }
    },
    {
      "parameters": {
        "method": "POST",
        "url": "http://localhost:3000/api/automatizacion/notificaciones",
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            {
              "name": "x-api-key",
              "value": "cambia-esta-clave"
            }
          ]
        },
        "sendBody": true,
        "specifyBody": "json",
        "jsonBody": "={{ { idPaciente: $('Consultar recordatorios').item.json.idPaciente, idHorario: $('Consultar recordatorios').item.json.idHorario, tipo: 'recordatorio', canal: 'telegram', mensaje: $json.result.text, estadoEnvio: 'enviado' } }}",
        "options": {}
      },
      "id": "b2f0c1d2-0005-4a00-9000-000000000015",
      "name": "Registrar notificación",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [
        880,
        0
      ]
    }
  ],
  "connections": {
    "Cada minuto": {
      "main": [
        [
          {
            "node": "Hora actual",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Hora actual": {
      "main": [
        [
          {
            "node": "Consultar recordatorios",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Consultar recordatorios": {
      "main": [
        [
          {
            "node": "Telegram recordatorio",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Telegram recordatorio": {
      "main": [
        [
          {
            "node": "Registrar notificación",
            "type": "main",
            "index": 0
          }
        ]
      ]
    }
  },
  "settings": {
    "executionOrder": "v1"
  }
}
__FIN_ARCHIVO__
cat > "backend/src/application/ports/MedicamentoRepository.js" << '__FIN_ARCHIVO__'
export class MedicamentoRepository {
  async guardar(_medicamento) { throw new Error('No implementado'); }
  async listarPorPaciente(_idPaciente) { throw new Error('No implementado'); }
  /** Horarios activos que coinciden con `hora` (HH:MM), con datos para notificar por Telegram. */
  async listarRecordatorios(_hora) { throw new Error('No implementado'); }
}
__FIN_ARCHIVO__
cat > "backend/src/application/ports/NotificacionRepository.js" << '__FIN_ARCHIVO__'
export class NotificacionRepository {
  /** { idPaciente, idAlerta?, idHorario?, tipo, canal, mensaje, estadoEnvio } */
  async guardar(_notificacion) { throw new Error('No implementado'); }
}
__FIN_ARCHIVO__
cat > "backend/src/application/ports/PublicadorDeEventos.js" << '__FIN_ARCHIVO__'
// Puerto de salida: avisa a sistemas externos (n8n) que ocurrió algo en el dominio.
export class PublicadorDeEventos {
  async publicar(_evento) { throw new Error('No implementado'); }
}
__FIN_ARCHIVO__
cat > "backend/src/application/use-cases/ObtenerRecordatorios.js" << '__FIN_ARCHIVO__'
import { ErrorDeDominio } from '../../domain/errors.js';

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

export class ObtenerRecordatorios {
  constructor({ medicamentoRepository }) { this.medicamentoRepository = medicamentoRepository; }

  async ejecutar({ hora } = {}) {
    const horaConsulta = hora ?? new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    if (!HORA.test(horaConsulta)) throw new ErrorDeDominio('La hora debe tener formato HH:MM');
    return this.medicamentoRepository.listarRecordatorios(horaConsulta);
  }
}
__FIN_ARCHIVO__
cat > "backend/src/application/use-cases/RegistrarMedicion.js" << '__FIN_ARCHIVO__'
import { Medicion } from '../../domain/Medicion.js';
import { NoEncontrado } from '../../domain/errors.js';

export class RegistrarMedicion {
  constructor({ pacienteRepository, medicionRepository, alertaRepository, evaluadorDeAlertas, publicadorDeEventos }) {
    Object.assign(this, { pacienteRepository, medicionRepository, alertaRepository, evaluadorDeAlertas, publicadorDeEventos });
  }

  async ejecutar(datos) {
    const paciente = await this.pacienteRepository.buscarPorId(datos.idPaciente);
    if (!paciente) throw new NoEncontrado('Paciente no encontrado');

    const medicion = await this.medicionRepository.guardar(new Medicion(datos));

    // Flujo: Registro de medición → análisis de condición → ¿requiere alerta?
    const resultado = await this.evaluadorDeAlertas.evaluar(medicion);
    let alerta = null;
    if (resultado) {
      alerta = await this.alertaRepository.guardar({
        idPaciente: medicion.idPaciente, idMedicion: medicion.id,
        tipo: resultado.tipo, motivo: resultado.motivo,
      });
    }

    // Aviso a n8n (Node-RED/n8n se encargan de Telegram y demás automatizaciones)
    await this.publicadorDeEventos.publicar({
      tipo: 'medicion.registrada',
      fecha: new Date().toISOString(),
      paciente: { id: paciente.id, nombre: paciente.nombre, telegramChatId: paciente.telegramChatId },
      medicion,
      alerta,
    });
    return { medicion, alerta };
  }
}
__FIN_ARCHIVO__
cat > "backend/src/application/use-cases/RegistrarNotificacion.js" << '__FIN_ARCHIVO__'
import { ErrorDeDominio, NoEncontrado } from '../../domain/errors.js';

const TIPOS = ['recordatorio', 'alerta', 'confirmacion'];
const ESTADOS = ['pendiente', 'enviado', 'fallido'];

export class RegistrarNotificacion {
  constructor({ pacienteRepository, notificacionRepository }) {
    Object.assign(this, { pacienteRepository, notificacionRepository });
  }

  async ejecutar({ idPaciente, idAlerta, idHorario, tipo, canal = 'telegram', mensaje, estadoEnvio = 'enviado' }) {
    if (!TIPOS.includes(tipo)) throw new ErrorDeDominio(`Tipo de notificación no válido: ${tipo}`);
    if (!ESTADOS.includes(estadoEnvio)) throw new ErrorDeDominio(`Estado de envío no válido: ${estadoEnvio}`);
    if (!mensaje?.trim()) throw new ErrorDeDominio('El mensaje es obligatorio');
    if (!(await this.pacienteRepository.buscarPorId(idPaciente))) throw new NoEncontrado('Paciente no encontrado');
    return this.notificacionRepository.guardar({ idPaciente, idAlerta, idHorario, tipo, canal, mensaje, estadoEnvio });
  }
}
__FIN_ARCHIVO__
cat > "backend/src/config/container.js" << '__FIN_ARCHIVO__'
// Raíz de composición: único lugar donde se conectan casos de uso con adaptadores.
import { RegistrarPaciente } from '../application/use-cases/RegistrarPaciente.js';
import { RegistrarMedicion } from '../application/use-cases/RegistrarMedicion.js';
import { ConsultarHistorial } from '../application/use-cases/ConsultarHistorial.js';
import { RegistrarMedicamento } from '../application/use-cases/RegistrarMedicamento.js';
import { ConsultarMedicamentos } from '../application/use-cases/ConsultarMedicamentos.js';
import { ObtenerRecordatorios } from '../application/use-cases/ObtenerRecordatorios.js';
import { RegistrarNotificacion } from '../application/use-cases/RegistrarNotificacion.js';
import { PublicadorNulo } from '../infrastructure/eventos/PublicadorNulo.js';
import { BcryptPasswordHasher } from '../infrastructure/security/BcryptPasswordHasher.js';
import { EvaluadorDeAlertasPendiente } from '../infrastructure/alertas/EvaluadorDeAlertasPendiente.js';

/** `puertos` permite sustituir adaptadores (p. ej. en memoria para pruebas). */
export function construirCasosDeUso(puertos) {
  const {
    pacienteRepository, medicionRepository, medicamentoRepository, alertaRepository, notificacionRepository,
    publicadorDeEventos = new PublicadorNulo(),
    passwordHasher = new BcryptPasswordHasher(),
    evaluadorDeAlertas = new EvaluadorDeAlertasPendiente(),
  } = puertos;

  return {
    registrarPaciente: new RegistrarPaciente({ pacienteRepository, passwordHasher }),
    registrarMedicion: new RegistrarMedicion({
      pacienteRepository, medicionRepository, alertaRepository, evaluadorDeAlertas, publicadorDeEventos,
    }),
    consultarHistorial: new ConsultarHistorial({ pacienteRepository, medicionRepository }),
    registrarMedicamento: new RegistrarMedicamento({ pacienteRepository, medicamentoRepository }),
    consultarMedicamentos: new ConsultarMedicamentos({ pacienteRepository, medicamentoRepository }),
    obtenerRecordatorios: new ObtenerRecordatorios({ medicamentoRepository }),
    registrarNotificacion: new RegistrarNotificacion({ pacienteRepository, notificacionRepository }),
  };
}

export async function construirConPostgres() {
  const { Database } = await import('../infrastructure/persistence/postgres/Database.js');
  const { PgPacienteRepository } = await import('../infrastructure/persistence/postgres/PgPacienteRepository.js');
  const { PgMedicionRepository } = await import('../infrastructure/persistence/postgres/PgMedicionRepository.js');
  const { PgMedicamentoRepository } = await import('../infrastructure/persistence/postgres/PgMedicamentoRepository.js');
  const { PgAlertaRepository } = await import('../infrastructure/persistence/postgres/PgAlertaRepository.js');
  const { PgNotificacionRepository } = await import('../infrastructure/persistence/postgres/PgNotificacionRepository.js');
  const { N8nWebhookPublicador } = await import('../infrastructure/eventos/N8nWebhookPublicador.js');

  const db = Database.getInstance();
  return {
    db,
    casosDeUso: construirCasosDeUso({
      pacienteRepository: new PgPacienteRepository(db),
      medicionRepository: new PgMedicionRepository(db),
      medicamentoRepository: new PgMedicamentoRepository(db),
      alertaRepository: new PgAlertaRepository(db),
      notificacionRepository: new PgNotificacionRepository(db),
      // Si N8N_WEBHOOK_URL no está definida, no se envían eventos
      publicadorDeEventos: process.env.N8N_WEBHOOK_URL
        ? new N8nWebhookPublicador({ url: process.env.N8N_WEBHOOK_URL, apiKey: process.env.N8N_API_KEY })
        : new PublicadorNulo(),
    }),
  };
}
__FIN_ARCHIVO__
cat > "backend/src/infrastructure/eventos/N8nWebhookPublicador.js" << '__FIN_ARCHIVO__'
import { PublicadorDeEventos } from '../../application/ports/PublicadorDeEventos.js';

/** Envía eventos a un webhook de n8n. Nunca lanza error: si n8n no responde, la API sigue funcionando. */
export class N8nWebhookPublicador extends PublicadorDeEventos {
  constructor({ url, apiKey = null, tiempoMaxMs = 3000 }) {
    super();
    Object.assign(this, { url, apiKey, tiempoMaxMs });
  }

  async publicar(evento) {
    try {
      const respuesta = await fetch(this.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(this.apiKey && { 'x-api-key': this.apiKey }) },
        body: JSON.stringify(evento),
        signal: AbortSignal.timeout(this.tiempoMaxMs),
      });
      if (!respuesta.ok) console.warn(`n8n respondió ${respuesta.status} al evento ${evento.tipo}`);
    } catch (error) {
      console.warn(`No se pudo avisar a n8n (${evento.tipo}): ${error.message}`);
    }
  }
}
__FIN_ARCHIVO__
cat > "backend/src/infrastructure/eventos/PublicadorNulo.js" << '__FIN_ARCHIVO__'
import { PublicadorDeEventos } from '../../application/ports/PublicadorDeEventos.js';

export class PublicadorNulo extends PublicadorDeEventos {
  async publicar() {}
}
__FIN_ARCHIVO__
cat > "backend/src/infrastructure/http/crearApp.js" << '__FIN_ARCHIVO__'
import express from 'express';
import cors from 'cors';
import { ErrorDeDominio, NoEncontrado, Conflicto } from '../../domain/errors.js';

const asincrono = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const idDe = (valor) => {
  const id = Number(valor);
  if (!Number.isInteger(id) || id <= 0) throw new ErrorDeDominio('El identificador del paciente no es válido');
  return id;
};

/** Adaptador de entrada HTTP: traduce peticiones a casos de uso. */
export function crearApp({ casosDeUso, apiKeyAutomatizacion = null }) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/', (_req, res) => res.json({
    servicio: 'API de seguimiento para pacientes con enfermedades crónicas',
    estado: 'ok',
    rutas: ['GET /api/salud', 'POST /api/pacientes', '/api/pacientes/:id/mediciones',
      '/api/pacientes/:id/medicamentos', '/api/automatizacion/* (n8n, requiere x-api-key)'],
  }));
  app.get('/api/salud', (_req, res) => res.json({ estado: 'ok' }));

  // Rutas exclusivas para n8n, protegidas con x-api-key
  const soloAutomatizacion = (req, res, next) => {
    if (!apiKeyAutomatizacion) return res.status(503).json({ error: 'N8N_API_KEY no está configurada en el servidor' });
    if (req.get('x-api-key') !== apiKeyAutomatizacion) return res.status(401).json({ error: 'API key inválida' });
    return next();
  };

  app.get('/api/automatizacion/recordatorios', soloAutomatizacion, asincrono(async (req, res) => {
    res.json(await casosDeUso.obtenerRecordatorios.ejecutar({ hora: req.query.hora }));
  }));

  app.post('/api/automatizacion/notificaciones', soloAutomatizacion, asincrono(async (req, res) => {
    res.status(201).json(await casosDeUso.registrarNotificacion.ejecutar(req.body));
  }));

  app.post('/api/pacientes', asincrono(async (req, res) => {
    const paciente = await casosDeUso.registrarPaciente.ejecutar(req.body);
    res.status(201).json(paciente);
  }));

  app.post('/api/pacientes/:idPaciente/mediciones', asincrono(async (req, res) => {
    const resultado = await casosDeUso.registrarMedicion.ejecutar({
      ...req.body, idPaciente: idDe(req.params.idPaciente),
    });
    res.status(201).json(resultado);
  }));

  app.get('/api/pacientes/:idPaciente/mediciones', asincrono(async (req, res) => {
    const { tipo, desde, hasta } = req.query;
    const historial = await casosDeUso.consultarHistorial.ejecutar({
      idPaciente: idDe(req.params.idPaciente), tipo, desde, hasta,
    });
    res.json(historial);
  }));

  app.post('/api/pacientes/:idPaciente/medicamentos', asincrono(async (req, res) => {
    const medicamento = await casosDeUso.registrarMedicamento.ejecutar({
      ...req.body, idPaciente: idDe(req.params.idPaciente),
    });
    res.status(201).json(medicamento);
  }));

  app.get('/api/pacientes/:idPaciente/medicamentos', asincrono(async (req, res) => {
    res.json(await casosDeUso.consultarMedicamentos.ejecutar({ idPaciente: idDe(req.params.idPaciente) }));
  }));

  // Manejo central de errores
  // eslint-disable-next-line no-unused-vars
  app.use((error, _req, res, _next) => {
    if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON no válido' });
    if (error instanceof NoEncontrado) return res.status(404).json({ error: error.message });
    if (error instanceof Conflicto) return res.status(409).json({ error: error.message });
    if (error instanceof ErrorDeDominio) return res.status(400).json({ error: error.message });
    console.error(error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  });

  return app;
}
__FIN_ARCHIVO__
cat > "backend/src/infrastructure/persistence/memory/repositoriosEnMemoria.js" << '__FIN_ARCHIVO__'
import { PacienteRepository } from '../../../application/ports/PacienteRepository.js';
import { MedicionRepository } from '../../../application/ports/MedicionRepository.js';
import { MedicamentoRepository } from '../../../application/ports/MedicamentoRepository.js';
import { AlertaRepository } from '../../../application/ports/AlertaRepository.js';
import { NotificacionRepository } from '../../../application/ports/NotificacionRepository.js';
import { PublicadorDeEventos } from '../../../application/ports/PublicadorDeEventos.js';

export class PacienteEnMemoria extends PacienteRepository {
  constructor() { super(); this.pacientes = []; this.correos = new Set(); }
  async registrar(usuario, paciente) {
    this.correos.add(usuario.correo);
    paciente.id = this.pacientes.length + 1;
    paciente.idUsuario = paciente.id;
    this.pacientes.push(paciente);
    return paciente;
  }
  async buscarPorId(id) { return this.pacientes.find((p) => p.id === Number(id)) ?? null; }
  async existeCorreo(correo) { return this.correos.has(correo); }
}

export class MedicionEnMemoria extends MedicionRepository {
  constructor() { super(); this.items = []; }
  async guardar(m) { m.id = this.items.length + 1; this.items.push(m); return m; }
  async listarPorPaciente(idPaciente, { tipo, desde, hasta } = {}) {
    return this.items
      .filter((m) => m.idPaciente === Number(idPaciente))
      .filter((m) => !tipo || m.tipo === tipo)
      .filter((m) => !desde || m.fechaHora >= new Date(desde))
      .filter((m) => !hasta || m.fechaHora <= new Date(hasta))
      .sort((a, b) => b.fechaHora - a.fechaHora);
  }
}

export class MedicamentoEnMemoria extends MedicamentoRepository {
  constructor(pacienteRepository = null) { super(); this.items = []; this.pacienteRepository = pacienteRepository; }
  async guardar(m) { m.id = this.items.length + 1; this.items.push(m); return m; }
  async listarPorPaciente(idPaciente) { return this.items.filter((m) => m.idPaciente === Number(idPaciente)); }
  async listarRecordatorios(hora) {
    const resultado = [];
    for (const m of this.items.filter((x) => x.horarios.includes(hora))) {
      const p = await this.pacienteRepository?.buscarPorId(m.idPaciente);
      if (p?.telegramChatId) {
        resultado.push({
          idHorario: null, hora, idMedicamento: m.id, medicamento: m.nombre, dosis: m.dosis,
          idPaciente: p.id, paciente: p.nombre, telegramChatId: p.telegramChatId,
        });
      }
    }
    return resultado;
  }
}

export class NotificacionEnMemoria extends NotificacionRepository {
  constructor() { super(); this.items = []; }
  async guardar(n) { const nueva = { id: this.items.length + 1, ...n }; this.items.push(nueva); return nueva; }
}

export class PublicadorEnMemoria extends PublicadorDeEventos {
  constructor() { super(); this.eventos = []; }
  async publicar(e) { this.eventos.push(e); }
}

export class AlertaEnMemoria extends AlertaRepository {
  constructor() { super(); this.items = []; }
  async guardar(a) { const alerta = { id: this.items.length + 1, estado: 'generada', ...a }; this.items.push(alerta); return alerta; }
}
__FIN_ARCHIVO__
cat > "backend/src/infrastructure/persistence/postgres/PgMedicamentoRepository.js" << '__FIN_ARCHIVO__'
import { MedicamentoRepository } from '../../../application/ports/MedicamentoRepository.js';
import { Medicamento } from '../../../domain/Medicamento.js';

const aMedicamento = (r) => new Medicamento({
  id: r.id_medicamento, idPaciente: r.id_paciente, nombre: r.nombre, dosis: r.dosis,
  frecuencia: r.frecuencia, fechaInicio: r.fecha_inicio, fechaFin: r.fecha_fin,
  observaciones: r.observaciones, horarios: (r.horarios ?? []).map((h) => h.slice(0, 5)),
});

export class PgMedicamentoRepository extends MedicamentoRepository {
  constructor(db) { super(); this.db = db; }

  async guardar(med) {
    return this.db.transaccion(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO medicamento
           (id_paciente, nombre, dosis, frecuencia, fecha_inicio, fecha_fin, observaciones)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [med.idPaciente, med.nombre, med.dosis, med.frecuencia, med.fechaInicio, med.fechaFin, med.observaciones],
      );
      const fila = rows[0];
      for (const hora of med.horarios) {
        await client.query(
          'INSERT INTO horario_medicamento (id_medicamento, hora) VALUES ($1, $2)',
          [fila.id_medicamento, hora],
        );
      }
      return aMedicamento({ ...fila, horarios: med.horarios });
    });
  }

  async listarPorPaciente(idPaciente) {
    const { rows } = await this.db.query(
      `SELECT m.*, COALESCE(array_agg(h.hora::text ORDER BY h.hora) FILTER (WHERE h.id_horario IS NOT NULL), '{}') AS horarios
         FROM medicamento m
         LEFT JOIN horario_medicamento h ON h.id_medicamento = m.id_medicamento
        WHERE m.id_paciente = $1
        GROUP BY m.id_medicamento
        ORDER BY m.fecha_inicio DESC`,
      [idPaciente],
    );
    return rows.map(aMedicamento);
  }

  async listarRecordatorios(hora) {
    const { rows } = await this.db.query(
      `SELECT h.id_horario, to_char(h.hora, 'HH24:MI') AS hora,
              m.id_medicamento, m.nombre AS medicamento, m.dosis,
              p.id_paciente, p.nombre AS paciente, p.telegram_chat_id
         FROM horario_medicamento h
         JOIN medicamento m ON m.id_medicamento = h.id_medicamento
         JOIN paciente p ON p.id_paciente = m.id_paciente
        WHERE h.activo AND m.activo
          AND to_char(h.hora, 'HH24:MI') = $1
          AND m.fecha_inicio <= CURRENT_DATE
          AND (m.fecha_fin IS NULL OR m.fecha_fin >= CURRENT_DATE)
          AND p.telegram_chat_id IS NOT NULL`,
      [hora],
    );
    return rows.map((r) => ({
      idHorario: r.id_horario, hora: r.hora, idMedicamento: r.id_medicamento,
      medicamento: r.medicamento, dosis: r.dosis, idPaciente: r.id_paciente,
      paciente: r.paciente, telegramChatId: r.telegram_chat_id,
    }));
  }
}
__FIN_ARCHIVO__
cat > "backend/src/infrastructure/persistence/postgres/PgNotificacionRepository.js" << '__FIN_ARCHIVO__'
import { NotificacionRepository } from '../../../application/ports/NotificacionRepository.js';

export class PgNotificacionRepository extends NotificacionRepository {
  constructor(db) { super(); this.db = db; }

  async guardar(n) {
    const { rows } = await this.db.query(
      `INSERT INTO notificacion
         (id_paciente, id_alerta, id_horario, tipo, canal, mensaje, estado_envio, fecha_envio)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [n.idPaciente, n.idAlerta ?? null, n.idHorario ?? null, n.tipo, n.canal, n.mensaje, n.estadoEnvio,
        n.estadoEnvio === 'enviado' ? new Date() : null],
    );
    const r = rows[0];
    return {
      id: r.id_notificacion, idPaciente: r.id_paciente, tipo: r.tipo, canal: r.canal,
      mensaje: r.mensaje, estadoEnvio: r.estado_envio, fechaEnvio: r.fecha_envio,
    };
  }
}
__FIN_ARCHIVO__
cat > "backend/src/server.js" << '__FIN_ARCHIVO__'
import 'dotenv/config';
import { construirConPostgres } from './config/container.js';
import { crearApp } from './infrastructure/http/crearApp.js';

const { db, casosDeUso } = await construirConPostgres();
console.log('PostgreSQL conectado:', await db.probarConexion());

const puerto = Number(process.env.PORT) || 3000;
const servidor = crearApp({ casosDeUso, apiKeyAutomatizacion: process.env.N8N_API_KEY }).listen(puerto, () => {
  console.log(`API escuchando en http://localhost:${puerto}`);
});

const apagar = async () => {
  servidor.close();
  await db.cerrar();
  process.exit(0);
};
process.on('SIGINT', apagar);
process.on('SIGTERM', apagar);
__FIN_ARCHIVO__
cat > "backend/tests/n8n.test.js" << '__FIN_ARCHIVO__'
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { construirCasosDeUso } from '../src/config/container.js';
import { crearApp } from '../src/infrastructure/http/crearApp.js';
import {
  PacienteEnMemoria, MedicionEnMemoria, MedicamentoEnMemoria, AlertaEnMemoria,
  NotificacionEnMemoria, PublicadorEnMemoria,
} from '../src/infrastructure/persistence/memory/repositoriosEnMemoria.js';

let servidor; let base; let publicador;
before(() => {
  const pacienteRepository = new PacienteEnMemoria();
  publicador = new PublicadorEnMemoria();
  const casosDeUso = construirCasosDeUso({
    pacienteRepository,
    medicionRepository: new MedicionEnMemoria(),
    medicamentoRepository: new MedicamentoEnMemoria(pacienteRepository),
    alertaRepository: new AlertaEnMemoria(),
    notificacionRepository: new NotificacionEnMemoria(),
    publicadorDeEventos: publicador,
  });
  servidor = crearApp({ casosDeUso, apiKeyAutomatizacion: 'clave-test' }).listen(0);
  base = `http://localhost:${servidor.address().port}`;
});
after(() => servidor.close());

const json = (cuerpo, extra = {}) => ({
  method: 'POST', headers: { 'content-type': 'application/json', ...extra }, body: JSON.stringify(cuerpo),
});

test('la ruta raíz responde (ya no sale "Cannot GET /")', async () => {
  const r = await fetch(base + '/');
  assert.equal(r.status, 200);
  assert.equal((await r.json()).estado, 'ok');
});

test('registrar una medición publica el evento para n8n', async () => {
  const p = await (await fetch(`${base}/api/pacientes`, json({
    correo: 'n8n@correo.com', contrasena: 'secreta123', nombre: 'Rosa', apellidoPaterno: 'Díaz',
    fechaNacimiento: '1970-01-01', telegramChatId: '12345',
  }))).json();
  await fetch(`${base}/api/pacientes/${p.id}/mediciones`, json({ tipo: 'glucosa', glucosaMgDl: 99 }));
  assert.equal(publicador.eventos.length, 1);
  assert.equal(publicador.eventos[0].tipo, 'medicion.registrada');
  assert.equal(publicador.eventos[0].paciente.telegramChatId, '12345');

  await fetch(`${base}/api/pacientes/${p.id}/medicamentos`, json({
    nombre: 'Losartán', dosis: '50 mg', frecuencia: 'diaria', fechaInicio: '2026-01-01', horarios: ['09:30'],
  }));
  const cabecera = { 'x-api-key': 'clave-test' };
  const recordatorios = await (await fetch(`${base}/api/automatizacion/recordatorios?hora=09:30`, { headers: cabecera })).json();
  assert.equal(recordatorios.length, 1);
  assert.equal(recordatorios[0].telegramChatId, '12345');
  assert.equal((await (await fetch(`${base}/api/automatizacion/recordatorios?hora=10:00`, { headers: cabecera })).json()).length, 0);

  const n = await fetch(`${base}/api/automatizacion/notificaciones`, json({
    idPaciente: p.id, tipo: 'recordatorio', mensaje: 'Toma Losartán 50 mg',
  }, cabecera));
  assert.equal(n.status, 201);
});

test('las rutas de automatización exigen la API key', async () => {
  assert.equal((await fetch(`${base}/api/automatizacion/recordatorios?hora=09:30`)).status, 401);
  assert.equal((await fetch(`${base}/api/automatizacion/recordatorios?hora=99:99`, { headers: { 'x-api-key': 'clave-test' } })).status, 400);
});
__FIN_ARCHIVO__
cd backend
touch .env
grep -q '^N8N_API_KEY=' .env || printf '\nN8N_API_KEY=cambia-esta-clave\nN8N_WEBHOOK_URL=http://localhost:5678/webhook/medicion-registrada\n' >> .env
npm test
echo ""
echo "Integración con n8n agregada. Importa los workflows de backend/n8n/ en n8n y reinicia: npm run dev"
