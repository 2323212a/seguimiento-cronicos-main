// Raíz de composición: único lugar donde se conectan casos de uso con adaptadores.
import { RegistrarPaciente } from '../application/use-cases/RegistrarPaciente.js';
import { RegistrarMedicion } from '../application/use-cases/RegistrarMedicion.js';
import { ConsultarHistorial } from '../application/use-cases/ConsultarHistorial.js';
import { RegistrarMedicamento } from '../application/use-cases/RegistrarMedicamento.js';
import { ConsultarMedicamentos } from '../application/use-cases/ConsultarMedicamentos.js';
import { ObtenerRecordatorios } from '../application/use-cases/ObtenerRecordatorios.js';
import { RegistrarNotificacion } from '../application/use-cases/RegistrarNotificacion.js';
import { IniciarSesion } from '../application/use-cases/IniciarSesion.js';
import { GestionEditorialCatalogo } from '../application/use-cases/GestionEditorialCatalogo.js';
import { PublicadorNulo } from '../infrastructure/eventos/PublicadorNulo.js';
import { BcryptPasswordHasher } from '../infrastructure/security/BcryptPasswordHasher.js';
import { EvaluadorObjetivoIndividual } from '../infrastructure/alertas/EvaluadorObjetivoIndividual.js';
import { PgObjetivoMedicionRepository } from '../infrastructure/persistence/postgres/PgObjetivoMedicionRepository.js';
import { GestionarObjetivosMedicion } from '../application/use-cases/GestionarObjetivosMedicion.js';
import { EvaluadorSeguridadAprobada } from '../infrastructure/alertas/EvaluadorSeguridadAprobada.js';
import { EvaluadorMedicion } from '../infrastructure/alertas/EvaluadorMedicion.js';
import { PgCriterioSeguridadRepository } from '../infrastructure/persistence/postgres/PgCriterioSeguridadRepository.js';
import { GestionarCriteriosSeguridad } from '../application/use-cases/GestionarCriteriosSeguridad.js';
import { PgGestionCriteriosSeguridadRepository } from '../infrastructure/persistence/postgres/PgGestionCriteriosSeguridadRepository.js';
import { GestionarDiagnosticos } from '../application/use-cases/GestionarDiagnosticos.js';
import { PgDiagnosticoRepository } from '../infrastructure/persistence/postgres/PgDiagnosticoRepository.js';
import { GestionarVinculoTelegram } from '../application/use-cases/GestionarVinculoTelegram.js';
import { ConsultarEstadoAlertasTelegram } from '../application/use-cases/ConsultarEstadoAlertasTelegram.js';
import { ConsultarDatosTelegram } from '../application/use-cases/ConsultarDatosTelegram.js';

/** `puertos` permite sustituir adaptadores (p. ej. en memoria para pruebas). */
export function construirCasosDeUso(puertos) {
  const {
    pacienteRepository, medicionRepository, medicamentoRepository, alertaRepository, notificacionRepository,
    usuarioRepository,
    catalogoEditorialRepository = null,
    publicadorDeEventos = new PublicadorNulo(),
    passwordHasher = new BcryptPasswordHasher(),
    evaluadorDeAlertas = null,
    objetivoMedicionRepository = null,
    criterioClinicoRepository = null,
    diagnosticoRepository = null,
    telegramVinculoRepository = null,
    alertasBackendActivas = false,
  } = puertos;

  return {
    passwordHasher,
    iniciarSesion: new IniciarSesion({ usuarioRepository, passwordHasher }),
    registrarPaciente: new RegistrarPaciente({ pacienteRepository, passwordHasher }),
    registrarMedicion: new RegistrarMedicion({ pacienteRepository, medicionRepository, evaluadorDeAlertas, alertasBackendActivas }),
    gestionarObjetivosMedicion: objetivoMedicionRepository ? new GestionarObjetivosMedicion({ objetivoMedicionRepository }) : null,
    gestionarCriteriosSeguridad: criterioClinicoRepository ? new GestionarCriteriosSeguridad({ repository: criterioClinicoRepository }) : null,
    gestionarDiagnosticos: diagnosticoRepository ? new GestionarDiagnosticos({ repository: diagnosticoRepository }) : null,
    gestionarVinculoTelegram: telegramVinculoRepository ? new GestionarVinculoTelegram({ repository: telegramVinculoRepository }) : null,
    consultarEstadoAlertasTelegram: new ConsultarEstadoAlertasTelegram({ pacienteRepository, alertaRepository }),
    consultarDatosTelegram: new ConsultarDatosTelegram({ pacienteRepository, medicionRepository, medicamentoRepository,
      alertaRepository, diagnosticoRepository, objetivoMedicionRepository }),
    consultarHistorial: new ConsultarHistorial({ pacienteRepository, medicionRepository }),
    registrarMedicamento: new RegistrarMedicamento({ pacienteRepository, medicamentoRepository }),
    consultarMedicamentos: new ConsultarMedicamentos({ pacienteRepository, medicamentoRepository }),
    obtenerRecordatorios: new ObtenerRecordatorios({ medicamentoRepository }),
    registrarNotificacion: new RegistrarNotificacion({ pacienteRepository, notificacionRepository }),
    gestionEditorialCatalogo: catalogoEditorialRepository ? new GestionEditorialCatalogo({ catalogoEditorialRepository }) : null,
  };
}

export async function construirConPostgres() {
  const { Database } = await import('../infrastructure/persistence/postgres/Database.js');
  const { PgPacienteRepository } = await import('../infrastructure/persistence/postgres/PgPacienteRepository.js');
  const { PgMedicionRepository } = await import('../infrastructure/persistence/postgres/PgMedicionRepository.js');
  const { PgMedicamentoRepository } = await import('../infrastructure/persistence/postgres/PgMedicamentoRepository.js');
  const { PgAlertaRepository } = await import('../infrastructure/persistence/postgres/PgAlertaRepository.js');
  const { PgNotificacionRepository } = await import('../infrastructure/persistence/postgres/PgNotificacionRepository.js');
  const { PgUsuarioRepository } = await import('../infrastructure/persistence/postgres/PgUsuarioRepository.js');
  const { PgAsignacionRepository } = await import('../infrastructure/persistence/postgres/PgAsignacionRepository.js');
  const { PgSeguimientoRepository } = await import('../infrastructure/persistence/postgres/PgSeguimientoRepository.js');
  const { PgOutboxRepository } = await import('../infrastructure/persistence/postgres/PgOutboxRepository.js');
  const { PgEventoRecibidoRepository } = await import('../infrastructure/persistence/postgres/PgEventoRecibidoRepository.js');
  const { PgCatalogoEditorialRepository } = await import('../infrastructure/persistence/postgres/PgCatalogoEditorialRepository.js');
  const { PgTelegramVinculoRepository } = await import('../infrastructure/persistence/postgres/PgTelegramVinculoRepository.js');

  const db = Database.getInstance();
  const pacienteRepository = new PgPacienteRepository(db);
  const medicionRepository = new PgMedicionRepository(db);
  const medicamentoRepository = new PgMedicamentoRepository(db);
  const alertaRepository = new PgAlertaRepository(db);
  const notificacionRepository = new PgNotificacionRepository(db);
  const usuarioRepository = new PgUsuarioRepository(db);
  const asignacionRepository = new PgAsignacionRepository(db);
  const seguimientoRepository = new PgSeguimientoRepository(db);
  const outboxRepository = new PgOutboxRepository(db);
  const eventoRecibidoRepository = new PgEventoRecibidoRepository(db);
  const catalogoEditorialRepository = new PgCatalogoEditorialRepository(db);
  const objetivoMedicionRepository = new PgObjetivoMedicionRepository(db);
  const criterioSeguridadRepository = new PgCriterioSeguridadRepository(db);
  const criterioClinicoRepository = new PgGestionCriteriosSeguridadRepository(db);
  const diagnosticoRepository = new PgDiagnosticoRepository(db);
  const telegramVinculoRepository = new PgTelegramVinculoRepository(db);
  const evaluadorObjetivo = new EvaluadorObjetivoIndividual({ objetivoMedicionRepository });
  const evaluadorSeguridad = new EvaluadorSeguridadAprobada({ criterioSeguridadRepository });
  const compatibilidadAlertasActiva = process.env.ALERTAS_BACKEND_ACTIVAS === 'true';
  const seguridadActiva = compatibilidadAlertasActiva || process.env.ALERTAS_SEGURIDAD_ACTIVAS === 'true';
  const objetivosActivos = compatibilidadAlertasActiva || process.env.ALERTAS_OBJETIVOS_ACTIVAS === 'true';
  const evaluadorDeAlertas = new EvaluadorMedicion({ seguridad: evaluadorSeguridad, objetivoIndividual: evaluadorObjetivo,
    seguridadActiva, objetivosActivos });
  return {
    db,
    usuarioRepository,
    pacienteRepository,
    asignacionRepository,
    seguimientoRepository,
    outboxRepository,
    eventoRecibidoRepository,
    alertaRepository,
    casosDeUso: construirCasosDeUso({
      pacienteRepository, medicionRepository, medicamentoRepository,
      alertaRepository, notificacionRepository, usuarioRepository,
      catalogoEditorialRepository,
      objetivoMedicionRepository, evaluadorDeAlertas,
      alertasBackendActivas: seguridadActiva || objetivosActivos,
      criterioClinicoRepository, diagnosticoRepository,
      telegramVinculoRepository,
    }),
  };
}
