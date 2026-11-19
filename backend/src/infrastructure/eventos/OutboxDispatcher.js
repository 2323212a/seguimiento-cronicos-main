const hostsLocalesPermitidos = new Set(['localhost','127.0.0.1','::1','n8n','host.docker.internal']);

export function validarConfiguracionOutbox({url,apiKey}) {
  if(typeof apiKey!=='string'||apiKey.length<32)throw new Error('OUTBOX requiere una API key de al menos 32 caracteres');
  let destino;
  try{destino=new URL(url);}catch{throw new Error('OUTBOX requiere una URL de webhook válida');}
  if(!['https:','http:'].includes(destino.protocol)||destino.username||destino.password||destino.hash
    ||(destino.protocol==='http:'&&!hostsLocalesPermitidos.has(destino.hostname))) {
    throw new Error('Webhook OUTBOX debe usar HTTPS o un host local permitido, sin credenciales embebidas');
  }
  return true;
}

export class OutboxDispatcher {
  constructor({ outboxRepository, url, apiKey, pausaMs = 1500, maxIntentos = 8 }) {
    Object.assign(this, { outboxRepository, url, apiKey, pausaMs, maxIntentos });
    this.detener = false;
  }
  async iniciar() {
    while (!this.detener) {
      let evento = null;
      try {
        evento = await this.outboxRepository.reclamar({ maxIntentos: this.maxIntentos });
        if (!evento) { await new Promise((resolve) => setTimeout(resolve, this.pausaMs)); continue; }
        if (!this.url) throw new Error('N8N_WEBHOOK_URL no está configurada');
        const respuesta = await fetch(this.url, {
          method: 'POST', headers: { 'content-type': 'application/json', ...(this.apiKey && { 'x-api-key': this.apiKey }) },
          body: JSON.stringify({ eventId: evento.eventId, tipo: evento.tipo, telegramChatId: evento.telegramChatId,
            plantilla: evento.plantilla, texto: 'Hay una actualización disponible en tu cuenta segura. Inicia sesión para consultarla.' }),
          signal: AbortSignal.timeout(10000),
        });
        if (!respuesta.ok) throw new Error(`n8n respondió ${respuesta.status}`);
        await this.outboxRepository.marcarEnviado(evento.id);
      } catch (error) {
        if (evento) {
          try { await this.outboxRepository.reintentar(evento.id, evento.intentos, error.message, this.maxIntentos); }
          catch (persistError) { console.error('No se pudo guardar el reintento del Outbox:', persistError.message); }
        } else console.error('No se pudo consultar el Outbox:', error.message);
        await new Promise((resolve) => setTimeout(resolve, this.pausaMs));
      }
    }
  }
  parar() { this.detener = true; }
}
