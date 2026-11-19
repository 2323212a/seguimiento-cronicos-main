# Preparación de despliegue en AWS

## Arquitectura

- Una EC2 pequeña ejecuta Docker Compose: frontend estático, backend Node, n8n y Caddy.
- RDS PostgreSQL 18.6 queda en subred privada; el grupo de seguridad de RDS acepta 5432 solo desde EC2.
- Caddy entrega HTTPS para `APP_DOMAIN` y `N8N_DOMAIN`. La app usa el mismo origen para `/api`, cookies JWT y CSRF.
- El volumen `n8n_data` conserva workflows y credenciales. Outbox y evaluadores permanecen apagados.
- No se expone a Internet ningún puerto de PostgreSQL, Node o n8n; solo 80/443 en EC2. SSH se restringe a la IP administrativa o se reemplaza por Systems Manager.

## Valores que debe definir el propietario

1. Región AWS y presupuesto mensual máximo; configurar AWS Budgets antes de crear instancias.
2. Dominio controlado por el propietario y subdominios `app` y `n8n`.
3. Cuenta AWS con MFA y método de pago.
4. Autorización explícita para transferir datos reales de pacientes a AWS.
5. Clave de cifrado actual de n8n. Si no se conserva, las credenciales guardadas podrían no poder descifrarse.

La instancia RDS disponible para el proyecto debe ser PostgreSQL 18.6, igual que el respaldo actual. Confirmar la versión ofrecida en la región elegida antes de crearla.

## Preparar el host

Crear una EC2 Ubuntu LTS con volumen EBS cifrado. Instalar Docker Engine y Compose plugin. Asignar una IP pública estable; DNS debe apuntar ambos subdominios a ella. En el grupo de seguridad de EC2 permitir 80/443 desde Internet y limitar 22 a la IP administrativa, o administrar por Systems Manager. No abrir 3000, 5432 ni 5678.

Crear RDS PostgreSQL 18.6 con cifrado, backups automáticos y acceso público desactivado. En su grupo de seguridad permitir TCP 5432 únicamente desde el grupo de seguridad de EC2. Crear base `seguimiento_cronicos` y un usuario de aplicación sin privilegios de superusuario.

Descargar el bundle oficial de certificados RDS en `deploy/aws/certs/global-bundle.pem` y verificar que no quede dentro del repositorio. AWS publica el bundle en `https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem`.

## Preparar configuración y secretos

En el host EC2:

```sh
cp deploy/aws/.env.example deploy/aws/.env
chmod 600 deploy/aws/.env
```

Completar dominios, endpoint y credenciales. Generar `JWT_SECRET` y `N8N_API_KEY` diferentes y aleatorios, y usar como `N8N_ENCRYPTION_KEY` la clave de la instalación actual para conservar las credenciales cifradas. No guardar `.env`, dumps, exportaciones de credenciales ni claves en Git. `DB_SSL=true` verifica TLS; `DB_SSL_CA` apunta al bundle de AWS.

## Respaldo y restauración de PostgreSQL

Programar una ventana breve sin escrituras. Crear un respaldo final desde la base vigente, cifrarlo antes de transferirlo y conservar intacta la base original:

```sh
docker exec seguimiento-cronicos-db pg_dump -U postgres -d seguimiento_cronicos -Fc --no-owner --no-privileges > seguimiento_cronicos.dump
```

Conectar a RDS usando el bundle CA y restaurar **solo en la base RDS vacía**:

```sh
pg_restore --host "$DB_HOST" --port 5432 --username "$DB_USER" --dbname "$DB_NAME" --no-owner --no-privileges --exit-on-error seguimiento_cronicos.dump
```

No ejecutar `schema.sql` encima de la restauración ni repetir migraciones ya instaladas. Antes de cambiar tráfico, comparar tablas, conteos y restricciones; confirmar que el esquema de destino refleja el respaldo. No borrar ni reinicializar la base de origen.

## Respaldo y restauración de n8n

Antes del corte, exportar workflows y respaldar el volumen `n8n_data` de la instancia actual en un archivo cifrado. Proteger también la clave de cifrado existente. Restaurar ese volumen en EC2 antes de iniciar n8n. No importar workflows encima de los ya restaurados.

El túnel temporal `trycloudflare.com` deja de ser la URL pública. Al arrancar con el dominio estable, comprobar la URL de webhook de n8n. Para el bot de Telegram, mantener activo un solo workflow con el token del bot: detener el listener local y después habilitar el de AWS, para evitar que dos instancias disputen el webhook. No activar Outbox ni alertas automáticas como parte de esta migración.

## Despliegue y cambio de tráfico

1. Copiar el repositorio y los archivos secretos al host EC2 por un canal seguro.
2. Confirmar que DNS resuelve ambos dominios hacia EC2 y que RDS es accesible solo desde EC2.
3. Ejecutar desde el repositorio: `docker compose --env-file deploy/aws/.env -f deploy/aws/compose.yaml config` para detectar variables faltantes. El comando `config` puede expandir secretos; no compartir ni guardar su salida.
4. Construir y arrancar: `docker compose --env-file deploy/aws/.env -f deploy/aws/compose.yaml up -d --build`.
5. Verificar HTTPS, `/api/salud`, login, cookies Secure, CSRF, los cuatro roles y la persistencia del volumen n8n.
6. Cuando la verificación termine, permitir tráfico y activar una sola instancia del webhook de Telegram.
7. Mantener la base anterior sin cambios durante la aceptación; no eliminarla hasta contar con autorización separada.

## Reversión

Si falla antes de permitir escrituras, devolver DNS al entorno anterior. Si ya hubo escrituras en AWS, pausar el tráfico y definir cuál base será la fuente de verdad; no regresar DNS sin reconciliar esos datos. Conservar el RDS y el respaldo hasta que el propietario confirme la aceptación. No eliminar recursos durante el rollback.

## Pendientes manuales

- Elegir región, dominios y tope de gasto.
- Crear los recursos AWS y configurar presupuestos.
- Autorizar la transferencia de datos reales.
- Respaldar y restaurar el volumen y la clave de cifrado de n8n.
- Activar el webhook de Telegram una sola vez después del corte.
- Validar el flujo desde navegador con cuentas autorizadas.
