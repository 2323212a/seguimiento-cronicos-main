-- Solo ejecutar después de probar el evaluador backend y coordinar ALERTAS_BACKEND_ACTIVAS.
BEGIN;
DROP TRIGGER IF EXISTS trg_evaluar_medicion ON public.medicion;
-- La función public.evaluar_medicion_alerta() se conserva para permitir rollback.
COMMIT;
