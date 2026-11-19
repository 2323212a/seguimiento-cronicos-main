-- Revierte la unicidad por paciente, restaurando la regla previa por pareja.
BEGIN;
CREATE UNIQUE INDEX uq_medico_paciente_activo
  ON public.medico_paciente (id_medico, id_paciente) WHERE activo = TRUE;
CREATE UNIQUE INDEX uq_seguimiento_paciente_activo
  ON public.seguimiento_paciente (id_seguimiento, id_paciente) WHERE activo = TRUE;
DROP INDEX public.uq_mp_un_medico_activo_paciente;
DROP INDEX public.uq_sp_una_persona_activa_paciente;
ALTER TABLE public.usuario ALTER COLUMN activo SET DEFAULT TRUE;
COMMIT;
