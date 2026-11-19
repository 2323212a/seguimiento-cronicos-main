BEGIN;
CREATE TRIGGER trg_evaluar_medicion
AFTER INSERT ON public.medicion
FOR EACH ROW EXECUTE FUNCTION public.evaluar_medicion_alerta();
COMMIT;
