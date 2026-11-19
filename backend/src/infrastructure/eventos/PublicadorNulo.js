import { PublicadorDeEventos } from '../../application/ports/PublicadorDeEventos.js';

export class PublicadorNulo extends PublicadorDeEventos {
  async publicar() {}
}
