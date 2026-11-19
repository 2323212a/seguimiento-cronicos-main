-- Requiere criterios existentes con fuente para restablecer la restricción.
BEGIN;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.version_criterio_seguridad WHERE id_version_fuente IS NULL) THEN
    RAISE EXCEPTION 'Rollback 009 bloqueado: hay criterios sin fuente asociada';
  END IF;
END $$;

ALTER TABLE public.version_criterio_seguridad ALTER COLUMN id_version_fuente SET NOT NULL;

CREATE OR REPLACE FUNCTION public.validar_ciclo_criterio_seguridad() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE aprobadas integer; otras integer; aprobaciones_validas integer; fuente_vigente boolean;
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.estado<>'borrador' OR NEW.autor_id_usuario=NEW.activado_por OR NOT EXISTS (
      SELECT 1 FROM public.usuario u JOIN public.autorizacion_editorial a ON a.id_usuario=u.id_usuario
      JOIN public.alcance_editorial s ON s.id_autorizacion=a.id_autorizacion
      WHERE u.id_usuario=NEW.autor_id_usuario AND u.activo AND u.rol='medico'
        AND a.id_autorizacion=NEW.id_autorizacion_autor AND a.capacidad='autor' AND a.estado='activa'
        AND a.vigente_desde<=now() AND (a.vigente_hasta IS NULL OR a.vigente_hasta>now())
        AND s.tipo_contenido='seguridad_medicion' AND (s.enfermedad IS NULL OR s.enfermedad=NEW.enfermedad)
        AND (s.poblacion IS NULL OR s.poblacion=NEW.poblacion)) THEN
      RAISE EXCEPTION 'El borrador requiere un médico autor activo con autorización y alcance vigentes';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.estado='borrador' AND NEW.estado='borrador' THEN
    IF NEW.id_criterio IS DISTINCT FROM OLD.id_criterio OR NEW.numero_version IS DISTINCT FROM OLD.numero_version
       OR NEW.autor_id_usuario IS DISTINCT FROM OLD.autor_id_usuario OR NEW.id_autorizacion_autor IS DISTINCT FROM OLD.id_autorizacion_autor
       OR NEW.creado_en IS DISTINCT FROM OLD.creado_en OR NEW.aprobado_en IS DISTINCT FROM OLD.aprobado_en
       OR NEW.activado_en IS DISTINCT FROM OLD.activado_en OR NEW.retirado_en IS DISTINCT FROM OLD.retirado_en
       OR NOT public.validar_formato_condicion_seguridad(NEW.tipo_medicion,NEW.condicion)
       OR NOT EXISTS (SELECT 1 FROM public.usuario u JOIN public.autorizacion_editorial a ON a.id_usuario=u.id_usuario
         JOIN public.alcance_editorial s ON s.id_autorizacion=a.id_autorizacion
         JOIN public.version_fuente vf ON vf.id_version_fuente=NEW.id_version_fuente
         JOIN public.fuente_clinica f ON f.id_fuente=vf.id_fuente
         JOIN public.version_catalogo vc ON vc.id_version=vf.id_version
         WHERE u.id_usuario=NEW.autor_id_usuario AND u.activo AND u.rol='medico'
           AND a.id_autorizacion=NEW.id_autorizacion_autor AND a.capacidad='autor' AND a.estado='activa'
           AND a.vigente_desde<=now() AND (a.vigente_hasta IS NULL OR a.vigente_hasta>now())
           AND s.tipo_contenido='seguridad_medicion' AND (s.enfermedad IS NULL OR s.enfermedad=NEW.enfermedad)
           AND (s.poblacion IS NULL OR s.poblacion=NEW.poblacion) AND f.estado='vigente' AND vc.estado='vigente'
           AND vc.tipo_contenido='fuente_clinica' AND (vc.enfermedad IS NULL OR vc.enfermedad IS NOT DISTINCT FROM NEW.enfermedad)
           AND (vc.poblacion IS NULL OR vc.poblacion IS NOT DISTINCT FROM NEW.poblacion)) THEN
      RAISE EXCEPTION 'El borrador editado requiere autorización vigente, fuente compatible y condición estructurada';
    END IF;
    RETURN NEW;
  END IF;
  IF NOT public.validar_formato_condicion_seguridad(NEW.tipo_medicion,NEW.condicion) THEN
    RAISE EXCEPTION 'Condición estructurada incompatible con el tipo de medición';
  END IF;
  IF NEW.id_criterio IS DISTINCT FROM OLD.id_criterio OR NEW.numero_version IS DISTINCT FROM OLD.numero_version
     OR NEW.tipo_medicion IS DISTINCT FROM OLD.tipo_medicion OR NEW.unidad IS DISTINCT FROM OLD.unidad
     OR NEW.enfermedad IS DISTINCT FROM OLD.enfermedad OR NEW.poblacion IS DISTINCT FROM OLD.poblacion
     OR NEW.condicion IS DISTINCT FROM OLD.condicion OR NEW.mensaje_orientacion IS DISTINCT FROM OLD.mensaje_orientacion
     OR NEW.id_version_fuente IS DISTINCT FROM OLD.id_version_fuente OR NEW.autor_id_usuario IS DISTINCT FROM OLD.autor_id_usuario
     OR NEW.id_autorizacion_autor IS DISTINCT FROM OLD.id_autorizacion_autor OR NEW.creado_en IS DISTINCT FROM OLD.creado_en
     OR NEW.ronda_actual IS DISTINCT FROM OLD.ronda_actual OR NEW.aprobado_en IS DISTINCT FROM OLD.aprobado_en
     OR NEW.activado_en IS DISTINCT FROM OLD.activado_en OR NEW.retirado_en IS DISTINCT FROM OLD.retirado_en THEN
    RAISE EXCEPTION 'Una versión de criterio es inmutable';
  END IF;
  IF NEW.estado IS NOT DISTINCT FROM OLD.estado THEN RAISE EXCEPTION 'Solo se permiten transiciones de estado'; END IF;
  IF OLD.estado='borrador' AND NEW.estado='en_revision' THEN NEW.ronda_actual:=OLD.ronda_actual+1; RETURN NEW; END IF;
  IF OLD.estado='en_revision' AND NEW.estado='borrador' THEN RETURN NEW; END IF;
  IF OLD.estado='en_revision' AND NEW.estado='aprobada' THEN
    SELECT count(DISTINCT id_revisor),count(*) FILTER (WHERE decision<>'aprobada') INTO aprobadas,otras
      FROM public.revision_criterio_seguridad WHERE id_version_criterio=OLD.id_version_criterio AND ronda=OLD.ronda_actual;
    IF aprobadas<2 OR otras>0 THEN RAISE EXCEPTION 'Se requieren dos revisiones médicas independientes aprobadas en la ronda'; END IF;
    SELECT f.estado='vigente' INTO fuente_vigente FROM public.version_fuente vf JOIN public.fuente_clinica f USING(id_fuente)
      WHERE vf.id_version_fuente=NEW.id_version_fuente;
    IF NOT COALESCE(fuente_vigente,false) THEN RAISE EXCEPTION 'La fuente debe estar vigente'; END IF;
    NEW.aprobado_en:=now(); RETURN NEW;
  END IF;
  IF OLD.estado='aprobada' AND NEW.estado='activa' THEN
    SELECT count(DISTINCT r.id_revisor) INTO aprobaciones_validas FROM public.revision_criterio_seguridad r
      JOIN public.usuario ru ON ru.id_usuario=r.id_revisor AND ru.activo AND ru.rol='medico'
      JOIN public.autorizacion_editorial ra ON ra.id_autorizacion=r.id_autorizacion AND ra.id_usuario=r.id_revisor
        AND ra.capacidad='revisor' AND ra.estado='activa' AND ra.vigente_desde<=now()
        AND (ra.vigente_hasta IS NULL OR ra.vigente_hasta>now())
      JOIN public.alcance_editorial rs ON rs.id_autorizacion=ra.id_autorizacion AND rs.tipo_contenido='seguridad_medicion'
        AND (rs.enfermedad IS NULL OR rs.enfermedad=NEW.enfermedad) AND (rs.poblacion IS NULL OR rs.poblacion=NEW.poblacion)
      WHERE r.id_version_criterio=OLD.id_version_criterio AND r.ronda=OLD.ronda_actual AND r.decision='aprobada';
    IF aprobaciones_validas<2 THEN RAISE EXCEPTION 'Las dos aprobaciones deben seguir vigentes al activar'; END IF;
    IF NEW.activado_por IS NULL OR NEW.id_autorizacion_activador IS NULL OR NEW.activado_por=NEW.autor_id_usuario
      OR EXISTS (SELECT 1 FROM public.revision_criterio_seguridad r WHERE r.id_version_criterio=OLD.id_version_criterio
        AND r.ronda=OLD.ronda_actual AND r.decision='aprobada' AND r.id_revisor=NEW.activado_por)
      OR NOT EXISTS (SELECT 1 FROM public.usuario u JOIN public.autorizacion_editorial a ON a.id_usuario=u.id_usuario
        JOIN public.alcance_editorial s ON s.id_autorizacion=a.id_autorizacion
        WHERE u.id_usuario=NEW.activado_por AND u.activo AND u.rol='medico' AND a.id_autorizacion=NEW.id_autorizacion_activador
          AND a.capacidad='publicador' AND a.estado='activa' AND a.vigente_desde<=now()
          AND (a.vigente_hasta IS NULL OR a.vigente_hasta>now()) AND s.tipo_contenido='seguridad_medicion'
          AND (s.enfermedad IS NULL OR s.enfermedad=NEW.enfermedad) AND (s.poblacion IS NULL OR s.poblacion=NEW.poblacion)) THEN
      RAISE EXCEPTION 'Activación requiere publicador médico autorizado, independiente de autor y revisores';
    END IF;
    SELECT f.estado='vigente' INTO fuente_vigente FROM public.version_fuente vf JOIN public.fuente_clinica f USING(id_fuente)
      WHERE vf.id_version_fuente=NEW.id_version_fuente;
    IF NOT COALESCE(fuente_vigente,false) THEN RAISE EXCEPTION 'La fuente debe estar vigente'; END IF;
    NEW.activado_en:=now(); RETURN NEW;
  END IF;
  IF OLD.estado IN ('aprobada','activa') AND NEW.estado='retirada' THEN
    IF NEW.retirado_por IS NULL OR NEW.id_autorizacion_retiro IS NULL OR NEW.motivo_retiro IS NULL OR length(btrim(NEW.motivo_retiro))=0
      OR NOT EXISTS (SELECT 1 FROM public.usuario u JOIN public.autorizacion_editorial a ON a.id_usuario=u.id_usuario
        JOIN public.alcance_editorial s ON s.id_autorizacion=a.id_autorizacion WHERE u.id_usuario=NEW.retirado_por AND u.activo
          AND u.rol='medico' AND a.id_autorizacion=NEW.id_autorizacion_retiro AND a.capacidad='publicador' AND a.estado='activa'
          AND a.vigente_desde<=now() AND (a.vigente_hasta IS NULL OR a.vigente_hasta>now())
          AND s.tipo_contenido='seguridad_medicion' AND (s.enfermedad IS NULL OR s.enfermedad=NEW.enfermedad)
          AND (s.poblacion IS NULL OR s.poblacion=NEW.poblacion)) THEN RAISE EXCEPTION 'Retiro requiere publicador autorizado y motivo'; END IF;
    NEW.retirado_en:=now(); RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Transición de criterio no permitida: % -> %',OLD.estado,NEW.estado;
END; $$;

CREATE OR REPLACE FUNCTION public.validar_formato_condicion_seguridad(p_tipo varchar,p_condicion jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE regla jsonb; campo text;
BEGIN
  IF jsonb_typeof(p_condicion)<>'object' THEN RETURN false; END IF;
  IF jsonb_typeof(p_condicion->'any')<>'array' THEN RETURN false; END IF;
  IF jsonb_array_length(p_condicion->'any') NOT BETWEEN 1 AND 20 THEN RETURN false; END IF;
  FOR regla IN SELECT value FROM jsonb_array_elements(p_condicion->'any') LOOP
    IF jsonb_typeof(regla)<>'object' THEN RETURN false; END IF;
    IF jsonb_object_length(regla)<>3 OR NOT (regla ? 'campo' AND regla ? 'operador' AND regla ? 'valor')
       OR jsonb_typeof(regla->'campo')<>'string' OR jsonb_typeof(regla->'operador')<>'string'
       OR jsonb_typeof(regla->'valor')<>'number' THEN RETURN false; END IF;
    campo:=regla->>'campo';
    IF (p_tipo='glucosa' AND campo<>'glucosaMgDl')
       OR (p_tipo='presion_arterial' AND campo NOT IN ('sistolicaMmhg','diastolicaMmhg'))
       OR (p_tipo='hba1c' AND campo<>'hba1cPercent')
       OR p_tipo NOT IN ('glucosa','presion_arterial','hba1c')
       OR regla->>'operador' NOT IN ('gt','gte','lt','lte') THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END; $$;

COMMIT;
