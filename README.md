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

    GET   /api/salud
    POST  /api/auth/registro
    POST  /api/auth/login
    POST  /api/auth/logout
    GET   /api/auth/me
    POST  /api/pacientes/me/mediciones
    GET   /api/pacientes/me/mediciones?tipo=&desde=&hasta=
    GET   /api/pacientes/me/medicamentos
    GET   /api/admin/usuarios
    PUT   /api/admin/pacientes/:id/asignacion-medico
    PUT   /api/admin/pacientes/:id/asignacion-seguimiento

## Frontend (React + Vite)

    cd frontend
    npm install
    npm run dev          # http://localhost:5173 (usa proxy /api -> localhost:3000)

Pantallas: crear cuenta / entrar con ID, registro e historial de mediciones (con gráfica),
registro y lista de medicamentos con horarios.

## Integración con n8n

El envío de eventos usa Transactional Outbox y queda desactivado hasta aplicar la migración correspondiente. El receptor reclama y confirma cada `eventId` con rutas protegidas con `x-api-key`; la entrega es al menos una vez. Los mensajes de Telegram son genéricos y no incluyen datos clínicos.

Los workflows importables están en `backend/n8n/`. La configuración está documentada en `backend/MIGRACIONES_Y_SEGURIDAD.md`.

## Pendiente

Faltan criterios clínicos aprobados para alertas, reportes, recuperación de contraseña, auditoría administrativa, pruebas de integración con PostgreSQL/n8n y despliegue.

## Seguridad y migraciones

El backend ahora incorpora registro de pacientes inactivos, login por correo/contraseña, JWT en cookie, CSRF, autorización por rol, administración de cuentas y asignaciones con historial. No uses el ID de paciente como acceso.

El procedimiento de bootstrap del primer administrador y las migraciones propuestas se documentan en [backend/MIGRACIONES_Y_SEGURIDAD.md](backend/MIGRACIONES_Y_SEGURIDAD.md). No ejecutes `backend/sql/schema.sql` contra una base existente: es heredado, incompleto y contiene `DROP TABLE ... CASCADE`. Las migraciones de `backend/migrations/` no se han ejecutado.

El trigger actual de alertas continúa activo. `ALERTAS_BACKEND_ACTIVAS` y `OUTBOX_WORKER_ACTIVO` permanecen deshabilitados por defecto; no los habilites hasta aplicar las migraciones correspondientes, verificar la transacción y acordar los criterios clínicos con profesionales de salud.
