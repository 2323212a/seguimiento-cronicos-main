-- Rollback destructivo de tablas nuevas: solo ejecutar tras exportar y vaciar eventos.
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.outbox_evento) OR EXISTS (SELECT 1 FROM public.evento_recibido) THEN
    RAISE EXCEPTION 'Outbox contiene historial; exporta/vacía los eventos antes de revertir';
  END IF;
END $$;
DROP TABLE public.evento_recibido;
DROP TABLE public.outbox_evento;
COMMIT;
