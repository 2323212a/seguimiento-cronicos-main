import { ErrorDeDominio } from './errors.js';

export const CodigosDiagnostico = Object.freeze(['diabetes_tipo_1','diabetes_tipo_2','hipertension']);
export class Diagnostico {
  constructor({ idPaciente,codigo,confirmadoEn }) {
    if(!Number.isInteger(Number(idPaciente))||Number(idPaciente)<1)throw new ErrorDeDominio('Paciente inválido');
    if(!CodigosDiagnostico.includes(codigo))throw new ErrorDeDominio('Diagnóstico no válido');
    const fecha=confirmadoEn?new Date(confirmadoEn):new Date();
    if(Number.isNaN(fecha.getTime())||fecha>new Date())throw new ErrorDeDominio('Fecha de confirmación no válida');
    Object.assign(this,{idPaciente:Number(idPaciente),codigo,confirmadoEn:fecha.toISOString().slice(0,10)});
  }
}
