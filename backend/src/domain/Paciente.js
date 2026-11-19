import { ErrorDeDominio } from './errors.js';

export class Paciente {
  constructor({
    id = null, idUsuario = null, nombre, apellidoPaterno, apellidoMaterno = null,
    fechaNacimiento, telefono = null, telegramChatId = null, telegramVerificado = false,
  }) {
    if (!nombre?.trim()) throw new ErrorDeDominio('El nombre es obligatorio');
    if (!apellidoPaterno?.trim()) throw new ErrorDeDominio('El apellido paterno es obligatorio');
    const nacimiento = new Date(fechaNacimiento);
    if (Number.isNaN(nacimiento.getTime())) throw new ErrorDeDominio('La fecha de nacimiento no es válida');
    if (nacimiento > new Date()) throw new ErrorDeDominio('La fecha de nacimiento no puede ser futura');

    Object.assign(this, {
      id, idUsuario, nombre: nombre.trim(), apellidoPaterno: apellidoPaterno.trim(),
      apellidoMaterno, fechaNacimiento: nacimiento, telefono, telegramChatId, telegramVerificado,
    });
  }
}
