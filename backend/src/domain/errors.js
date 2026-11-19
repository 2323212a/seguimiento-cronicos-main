export class ErrorDeDominio extends Error {
  constructor(mensaje, codigo = 'datos_no_validos') {
    super(mensaje);
    this.name = this.constructor.name;
    this.codigo = codigo;
  }
}
export class NoEncontrado extends ErrorDeDominio {}
export class Conflicto extends ErrorDeDominio {}
export class NoAutorizado extends ErrorDeDominio {}
