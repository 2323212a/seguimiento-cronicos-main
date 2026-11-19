export class PublicarVersionCatalogo {
  constructor({ catalogoEditorialRepository, politicaPublicacion=catalogoEditorialRepository.politicaPublicacion }) {
    this.repository=catalogoEditorialRepository; this.politica=politicaPublicacion;
  }
  ejecutar({ actorId, idVersion }) {
    return this.repository.publicarVersion({actorId,idVersion,validarPolitica:(contexto)=>this.politica.validar(contexto)});
  }
}
