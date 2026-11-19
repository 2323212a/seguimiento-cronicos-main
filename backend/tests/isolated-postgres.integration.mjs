import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const image = 'postgres:18';
const containerName = `codex-integration-${process.pid}`;
const password = 'fixture-only-not-a-secret';
const runDocker = (args) => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const imageId = runDocker(['image', 'inspect', image, '--format', '{{.Id}}']);
let containerStarted = false;
let db;
let server;

try {
  const containerId = runDocker(['run', '--rm', '-d', '--name', containerName,
    '--tmpfs', '/var/lib/postgresql:rw,size=512m', '-e', `POSTGRES_PASSWORD=${password}`,
    '-p', '127.0.0.1::5432', image]);
  containerStarted = true;

  // Verify identity, image, loopback-only mapping, and volatile storage before connecting or writing.
  const inspect = JSON.parse(runDocker(['inspect', containerId]))[0];
  assert.equal(inspect.Id, containerId);
  assert.equal(inspect.Name, `/${containerName}`);
  assert.equal(inspect.Config.Image, image);
  assert.equal(inspect.Image, imageId);
  assert.equal(inspect.State.Running, true);
  const binding = inspect.NetworkSettings.Ports['5432/tcp']?.[0];
  assert.ok(binding && ['127.0.0.1', '::1'].includes(binding.HostIp), 'Postgres debe quedar enlazado sólo a loopback');
  assert.equal(inspect.Mounts.length, 0, 'Se prohíben volúmenes persistentes');
  assert.ok(inspect.HostConfig.Tmpfs?.['/var/lib/postgresql'], 'PostgreSQL debe usar el tmpfs validado');
  const port = Number(binding.HostPort);
  assert.ok(Number.isInteger(port) && port > 0);

  let admin;
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      admin = new pg.Client({ host: '127.0.0.1', port, database: 'postgres', user: 'postgres', password,
        connectionTimeoutMillis: 1500, application_name: containerName });
      await admin.connect();
      break;
    } catch (error) {
      await admin?.end().catch(() => {});
      admin = null;
      if (attempt === 39) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  const identity = await admin.query(`select current_database() db,inet_server_port() port,version() version`);
  assert.equal(identity.rows[0].db, 'postgres');
  assert.equal(Number(identity.rows[0].port), 5432);
  assert.match(identity.rows[0].version, /^PostgreSQL 18\./);
  const publicTables = await admin.query(`select count(*)::int n from information_schema.tables
    where table_schema='public' and table_type='BASE TABLE'`);
  assert.equal(publicTables.rows[0].n, 0, 'La base inicial del contenedor debe estar vacía');

  // First database mutation occurs only after all destination checks above.
  const dbName = `fixture_${process.pid}`;
  await admin.query(`CREATE DATABASE ${dbName}`);
  await admin.end();

  const root = new URL('.', import.meta.url);
  const read = (path) => readFile(new URL(path, root), 'utf8');
  const target = new pg.Client({ host: '127.0.0.1', port, database: dbName, user: 'postgres', password,
    connectionTimeoutMillis: 5000, application_name: containerName });
  await target.connect();
  const current = await target.query('select current_database() db');
  assert.equal(current.rows[0].db, dbName);
  const allSchema = await read('sql/schema.sql');
  const cutAt = allSchema.indexOf('-- Estructura incorporada desde la migración 007');
  assert.ok(cutAt > 0, 'No se encontró el límite del esquema base conocido');
  await target.query(`${allSchema.slice(0, cutAt)}\nCOMMIT;`);
  for (const file of ['004_catalogo_editorial.up.sql', '005_objetivos_y_alertas_individuales.up.sql',
    '006_validacion_y_criterios_seguridad.up.sql', '007_diagnosticos_hba1c_y_gobernanza_seguridad.up.sql']) {
    await target.query(await read(`migrations/${file}`));
  }
  const migrationCheck = await target.query(`select count(*)::int tables,
      (select count(*) from information_schema.columns where table_schema='public' and table_name='medicion' and column_name='hba1c_percent') hba1c,
      to_regclass('public.uq_objetivo_medicion_vigente') objective_index
    from information_schema.tables where table_schema='public' and table_type='BASE TABLE'`);
  assert.equal(migrationCheck.rows[0].tables, 32);
  assert.equal(migrationCheck.rows[0].hba1c, '1');
  assert.equal(migrationCheck.rows[0].objective_index, 'uq_objetivo_medicion_vigente');
  await target.end();

  Object.assign(process.env, { DB_HOST: '127.0.0.1', DB_PORT: String(port), DB_NAME: dbName,
    DB_USER: 'postgres', DB_PASSWORD: password, JWT_SECRET: 'isolated-fixture-secret-32-characters-minimum',
    OUTBOX_WORKER_ACTIVO: 'false', ALERTAS_BACKEND_ACTIVAS: 'false', NODE_ENV: 'test' });
  const { Database } = await import('./src/infrastructure/persistence/postgres/Database.js');
  const { PgPacienteRepository } = await import('./src/infrastructure/persistence/postgres/PgPacienteRepository.js');
  const { PgMedicionRepository } = await import('./src/infrastructure/persistence/postgres/PgMedicionRepository.js');
  const { PgAlertaRepository } = await import('./src/infrastructure/persistence/postgres/PgAlertaRepository.js');
  const { PgUsuarioRepository } = await import('./src/infrastructure/persistence/postgres/PgUsuarioRepository.js');
  const { PgAsignacionRepository } = await import('./src/infrastructure/persistence/postgres/PgAsignacionRepository.js');
  const { PgSeguimientoRepository } = await import('./src/infrastructure/persistence/postgres/PgSeguimientoRepository.js');
  const { PgObjetivoMedicionRepository } = await import('./src/infrastructure/persistence/postgres/PgObjetivoMedicionRepository.js');
  const { PgCriterioSeguridadRepository } = await import('./src/infrastructure/persistence/postgres/PgCriterioSeguridadRepository.js');
  const { PgOutboxRepository } = await import('./src/infrastructure/persistence/postgres/PgOutboxRepository.js');
  const { PgEventoRecibidoRepository } = await import('./src/infrastructure/persistence/postgres/PgEventoRecibidoRepository.js');
  const { EvaluadorObjetivoIndividual } = await import('./src/infrastructure/alertas/EvaluadorObjetivoIndividual.js');
  const { EvaluadorSeguridadAprobada } = await import('./src/infrastructure/alertas/EvaluadorSeguridadAprobada.js');
  const { EvaluadorMedicion } = await import('./src/infrastructure/alertas/EvaluadorMedicion.js');
  const { RegistrarMedicion } = await import('./src/application/use-cases/RegistrarMedicion.js');
  const { GestionarObjetivosMedicion } = await import('./src/application/use-cases/GestionarObjetivosMedicion.js');
  const { ConsultarHistorial } = await import('./src/application/use-cases/ConsultarHistorial.js');
  const { crearApp } = await import('./src/infrastructure/http/crearApp.js');
  const { Jwt } = await import('./src/infrastructure/security/Jwt.js');

  db = Database.getInstance();
  const repos = { patient: new PgPacienteRepository(db), measurement: new PgMedicionRepository(db),
    alert: new PgAlertaRepository(db), users: new PgUsuarioRepository(db), assignments: new PgAsignacionRepository(db),
    followup: new PgSeguimientoRepository(db), objectives: new PgObjetivoMedicionRepository(db),
    criteria: new PgCriterioSeguridadRepository(db), outbox: new PgOutboxRepository(db),
    receiver: new PgEventoRecibidoRepository(db) };
  const security = new EvaluadorSeguridadAprobada({ criterioSeguridadRepository: repos.criteria });
  const objectiveEval = new EvaluadorObjetivoIndividual({ objetivoMedicionRepository: repos.objectives });
  const evaluator = new EvaluadorMedicion({ seguridad: security, objetivoIndividual: objectiveEval });
  const objectives = new GestionarObjetivosMedicion({ objetivoMedicionRepository: repos.objectives });

  const insertUser = async (email, role) => (await db.query(`insert into usuario(correo,contrasena_hash,rol,activo)
    values($1,'fixture-only',$2,true) returning id_usuario`, [email, role])).rows[0].id_usuario;
  const adminUser = await insertUser('admin@example.invalid', 'administrador');
  const patientUser = await insertUser('patient@example.invalid', 'paciente');
  const otherPatientUser = await insertUser('other-patient@example.invalid', 'paciente');
  const doctorUser = await insertUser('doctor@example.invalid', 'medico');
  const unassignedDoctor = await insertUser('unassigned-doctor@example.invalid', 'medico');
  const followupUser = await insertUser('followup@example.invalid', 'seguimiento');
  const addPatient = async (userId, name) => (await db.query(`insert into paciente
    (id_usuario,nombre,apellido_paterno,fecha_nacimiento) values($1,$2,'Fixture','1980-01-01') returning id_paciente`,
    [userId, name])).rows[0].id_paciente;
  const patientId = await addPatient(patientUser, 'Paciente de prueba');
  const otherPatientId = await addPatient(otherPatientUser, 'Paciente sin asignación');
  await db.query('insert into medico_paciente(id_medico,id_paciente,id_usuario_asignador) values($1,$2,$3)', [doctorUser, patientId, adminUser]);
  await db.query('insert into seguimiento_paciente(id_seguimiento,id_paciente,id_usuario_asignador) values($1,$2,$3)', [followupUser, patientId, adminUser]);

  const now = new Date().toISOString();
  const makeRegistration = (enabled) => new RegistrarMedicion({ pacienteRepository: repos.patient,
    medicionRepository: repos.measurement, evaluadorDeAlertas: evaluator, alertasBackendActivas: enabled });
  assert.equal(process.env.OUTBOX_WORKER_ACTIVO, 'false');
  const disabledRegistration = makeRegistration(process.env.ALERTAS_BACKEND_ACTIVAS === 'true');
  const disabled = await disabledRegistration.ejecutar({ idPaciente: patientId, tipo: 'glucosa', glucosaMgDl: 120,
    unidad: 'mg/dL', fechaHora: now }, patientUser);
  assert.equal(disabled.alertas.length, 0);
  assert.equal((await db.query('select count(*)::int n from outbox_evento')).rows[0].n, 0);

  await objectives.crear({ idPaciente: patientId, tipoMedicion: 'glucosa', glucosaMin: 80, glucosaMax: 130,
    indicacionPaciente: 'Texto ficticio de prueba; no es una recomendación.', vigenteDesde: now.slice(0, 10) }, doctorUser);
  await assert.rejects(() => objectives.crear({ idPaciente: patientId, tipoMedicion: 'glucosa', glucosaMin: 80,
    indicacionPaciente: 'Fixture.', vigenteDesde: now.slice(0, 10) }, unassignedDoctor));
  assert.equal((await objectives.listar({ idPaciente: patientId, actorId: patientUser, rol: 'paciente' })).length, 1);
  assert.equal((await objectives.listar({ idPaciente: patientId, actorId: doctorUser, rol: 'medico' })).length, 1);
  assert.equal((await objectives.listar({ idPaciente: patientId, actorId: followupUser, rol: 'seguimiento' })).length, 0);

  const registration = makeRegistration(true);
  const inRange = await registration.ejecutar({ idPaciente: patientId, tipo: 'glucosa', glucosaMgDl: 100,
    unidad: 'mg/dL', fechaHora: now }, patientUser);
  const outside = await registration.ejecutar({ idPaciente: patientId, tipo: 'glucosa', glucosaMgDl: 150,
    unidad: 'mg/dL', fechaHora: now }, patientUser);
  assert.equal(inRange.alertas.length, 0);
  assert.equal(outside.alertas.length, 1);
  assert.equal(outside.alertas[0].tipo, 'fuera_objetivo_individual');
  const duplicate = await db.query(`insert into alerta(id_paciente,id_medicion,tipo,motivo,id_objetivo,clasificacion,indicacion_paciente)
    select id_paciente,id_medicion,tipo,motivo,id_objetivo,clasificacion,indicacion_paciente from alerta where id_alerta=$1
    on conflict (id_medicion,id_objetivo) where id_medicion is not null and id_objetivo is not null do nothing returning id_alerta`,
    [outside.alertas[0].id]);
  assert.equal(duplicate.rowCount, 0);
  assert.equal((await registration.ejecutar({ idPaciente: otherPatientId, tipo: 'glucosa', glucosaMgDl: 150,
    unidad: 'mg/dL', fechaHora: now }, otherPatientUser)).alertas.length, 0);

  const hba = await registration.ejecutar({ idPaciente: patientId, tipo: 'hba1c', hba1cPercent: 6.45,
    unidad: '%', fechaHora: now }, patientUser);
  assert.equal(hba.alertas.length, 0);
  assert.equal((await db.query(`select hba1c_percent from medicion where id_medicion=$1`, [hba.medicion.id])).rows[0].hba1c_percent, '6.45');
  const criteriaCount = await db.query(`select count(*)::int n from version_criterio_seguridad where estado='activa'`);
  assert.equal(criteriaCount.rows[0].n, 0);
  const outboxCount = await db.query('select count(*)::int n from outbox_evento');
  assert.equal(outboxCount.rows[0].n, 1);
  const outboxEvent = await repos.outbox.reclamar({ maxIntentos: 8, leaseSegundos: 60 });
  assert.ok(outboxEvent?.eventId);
  assert.equal(outboxEvent.plantilla, 'actualizacion_disponible');
  const firstClaim = await repos.receiver.reclamar(outboxEvent.eventId, 60);
  const secondClaim = await repos.receiver.reclamar(outboxEvent.eventId, 60);
  assert.equal(firstClaim.procesar, true);
  assert.equal(secondClaim.procesar, false);
  assert.equal(await repos.receiver.completar(outboxEvent.eventId), true);
  assert.equal((await repos.receiver.reclamar(outboxEvent.eventId, 60)).procesar, false);
  await repos.outbox.reintentar(outboxEvent.id, outboxEvent.intentos, 'fallo ficticio', 8);
  await db.query(`update outbox_evento set disponible_at=now() where id_outbox=$1`, [outboxEvent.id]);
  const retry = await repos.outbox.reclamar({ maxIntentos: 2, leaseSegundos: 60 });
  assert.equal(retry.eventId, outboxEvent.eventId);
  await repos.outbox.reintentar(retry.id, retry.intentos, 'fallo ficticio final', 2);
  assert.equal((await db.query('select estado from outbox_evento where id_outbox=$1', [retry.id])).rows[0].estado, 'fallido');
  assert.equal((await db.query('select count(*)::int n from notificacion')).rows[0].n, 0);

  const history = new ConsultarHistorial({ pacienteRepository: repos.patient, medicionRepository: repos.measurement });
  const jwt = new Jwt({ secreto: process.env.JWT_SECRET });
  const app = crearApp({ casosDeUso: { gestionarObjetivosMedicion: objectives,
    registrarMedicion: registration, consultarHistorial: history }, jwt,
    usuarioRepository: repos.users, pacienteRepository: repos.patient, alertaRepository: repos.alert,
    asignacionRepository: repos.assignments, seguimientoRepository: repos.followup });
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const get = (path, id) => fetch(`${base}${path}`, { headers: { cookie: `sesion=${jwt.firmar({ sub: id })}` } });
  const patientAlerts = await (await get('/pacientes/me/alertas', patientUser)).json();
  const doctorAlerts = await (await get(`/medico/pacientes/${patientId}/alertas`, doctorUser)).json();
  const followupAlerts = await (await get(`/seguimiento/pacientes/${patientId}/alertas`, followupUser)).json();
  assert.ok(patientAlerts.some((x) => x.tipo === 'fuera_objetivo_individual' && x.medicion?.valor === 150));
  assert.ok(doctorAlerts.some((x) => x.tipo === 'fuera_objetivo_individual' && x.indicacionPaciente));
  assert.ok(followupAlerts.some((x) => x.tipo === 'actualizacion_disponible' && !x.medicion && !x.indicacionPaciente));
  assert.equal((await get(`/medico/pacientes/${otherPatientId}/alertas`, doctorUser)).status, 404);
  assert.equal((await get(`/seguimiento/pacientes/${patientId}/objetivos`, followupUser)).status, 404);
  const hbaHistory = await (await get('/pacientes/me/mediciones?tipo=hba1c', patientUser)).json();
  assert.equal(hbaHistory.length, 1);
  assert.equal(hbaHistory[0].hba1cPercent, 6.45);
  assert.equal((await get('/pacientes/me/alertas', adminUser)).status, 403);
  console.log('PASS: migraciones aisladas 004–007; objetivos/alertas/permisos; HbA1c persiste y se consulta sin evaluación clínica; Outbox lease/deduplicación/reintento sin notificación');
} finally {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (db) await db.cerrar();
  if (containerStarted) {
    try { runDocker(['stop', containerName]); } catch { try { runDocker(['rm', '-f', containerName]); } catch {} }
  }
}
