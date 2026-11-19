# Validación final y pruebas pendientes

## Evidencia ejecutada

- Frontend: `npm run build` con Node 24.22.2, Vite 6.4.5 y Rollup 4.67.5; compilación de producción exitosa.
- Backend: en la fase anterior pasaron las pruebas dirigidas de roles, catálogo, objetivos, receptor Outbox y n8n. No se repitieron en esta fase porque no hubo cambios en esos componentes.
- Configuración local: `OUTBOX_WORKER_ACTIVO=false` y `ALERTAS_BACKEND_ACTIVAS=false`.
- No se usaron cuentas clínicas ni se modificaron datos persistentes. No se inspeccionó la interfaz en navegador.

## Validación de integración (8 nov 2026)

### Migración 007

- Verificada en modo `READ ONLY` contra `seguimiento_cronicos`, la base configurada en `backend/.env`; no se consultaron filas de pacientes.
- El esquema tiene 32 tablas: 30 esperadas tras 006 y las dos creadas por 007 (`diagnostico`, `diagnostico_historial`).
- Coinciden las columnas: `medicion.hba1c_percent numeric(5,2)` nullable y campos de autorización/retiro de `version_criterio_seguridad`.
- Coinciden `ck_medicion_tipo`, `ck_medicion_valores`, restricciones de autorización de criterios, restricciones y llaves foráneas de diagnóstico.
- Coinciden los tres índices de diagnóstico, las funciones y los triggers de auditoría/inmutabilidad. Sin discrepancias técnicas observadas.
- No se ejecutó migración. La verificación se hizo por objetos del esquema; el repositorio no mantiene un registro de migraciones aplicado que se haya usado para esta comprobación.

### Estado de evaluación y Outbox

- La base consultada tiene cero versiones de criterios de seguridad en estado `activa`.
- `ALERTAS_BACKEND_ACTIVAS=false` y `OUTBOX_WORKER_ACTIVO=false` en la configuración local.
- Hallazgo corregido: `construirConPostgres()` ignoraba `ALERTAS_BACKEND_ACTIVAS` y forzaba el evaluador a activo. Ahora respeta el flag en [backend/src/config/container.js](backend/src/config/container.js). `node --check` y una comprobación dirigida de composición confirmaron que `false` llega al caso de uso.
- No se ejecutó el worker ni se envió ninguna notificación.

### Integración aislada

- El runner crea un contenedor con puerto loopback dinámico y tmpfs, y valida nombre/ID, imagen, puerto, almacenamiento y base vacía antes de escribir. No se conecta a la base configurada.
- En PostgreSQL efímero aplicó la estructura base y migraciones 004–007. Pasaron objetivos asignados, rechazo de médico no asignado, alerta dentro/fuera de objetivo, ausencia de alerta sin objetivo, deduplicación y filtrado para paciente/médico/seguimiento; el administrador recibió 403.
- HbA1c se persistió en `numeric(5,2)` y se recuperó por historial/API. No había criterios activos y no se generaron alertas clínicas.
- Con `OUTBOX_WORKER_ACTIVO=false` y sin iniciar dispatcher/webhook, se verificaron lease, reclamo duplicado, reintento, agotamiento de intentos y cero filas de notificación.
- El primer arranque se detuvo antes de escribir porque Docker informa tmpfs en `HostConfig.Tmpfs`, no `Mounts`. Tras corregir la comprobación, la ejecución completa pasó. Los contenedores temporales se cerraron; no se escribieron datos reales.

### Catálogo, interfaz y revisión clínica

- No se repitieron las pruebas automatizadas de catálogo. No se ejecutó el fixture PostgreSQL de publicación porque incorpora aprobaciones de prueba; no se usaron ni inventaron decisiones editoriales o clínicas en esta fase.
- No se encontró navegador automatizado instalado en el proyecto ni binario disponible. El control de ventanas tampoco pudo inicializarse en esta sesión por incompatibilidad de la ruta WSL con su runtime. No se hizo inspección visual; las listas por rol siguen pendientes.
- La aprobación/publicación manual del catálogo requiere médicos con autorizaciones editoriales reales y decisión profesional. Activar criterios requiere aprobación profesional; no se hizo.
- HbA1c permanece como captura técnica sin umbrales por defecto. La persistencia/consulta quedó comprobada sólo en datos ficticios aislados.

### Pruebas manuales y autorizaciones pendientes

- Revisar visualmente los cuatro roles en navegador cuando exista uno disponible, con datos ficticios y cuentas de prueba aprobadas.
- Validar manualmente el flujo editorial con cuentas autorizadas. No conceder capacidades, aprobar ni publicar durante pruebas sin autorización organizacional/profesional.
- Outbox permanece apagado; cualquier habilitación o envío real requiere autorización operativa expresa.

## Revisión manual de interfaz

Usar exclusivamente cuentas de prueba autorizadas y pacientes ficticios en una base aislada. Registrar resultado, navegador, fecha y versión desplegada.

### Paciente

- [ ] Iniciar/cerrar sesión; pestañas Inicio, Mediciones, Medicamentos, Alertas y Mi información.
- [ ] Registrar mediciones ficticias de glucosa, presión y HbA1c; comprobar validación de campos, unidad y confirmación antes de guardar.
- [ ] Consultar historial, filtros, gráficas, objetivos vigentes y alertas ficticias.
- [ ] Confirmar que no se presenta interpretación ni recomendación clínica de HbA1c.

### Médico

- [ ] Ver sólo pacientes asignados; verificar que otro paciente no aparece ni se consulta por URL directa.
- [ ] Consultar historial, medicamentos, alertas y objetivos; comprobar registro de un objetivo ficticio y sustitución/versionado que corresponda.
- [ ] Comprobar acciones de diagnóstico sólo con aprobación clínica real y cuenta autorizada; no crear datos clínicos de prueba en producción.
- [ ] Para Catálogo de seguridad, validar borrador, revisión, decisión y activación únicamente con profesionales y autorizaciones editoriales reales. No aprobar criterios ficticios ni activar reglas sin aprobación profesional.

### Seguimiento

- [ ] Ver sólo pacientes asignados, mediciones/alertas y acciones de seguimiento.
- [ ] Confirmar que no se muestran medicamentos, objetivos clínicos ni datos restringidos del detalle de alertas.
- [ ] Registrar una acción sólo con paciente ficticio en ambiente aislado.

### Administrador

- [ ] Revisar cuentas y asignaciones; verificar que la navegación no da acceso a endpoints clínicos.
- [ ] Confirmar que el rol administrador por sí solo no concede capacidades editoriales.
- [ ] No crear, cambiar roles ni asignar personas en producción durante esta revisión.

## Catálogo clínico con médicos autorizados

En entorno aislado y con cuentas editoriales de prueba aprobadas por la organización: verificar que cada capacidad y alcance permita sólo su operación; que autor distinto de revisores/publicador; que una cuenta sin autorización, vencida, revocada, inactiva o fuera de alcance reciba rechazo; que se impida autorrevisión; que una ronda incompleta o con decisión negativa no se publique; y que la publicación válida preserve auditoría y una sola versión vigente. La suite automatizada cubre estos invariantes; el flujo manual con cuentas autorizadas queda pendiente. No realizar aprobaciones clínicas reales durante la prueba.

## Objetivos y alertas con datos ficticios

En base desechable, crear sólo un paciente ficticio y objetivos definidos expresamente para el fixture: verificar paciente propio, médico asignado y seguimiento asignado; rechazar otros pacientes/roles; comparar medición dentro/fuera del objetivo; probar sin objetivo compatible; verificar contenido filtrado por rol y actualización de la pantalla. No reutilizar identificadores o registros de pacientes reales. Las pruebas unitarias existentes cubren la comparación del objetivo y el control de rol automatizado cubre asignaciones.

## HbA1c y migración

La implementación encontrada cubre captura técnica en `Medicion`, persistencia/consulta y visualización; no establece umbrales clínicos por defecto. La evaluación sólo puede resultar de criterios de seguridad versionados y activados. Mantener `ALERTAS_BACKEND_ACTIVAS=false` hasta aprobación profesional y validación del flujo correspondiente. No inventar reglas o mensajes clínicos.

El repositorio contiene `backend/migrations/007_diagnosticos_hba1c_y_gobernanza_seguridad.up.sql`, además de 006. En esta fase se verificó 007 por comparación de objetos en la base indicada por el entorno; no repetir ni aplicar migraciones.

## Outbox en prueba aislada

Mantener `OUTBOX_WORKER_ACTIVO=false` en cualquier ambiente real. Cuando haya autorización operativa, usar una base desechable, webhook local de captura sin envío externo y cuentas/pacientes ficticios: insertar un evento ficticio, verificar reclamación de lease, `eventId`, entrega única en el receptor, confirmación, rechazo de payload con datos clínicos, reintento tras error, backoff, recuperación tras lease vencido y estado terminal al agotar intentos. Confirmar que apagar el worker detiene la entrega y que el evento no contiene valores clínicos. No habilitar workflows n8n ni enviar notificaciones reales.

## Pendiente antes de cierre

- Revisión visual en navegador para los cuatro roles.
- Prueba manual del catálogo con cuentas clínicas autorizadas y alcance acordado.
