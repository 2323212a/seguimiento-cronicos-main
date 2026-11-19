# Validación técnica y alertas

Las migraciones `005_objetivos_y_alertas_individuales` y `006_validacion_y_criterios_seguridad` agregan objetivos individuales, trazabilidad de evaluación y soporte versionado para criterios de seguridad. Se conserva la estructura base y no se preconfiguran criterios clínicos.

## Funcionamiento

- El médico activo asignado registra los límites que definió para el paciente y una indicación escrita para ese paciente.
- Al guardar una medición, el backend busca en la misma transacción un objetivo vigente compatible por tipo, fecha y contexto.
- Una medición fuera de los límites configurados crea una alerta `fuera_objetivo_individual`. Sin objetivo compatible no se genera alerta.
- La detección de seguridad consulta criterios versionados y activados con revisión profesional. Al iniciar no hay criterios cargados o activos, por lo que no produce alertas de seguridad hasta que sean aprobados y activados.
- Seguridad y objetivos se evalúan de forma independiente: una medición puede disparar ambas clases de alerta. La deduplicación se aplica por medición y criterio o por medición y objetivo.
- La validación técnica se ejecuta antes de insertar: campos, tipo, unidad, signo, precisión y capacidad de las columnas. No aplica máximos clínicos. Valores inusuales pero representables pueden guardarse y evaluarse por los mecanismos separados.
- Los rechazos de formato se registran sin guardar la medición ni sus valores; la bitácora conserva sólo paciente, usuario, código técnico y fecha.
- La medición, los resultados de evaluación, las alertas y el evento genérico del Outbox (si hay alerta) se guardan atómicamente. Un fallo revierte la operación.
- El paciente consulta sus objetivos e indicaciones en **Mi información** y sus alertas en **Alertas**. Médico y paciente pueden consultar el detalle. Seguimiento recibe una notificación operativa genérica y no recibe la indicación clínica.
- Las listas de alertas se actualizan cada 30 segundos mientras la pantalla está abierta.

## Alcance y seguridad clínica

No hay valores de objetivo predeterminados, umbrales universales, clasificación de urgencia, diagnóstico ni evaluación de HbA1c. Tampoco se recomiendan, suspenden ni modifican medicamentos. El catálogo de medicamentos y las prescripciones existentes permanecen independientes y bajo gestión del médico.

El worker Outbox continúa apagado. El evento almacenado no contiene resultados, diagnósticos, indicaciones ni detalles de medicamentos; no se ha ejecutado ningún workflow de n8n ni enviado notificaciones.

## Rutas

- `GET /api/pacientes/me/objetivos`: objetivos e indicaciones del paciente autenticado.
- `GET /api/medico/pacientes/:idPaciente/objetivos`: objetivos del paciente con asignación médica activa.
- `POST /api/medico/pacientes/:idPaciente/objetivos`: registra y sustituye el objetivo vigente del mismo tipo y contexto. El actor se obtiene del JWT.
- Las alertas siguen disponibles en las rutas `/api/pacientes/me/alertas`, `/api/medico/pacientes/:idPaciente/alertas` y `/api/seguimiento/pacientes/:idPaciente/alertas`, con detalle clínico filtrado por rol.

Los criterios de seguridad requieren revisión de dos médicos autorizados y activación independiente por un médico publicador autorizado. El administrador general no adquiere permisos clínicos. El catálogo aún no ofrece pantallas/API de autoría de criterios; por tanto, no debe cargarse ni activarse ninguno manualmente hasta completar ese flujo y aprobar mensajes, poblaciones y reglas. El esquema actual tampoco dispone de entidad de diagnósticos, así que los criterios asociados a enfermedades no se evalúan.

Los rollbacks 005/006 se niegan a eliminar objetivos, evaluaciones, intentos rechazados, criterios, alertas o auditoría ya utilizados. Si se requiere revertir después de usarlos, debe planearse una migración de conservación de datos, no ejecutar el rollback destructivo.
