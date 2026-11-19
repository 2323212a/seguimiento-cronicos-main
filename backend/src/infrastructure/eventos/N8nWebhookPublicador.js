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
