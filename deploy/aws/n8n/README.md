# n8n y Telegram en AWS

Este paquete despliega n8n en la instancia dedicada de AWS, detrás de Caddy con HTTPS. No inicia servicios por sí solo. El puerto 5678 queda interno; publica 80/443 en el grupo de seguridad de la instancia y configura el DNS de `N8N_DOMAIN` para que apunte a ella.

## Archivos

- `compose.yaml`: n8n y proxy HTTPS con volúmenes persistentes.
- `Caddyfile`: proxy del dominio hacia n8n.
- `.env.example`: plantilla sin credenciales.
- `workflows/`: exportaciones para AWS de los flujos guardados en `backend/n8n/`.
- `TELEGRAM_RESPUESTAS.md`: comandos y textos que responde el bot.

## Configuración

1. Copia `.env.example` a `.env`, completa el dominio y el correo de TLS.
2. Para recuperar la instancia existente, conserva su volumen de datos y su `N8N_ENCRYPTION_KEY`; sin la clave original n8n no podrá descifrar las credenciales guardadas. No reemplaces el volumen con uno vacío.
3. Configura DNS y permite entrada TCP 80/443 a la instancia n8n. No publiques 5678.
4. Configura en n8n las credenciales de Telegram y de backend mediante la interfaz. Los JSON no contienen tokens.
5. Importa los flujos de `workflows/` sólo si la instancia destino no trae ya esos flujos. Revisa y prueba cada flujo antes de activarlo. El flujo Outbox y el de recordatorios deben permanecer inactivos hasta que se autorice su operación.

Los flujos AWS llaman al backend en su dirección privada actual `10.0.1.31:3000`. Si cambia la red privada de AWS, actualiza las URL de los JSON antes de importarlos. El grupo de seguridad del backend debe permitir el puerto 3000 desde el grupo de seguridad de n8n.

El workflow de consultas conserva la respuesta de datos personales y clínicos que ya tenía el proyecto; úsalo sólo con los permisos y el chat privado previstos por el backend. El flujo no decide ni crea criterios clínicos.

## Respaldo y actualización

Respaldar el volumen `n8n_data` antes de actualizar la imagen o migrar la instancia. Mantén estos JSON exportados junto al código como copia versionada de los workflows. No uses `docker compose down -v`: borraría los volúmenes persistentes.
