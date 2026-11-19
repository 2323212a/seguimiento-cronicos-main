-- Rollback 007: solo es posible antes de guardar diagnósticos, criterios o HbA1c.
BEGIN;
DO $$
BEGIN
  IF to_regclass('public.diagnostico') IS NULL OR to_regclass('public.version_criterio_seguridad') IS NULL THEN
    RAISE EXCEPTION 'Rollback 007: objetos esperados ausentes';
  END IF;
  IF EXISTS(SELECT 1 FROM public.diagnostico) OR EXISTS(SELECT 1 FROM public.version_criterio_seguridad)
    OR EXISTS(SELECT 1 FROM public.medicion WHERE tipo='hba1c') THEN
    RAISE EXCEPTION 'Rollback 007 bloqueado: existen registros de diagnóstico, criterios o HbA1c que deben conservarse';
  END IF;
END $$;

DROP TRIGGER trg_historial_diagnostico_inmutable ON public.diagnostico_historial;
DROP TRIGGER trg_auditar_diagnostico ON public.diagnostico;
DROP TRIGGER trg_validar_diagnostico ON public.diagnostico;
DROP FUNCTION public.bloquear_historial_diagnostico();
DROP FUNCTION public.auditar_diagnostico();
DROP FUNCTION public.validar_diagnostico();
DROP TABLE public.diagnostico_historial;
DROP TABLE public.diagnostico;

ALTER TABLE public.medicion DROP CONSTRAINT ck_medicion_tipo, DROP CONSTRAINT ck_medicion_valores, DROP COLUMN hba1c_percent;
ALTER TABLE public.medicion ADD CONSTRAINT ck_medicion_tipo CHECK (tipo IN ('glucosa','presion_arterial'));
ALTER TABLE public.medicion ADD CONSTRAINT ck_medicion_valores CHECK (
  (tipo='glucosa' AND glucosa_mg_dl IS NOT NULL AND glucosa_mg_dl>0 AND sistolica_mmhg IS NULL AND diastolica_mmhg IS NULL)
  OR (tipo='presion_arterial' AND glucosa_mg_dl IS NULL AND sistolica_mmhg IS NOT NULL AND diastolica_mmhg IS NOT NULL
      AND sistolica_mmhg>0 AND diastolica_mmhg>0 AND sistolica_mmhg>diastolica_mmhg));

ALTER TABLE public.version_criterio_seguridad DROP CONSTRAINT ck_vcs_autorizacion_autor,
  DROP CONSTRAINT fk_vcs_auth_autor,DROP CONSTRAINT fk_vcs_retiro_usuario,DROP CONSTRAINT fk_vcs_retiro_auth;
ALTER TABLE public.version_criterio_seguridad DROP COLUMN id_autorizacion_autor,DROP COLUMN retirado_por,DROP COLUMN id_autorizacion_retiro;
ALTER TABLE public.version_criterio_seguridad DROP CONSTRAINT ck_version_criterio_medicion;
ALTER TABLE public.version_criterio_seguridad ADD CONSTRAINT ck_version_criterio_medicion CHECK (
  (tipo_medicion='glucosa' AND unidad='mg/dL') OR (tipo_medicion='presion_arterial' AND unidad='mmHg'));

CREATE OR REPLACE FUNCTION public.validar_revision_criterio_seguridad() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v version_criterio_seguridad%ROWTYPE;
BEGIN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Las decisiones clínicas son inmutables'; END IF;
  SELECT * INTO v FROM public.version_criterio_seguridad WHERE id_version_criterio=NEW.id_version_criterio FOR UPDATE;
  IF v.estado<>'en_revision' OR NEW.ronda<>v.ronda_actual OR NEW.id_revisor=v.autor_id_usuario THEN RAISE EXCEPTION 'Ronda o independencia inválidas'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.autorizacion_editorial a JOIN public.usuario u ON u.id_usuario=a.id_usuario
    JOIN public.alcance_editorial s ON s.id_autorizacion=a.id_autorizacion WHERE a.id_autorizacion=NEW.id_autorizacion
      AND a.id_usuario=NEW.id_revisor AND a.capacidad='revisor' AND a.estado='activa' AND a.vigente_desde<=now()
      AND (a.vigente_hasta IS NULL OR a.vigente_hasta>now()) AND u.activo AND u.rol='medico'
      AND s.tipo_contenido='seguridad_medicion' AND (s.enfermedad IS NULL OR s.enfermedad=v.enfermedad)
      AND (s.poblacion IS NULL OR s.poblacion=v.poblacion)) THEN RAISE EXCEPTION 'Revisor médico autorizado y activo requerido'; END IF;
  RETURN NEW;
END; $$;
CREATE OR REPLACE FUNCTION public.validar_ciclo_criterio_seguridad() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE aprobadas integer; otras integer; fuente_vigente boolean;
BEGIN
  IF TG_OP='INSERT' THEN IF NEW.estado<>'borrador' THEN RAISE EXCEPTION 'Un criterio nuevo inicia como borrador'; END IF; RETURN NEW; END IF;
  IF NEW.id_criterio IS DISTINCT FROM OLD.id_criterio OR NEW.numero_version IS DISTINCT FROM OLD.numero_version
     OR NEW.tipo_medicion IS DISTINCT FROM OLD.tipo_medicion OR NEW.unidad IS DISTINCT FROM OLD.unidad
     OR NEW.enfermedad IS DISTINCT FROM OLD.enfermedad OR NEW.poblacion IS DISTINCT FROM OLD.poblacion
     OR NEW.condicion IS DISTINCT FROM OLD.condicion OR NEW.mensaje_orientacion IS DISTINCT FROM OLD.mensaje_orientacion
     OR NEW.id_version_fuente IS DISTINCT FROM OLD.id_version_fuente OR NEW.autor_id_usuario IS DISTINCT FROM OLD.autor_id_usuario
     OR NEW.creado_en IS DISTINCT FROM OLD.creado_en OR NEW.ronda_actual IS DISTINCT FROM OLD.ronda_actual
     OR NEW.aprobado_en IS DISTINCT FROM OLD.aprobado_en OR NEW.activado_en IS DISTINCT FROM OLD.activado_en
     OR NEW.retirado_en IS DISTINCT FROM OLD.retirado_en THEN RAISE EXCEPTION 'Una versión de criterio es inmutable'; END IF;
  IF NEW.estado IS NOT DISTINCT FROM OLD.estado THEN RAISE EXCEPTION 'Solo se permiten transiciones de estado'; END IF;
  IF OLD.estado='borrador' AND NEW.estado='en_revision' THEN NEW.ronda_actual:=OLD.ronda_actual+1; RETURN NEW; END IF;
  IF OLD.estado='en_revision' AND NEW.estado='borrador' THEN RETURN NEW; END IF;
  IF OLD.estado='en_revision' AND NEW.estado='aprobada' THEN
    SELECT count(DISTINCT id_revisor),count(*) FILTER(WHERE decision<>'aprobada') INTO aprobadas,otras FROM public.revision_criterio_seguridad
      WHERE id_version_criterio=OLD.id_version_criterio AND ronda=OLD.ronda_actual;
    IF aprobadas<2 OR otras>0 THEN RAISE EXCEPTION 'Se requieren dos revisiones médicas independientes aprobadas'; END IF;
    SELECT f.estado='vigente' INTO fuente_vigente FROM public.version_fuente vf JOIN public.fuente_clinica f USING(id_fuente) WHERE vf.id_version_fuente=NEW.id_version_fuente;
    IF NOT COALESCE(fuente_vigente,false) THEN RAISE EXCEPTION 'La fuente debe estar vigente'; END IF;
    NEW.aprobado_en:=now(); RETURN NEW;
  END IF;
  IF OLD.estado='aprobada' AND NEW.estado='activa' THEN
    IF NEW.activado_por IS NULL OR NEW.id_autorizacion_activador IS NULL OR NEW.activado_por=NEW.autor_id_usuario
      OR NOT EXISTS(SELECT 1 FROM public.usuario u JOIN public.autorizacion_editorial a ON a.id_usuario=u.id_usuario
        JOIN public.alcance_editorial s ON s.id_autorizacion=a.id_autorizacion WHERE u.id_usuario=NEW.activado_por AND u.activo
          AND u.rol='medico' AND a.id_autorizacion=NEW.id_autorizacion_activador AND a.capacidad='publicador' AND a.estado='activa'
          AND a.vigente_desde<=now() AND (a.vigente_hasta IS NULL OR a.vigente_hasta>now()) AND s.tipo_contenido='seguridad_medicion'
          AND (s.enfermedad IS NULL OR s.enfermedad=NEW.enfermedad) AND (s.poblacion IS NULL OR s.poblacion=NEW.poblacion))
      THEN RAISE EXCEPTION 'Activación requiere publicador autorizado'; END IF;
    SELECT f.estado='vigente' INTO fuente_vigente FROM public.version_fuente vf JOIN public.fuente_clinica f USING(id_fuente) WHERE vf.id_version_fuente=NEW.id_version_fuente;
    IF NOT COALESCE(fuente_vigente,false) THEN RAISE EXCEPTION 'La fuente debe estar vigente'; END IF;
    NEW.activado_en:=now(); RETURN NEW;
  END IF;
  IF OLD.estado IN ('aprobada','activa') AND NEW.estado='retirada' THEN
    IF NEW.motivo_retiro IS NULL OR length(btrim(NEW.motivo_retiro))=0 THEN RAISE EXCEPTION 'El retiro requiere motivo'; END IF;
    NEW.retirado_en:=now(); RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Transición de criterio no permitida: % -> %',OLD.estado,NEW.estado;
END; $$;
DROP FUNCTION public.validar_formato_condicion_seguridad(varchar,jsonb);
COMMIT;
