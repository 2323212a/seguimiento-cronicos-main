-- Rollback 005: nunca elimina objetivos, alertas o historial que ya se hayan usado.
BEGIN;
DO $$
BEGIN
  IF to_regclass('public.objetivo_medicion') IS NULL OR to_regclass('public.alerta_historial') IS NULL THEN
    RAISE EXCEPTION 'Rollback 005 abortado: faltan objetos esperados';
  END IF;
  IF EXISTS (SELECT 1 FROM public.objetivo_medicion)
     OR EXISTS (SELECT 1 FROM public.alerta WHERE id_objetivo IS NOT NULL)
     OR EXISTS (SELECT 1 FROM public.alerta_historial) THEN
    RAISE EXCEPTION 'Rollback 005 abortado: conserva objetivos y auditoría; requiere exportación y procedimiento explícito';
  END IF;
END $$;

DROP TRIGGER trg_historial_alerta_inmutable ON public.alerta_historial;
DROP TRIGGER trg_historial_alerta_estado ON public.alerta;
DROP TRIGGER trg_historial_alerta_insert ON public.alerta;
DROP FUNCTION public.inmutabilidad_historial_alerta();
DROP FUNCTION public.registrar_historial_alerta();
DROP TABLE public.alerta_historial;
DROP INDEX public.idx_alerta_revision;
DROP INDEX public.uq_alerta_objetivo_medicion;
ALTER TABLE public.alerta DROP CONSTRAINT ck_alerta_objetivo_datos;
ALTER TABLE public.alerta DROP CONSTRAINT fk_alerta_objetivo;
ALTER TABLE public.alerta DROP COLUMN indicacion_paciente, DROP COLUMN clasificacion, DROP COLUMN id_objetivo;
DROP TRIGGER trg_validar_objetivo_medicion ON public.objetivo_medicion;
DROP FUNCTION public.validar_objetivo_medicion();
DROP INDEX public.idx_objetivo_medico;
DROP INDEX public.idx_objetivo_paciente_fecha;
DROP INDEX public.uq_objetivo_medicion_vigente;
DROP TABLE public.objetivo_medicion;
COMMIT;
