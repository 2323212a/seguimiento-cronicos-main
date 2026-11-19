export class PgCriterioSeguridadRepository {
  constructor(db) { this.db = db; }
  async listarAprobadosActivos(client, medicion) {
    const { rows } = await client.query(`SELECT v.id_version_criterio AS id,c.codigo,v.numero_version AS version,
        v.condicion,v.mensaje_orientacion AS "mensajeOrientacion"
      FROM public.version_criterio_seguridad v JOIN public.criterio_seguridad c USING(id_criterio)
      LEFT JOIN public.version_fuente vf USING(id_version_fuente) LEFT JOIN public.fuente_clinica f USING(id_fuente)
      WHERE v.estado='activa' AND (v.id_version_fuente IS NULL OR f.estado='vigente') AND v.tipo_medicion=$1
        AND (v.enfermedad IS NULL OR EXISTS (SELECT 1 FROM public.diagnostico d
          WHERE d.id_paciente=$2 AND d.codigo=v.enfermedad AND d.estado='confirmado'))
        AND v.poblacion=CASE WHEN (SELECT date_part('year',age(m.fecha_hora,p.fecha_nacimiento))
          FROM public.paciente p JOIN public.medicion m ON m.id_paciente=p.id_paciente
          WHERE p.id_paciente=$2 AND m.id_medicion=$3) BETWEEN 13 AND 17 THEN 'adolescente_13_17'
          WHEN (SELECT date_part('year',age(m.fecha_hora,p.fecha_nacimiento))
          FROM public.paciente p JOIN public.medicion m ON m.id_paciente=p.id_paciente
          WHERE p.id_paciente=$2 AND m.id_medicion=$3)>=18 THEN 'adulto_18_mas' ELSE 'sin_alcance' END
      ORDER BY v.id_criterio`, [medicion.tipo, medicion.idPaciente, medicion.id]);
    return rows.map((r) => ({ ...r, id: Number(r.id), condicion: typeof r.condicion === 'string' ? JSON.parse(r.condicion) : r.condicion }));
  }
}
