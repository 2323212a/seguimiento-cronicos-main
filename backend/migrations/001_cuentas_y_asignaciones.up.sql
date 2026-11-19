-- Ejecutar solo después de revisar asignaciones activas duplicadas.
-- Las filas históricas se conservan; el índice nuevo se crea antes de retirar el anterior.
BEGIN;
ALTER TABLE public.usuario ALTER COLUMN activo SET DEFAULT FALSE;

CREATE UNIQUE INDEX uq_mp_un_medico_activo_paciente
  ON public.medico_paciente (id_paciente) WHERE activo = TRUE;
CREATE UNIQUE INDEX uq_sp_una_persona_activa_paciente
  ON public.seguimiento_paciente (id_paciente) WHERE activo = TRUE;

DROP INDEX public.uq_medico_paciente_activo;
DROP INDEX public.uq_seguimiento_paciente_activo;

COMMIT;
