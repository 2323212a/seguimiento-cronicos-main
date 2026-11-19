-- Solo lectura. Revisar resultados manualmente antes de ejecutar 001.
SELECT id_paciente, COUNT(*) AS activas
FROM public.medico_paciente
WHERE activo = TRUE
GROUP BY id_paciente
HAVING COUNT(*) > 1;

SELECT id_paciente, COUNT(*) AS activas
FROM public.seguimiento_paciente
WHERE activo = TRUE
GROUP BY id_paciente
HAVING COUNT(*) > 1;
