# Respuestas y comandos del bot de Telegram

La lógica ejecutable está en `workflows/workflow-consultas-uso-telegram.json` (exportada desde `backend/n8n/workflow-consultas-uso-telegram.json`). Este documento resume sus comandos y textos para que el comportamiento quede visible y versionado en el proyecto.

## Menú rápido

- `/ayuda`, `/start`, `/help`, `/menu` o un saludo: presenta el menú de consultas y aclara que el bot muestra datos guardados, no interpreta mediciones ni modifica tratamientos.
- `/perfil`: nombre, fecha de nacimiento, teléfono y estado de vinculación.
- `/mediciones`, `/medicion` o `/historial`: últimas mediciones registradas.
- `/medicamentos`: medicamentos y horarios registrados.
- `/alertas`: alertas guardadas.
- `/diagnosticos`: diagnósticos confirmados.
- `/objetivos`: objetivos registrados por el médico.
- `/vincular`: solicita un código temporal y explica dónde introducirlo en “Mi información”.
- `/acceso`: explica que el registro se realiza en la aplicación y la cuenta requiere activación administrativa.

También reconoce consultas en texto sobre perfil, mediciones, medicamentos, alertas, diagnósticos y objetivos. Sólo atiende mensajes de texto en chats privados.

## Respuestas de estado

- Cuenta no vinculada: indica iniciar sesión, usar `/vincular` y pegar el código en la sección “Mi información”.
- Error temporal del backend: pide intentar la consulta más tarde.
- Sin registros: indica que no hay elementos guardados en esa sección.
- Síntomas o emergencia: aclara que el bot no puede valorar síntomas, recomienda contactar al profesional y usar servicios locales de emergencia ante peligro inmediato.
- Consulta desconocida: muestra cómo abrir la ayuda.
- Respuesta extensa: recorta el mensaje y dirige al usuario a la aplicación para ver el historial completo.

El workflow entrega datos del perfil y del historial guardado; configura las credenciales y permisos del backend antes de activarlo. El código de vinculación es temporal y el bot pide no compartirlo.

## Otros workflows incluidos

- `workflow-recordatorios-medicamentos.json`: consulta recordatorios y los registra; dejar inactivo hasta autorizar el envío operativo.
- `workflow-confirmacion-medicion.json`: flujo Outbox de confirmación genérica; mantener inactivo mientras el worker Outbox siga deshabilitado.
