export function evaluarObjetivoMedicion(medicion, objetivo) {
  if (!objetivo) return null;
  const fuera = (valor, minimo, maximo) => (minimo != null && valor < Number(minimo)) || (maximo != null && valor > Number(maximo));
  const fueraObjetivo = medicion.tipo === 'glucosa'
    ? fuera(medicion.glucosaMgDl, objetivo.glucosa_min, objetivo.glucosa_max)
    : fuera(medicion.sistolicaMmhg, objetivo.sistolica_min, objetivo.sistolica_max)
      || fuera(medicion.diastolicaMmhg, objetivo.diastolica_min, objetivo.diastolica_max);
  if (!fueraObjetivo) return null;
  return {
    idObjetivo: Number(objetivo.id_objetivo),
    tipo: 'fuera_objetivo_individual',
    clasificacion: 'fuera_objetivo_individual',
    motivo: 'La medición quedó fuera del objetivo individual registrado por tu médico.',
    indicacionPaciente: objetivo.indicacion_paciente,
  };
}
