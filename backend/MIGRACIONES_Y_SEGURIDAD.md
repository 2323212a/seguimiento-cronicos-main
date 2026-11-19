# Migraciones, autenticación y operación

## No ejecutar el esquema heredado sobre una base existente

`sql/schema.sql` es un esquema antiguo, omite asignaciones y contiene `DROP TABLE ... CASCADE`. No es un mecanismo de actualización. Para evolucionar una base existente, revisar el dump completo y aplicar migraciones pequeñas de `migrations/` después de respaldar y validar precondiciones. Ninguna migración de esta entrega fue ejecutada.

Orden propuesto:

1. Ejecutar solo lectura `000_prevalidacion_asignaciones.sql`. Resolver duplicados activos con el administrador; no se cierran automáticamente.
2. Revisar y aprobar `001_cuentas_y_asignaciones.up.sql`. Crea primero los índices únicos por paciente y después retira los índices previos por pareja. El rollback está en el archivo `.down.sql` correspondiente.
3. Revisar `002_outbox.up.sql` antes de habilitar el flag `OUTBOX_WORKER_ACTIVO`. El worker usa leases, reintentos y recuperación de eventos abandonados; `eventId` y la tabla `evento_recibido` permiten deduplicar en el receptor.
4. Mantener `ALERTAS_BACKEND_ACTIVAS=false` mientras `trg_evaluar_medicion` exista. La migración 003 se ejecuta solo después de comprobar el guardado transaccional en un esquema aislado y acordar criterios clínicos con profesionales. La función se conserva para rollback.

Los scripts `.down.sql` describen reversión; también deben probarse en una copia. No borrar datos clínicos ni tablas como parte de una actualización.

## Bootstrap del primer administrador

El registro HTTP solo crea pacientes inactivos. En una instalación sin administrador, un operador autorizado configura temporalmente `BOOTSTRAP_ADMIN_EMAIL` y `BOOTSTRAP_ADMIN_PASSWORD` mediante el gestor de secretos del entorno y ejecuta `npm run bootstrap:admin` desde `backend/`. El comando calcula bcrypt y usa `pg_advisory_xact_lock` dentro de la transacción antes de comprobar administradores activos e insertar la cuenta. Si ya existe un administrador activo, aborta. Retirar de inmediato las variables temporales. No existe endpoint público de bootstrap.

Las cuentas administrativas posteriores las crea un administrador activo y quedan inactivas hasta que otro administrador las active. La API impide desactivar la propia cuenta y exige que permanezca al menos un administrador activo.

## Cookies y CSRF

Configurar `JWT_SECRET` con al menos 32 caracteres aleatorios y `FRONTEND_ORIGINS` con orígenes exactos. En producción, el servidor debe estar detrás de HTTPS para emitir cookies `Secure`. El frontend solicita `/api/auth/csrf`, envía la cookie CSRF junto con `X-CSRF-Token`, y usa `credentials: include`. Mantener el frontend y la API bajo el mismo sitio; no almacenar JWT en `localStorage`.

## Outbox y n8n

La medición, alerta backend y evento Outbox se escriben en la misma transacción cuando se habilite el backend de alertas tras retirar el trigger. El worker envía después del commit. La entrega es al menos una vez: una confirmación perdida después del envío externo puede causar duplicado. n8n debe llamar primero a `/api/automatizacion/eventos/:eventId/reclamar`, enviar solo el texto genérico y después llamar `/completar`. El receptor conserva `eventId` y un lease; expiraciones permiten recuperación de eventos abandonados. Los mensajes y payloads no incluyen valores, diagnósticos, medicamentos ni dosis.

Mantener `N8N_API_KEY` únicamente en secretos de backend y n8n. Los workflows usan `$env.N8N_API_KEY`; configura n8n para permitir explícitamente esa variable o reemplázala con una credencial administrada en n8n. No dejar claves reales en JSON de workflow ni en el repositorio.
