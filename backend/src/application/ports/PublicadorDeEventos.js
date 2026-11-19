// Puerto de salida: avisa a sistemas externos (n8n) que ocurrió algo en el dominio.
export class PublicadorDeEventos {
  async publicar(_evento) { throw new Error('No implementado'); }
}
