-- Rollback 006: protege trazabilidad o criterios ya utilizados.
BEGIN;
DO $$
BEGIN
  IF to_regclass('public.evaluacion_medicion') IS NULL OR to_regclass('public.criterio_seguridad') IS NULL THEN
    RAISE EXCEPTION 'Rollback 006 abortado: faltan los objetos de la migracion';
  END IF;
  IF EXISTS (SELECT 1 FROM public.evaluacion_medicion)
     OR EXISTS (SELECT 1 FROM public.intento_medicion_rechazado)
     OR EXISTS (SELECT 1 FROM public.criterio_seguridad)
     OR EXISTS (SELECT 1 FROM public.version_criterio_seguridad)
     OR EXISTS (SELECT 1 FROM public.revision_criterio_seguridad)
     OR EXISTS (SELECT 1 FROM public.alerta WHERE clasificacion='seguridad')
     OR EXISTS (SELECT 1 FROM public.alcance_editorial WHERE tipo_contenido='seguridad_medicion') THEN
    RAISE EXCEPTION 'Rollback 006 abortado: ya existe trazabilidad o contenido de criterios; requiere migracion de conservacion';
  END IF;
END $$;

ALTER TABLE public.alerta DROP CONSTRAINT ck_alerta_objetivo_datos;
DROP INDEX public.uq_alerta_seguridad_medicion_criterio;
ALTER TABLE public.alerta DROP CONSTRAINT fk_alerta_version_criterio;
ALTER TABLE public.alerta DROP COLUMN id_version_criterio, DROP COLUMN codigo_criterio,
  DROP COLUMN version_criterio, DROP COLUMN condicion_aplicada;
ALTER TABLE public.alerta ADD CONSTRAINT ck_alerta_objetivo_datos CHECK (
  (id_objetivo IS NULL AND clasificacion IS NULL AND indicacion_paciente IS NULL)
  OR (id_objetivo IS NOT NULL AND id_medicion IS NOT NULL AND clasificacion='fuera_objetivo_individual'
      AND indicacion_paciente IS NOT NULL AND length(btrim(indicacion_paciente))>0));

DROP TRIGGER trg_evaluacion_medicion_inmutable ON public.evaluacion_medicion;
DROP FUNCTION public_no_editar_evaluacion_medicion();
DROP TRIGGER trg_revision_criterio_inmutable ON public.revision_criterio_seguridad;
DROP TRIGGER trg_no_borrar_version_criterio_seguridad ON public.version_criterio_seguridad;
DROP TRIGGER trg_no_borrar_criterio_seguridad ON public.criterio_seguridad;
DROP TRIGGER trg_ciclo_criterio_seguridad ON public.version_criterio_seguridad;
DROP TRIGGER trg_validar_revision_criterio_seguridad ON public.revision_criterio_seguridad;
DROP FUNCTION public_no_borrar_criterio_seguridad();
DROP FUNCTION public.validar_ciclo_criterio_seguridad();
DROP FUNCTION public.validar_revision_criterio_seguridad();
DROP TABLE public.intento_medicion_rechazado;
DROP TABLE public.evaluacion_medicion;
DROP TABLE public.revision_criterio_seguridad;
DROP TABLE public.version_criterio_seguridad;
DROP TABLE public.criterio_seguridad;
ALTER TABLE public.alcance_editorial DROP CONSTRAINT ck_alcance_seguridad_sin_catalogo;
ALTER TABLE public.alcance_editorial DROP CONSTRAINT ck_alcance_tipo;
ALTER TABLE public.alcance_editorial ADD CONSTRAINT ck_alcance_tipo
  CHECK (tipo_contenido IN ('catalogo_medicion','fuente_clinica'));
ALTER TABLE public.medicion DROP CONSTRAINT ck_medicion_glucosa_positiva, DROP CONSTRAINT ck_medicion_presion_tecnica;
COMMIT;
