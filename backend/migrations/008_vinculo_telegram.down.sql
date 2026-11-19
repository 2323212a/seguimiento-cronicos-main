-- No deshacer si ya existen vinculaciones verificadas o códigos vigentes.
BEGIN;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.paciente WHERE telegram_verificado)
     OR EXISTS (SELECT 1 FROM public.telegram_vinculo WHERE consumido_en IS NULL) THEN
    RAISE EXCEPTION 'Rollback 008 cancelado: existen vinculaciones verificadas o códigos pendientes';
  END IF;
END $$;
DROP INDEX public.idx_telegram_vinculo_pendiente;
DROP TABLE public.telegram_vinculo;
DROP INDEX public.uq_paciente_telegram_chat_verificado;
ALTER TABLE public.paciente DROP CONSTRAINT ck_paciente_telegram_verificado;
ALTER TABLE public.paciente DROP COLUMN telegram_verificado_en, DROP COLUMN telegram_verificado;
COMMIT;
