-- Rollback protegido: aborta si la migración ya contiene historial editorial.
BEGIN;
DO $$
DECLARE v_tabla text; v_hay_datos boolean;
BEGIN
  FOREACH v_tabla IN ARRAY ARRAY['catalogo_auditoria','aprobacion_catalogo','revision_asignada','ronda_revision',
    'version_fuente','alcance_editorial','autorizacion_editorial','version_catalogo','fuente_clinica','catalogo_medicion'] LOOP
    IF to_regclass('public.' || v_tabla) IS NULL THEN
      RAISE EXCEPTION 'Rollback 004 abortado: falta public.%; revisar estado de migración', v_tabla;
    END IF;
    EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I)', v_tabla) INTO v_hay_datos;
    IF v_hay_datos THEN
      RAISE EXCEPTION 'Rollback 004 abortado: public.% contiene historial/datos; respalde y autorice una estrategia explícita', v_tabla;
    END IF;
  END LOOP;
END $$;

DROP TRIGGER IF EXISTS trg_ronda_cerrada_inmutable ON public.ronda_revision;
DROP TRIGGER IF EXISTS trg_transicion_fuente ON public.fuente_clinica;
DROP TRIGGER IF EXISTS trg_validar_estado_catalogo ON public.catalogo_medicion;
DROP TRIGGER IF EXISTS trg_proteger_version_catalogo ON public.version_catalogo;
DROP TRIGGER IF EXISTS trg_no_borrar_catalogo ON public.catalogo_medicion;
DROP TRIGGER IF EXISTS trg_no_borrar_version ON public.version_catalogo;
DROP TRIGGER IF EXISTS trg_no_borrar_fuente ON public.fuente_clinica;
DROP TRIGGER IF EXISTS trg_no_borrar_autorizacion ON public.autorizacion_editorial;
DROP TRIGGER IF EXISTS trg_no_borrar_alcance ON public.alcance_editorial;
DROP TRIGGER IF EXISTS trg_no_borrar_ronda ON public.ronda_revision;
DROP TRIGGER IF EXISTS trg_no_borrar_revision ON public.revision_asignada;
DROP TRIGGER IF EXISTS trg_no_borrar_version_fuente ON public.version_fuente;
DROP TRIGGER IF EXISTS trg_proteger_revision_asignada ON public.revision_asignada;
DROP TRIGGER IF EXISTS trg_proteger_alcance_editorial ON public.alcance_editorial;
DROP TRIGGER IF EXISTS trg_snapshot_editorial_inmutable ON public.version_fuente;
DROP TRIGGER IF EXISTS trg_validar_aprobacion_editorial ON public.aprobacion_catalogo;
DROP TRIGGER IF EXISTS trg_auditoria_inmutable ON public.catalogo_auditoria;
DROP TRIGGER IF EXISTS trg_aprobacion_inmutable ON public.aprobacion_catalogo;
DROP TRIGGER IF EXISTS trg_validar_autorizacion_editorial ON public.autorizacion_editorial;

DROP FUNCTION IF EXISTS public.proteger_aprobacion_ronda();
DROP FUNCTION IF EXISTS public.validar_transicion_fuente();
DROP FUNCTION IF EXISTS public.proteger_version_catalogo();
DROP FUNCTION IF EXISTS public.proteger_revision_asignada();
DROP FUNCTION IF EXISTS public.proteger_alcance_editorial();
DROP FUNCTION IF EXISTS public.prohibir_borrado_editorial();
DROP FUNCTION IF EXISTS public.proteger_snapshot_editorial();
DROP FUNCTION IF EXISTS public.validar_aprobacion_editorial();
DROP FUNCTION IF EXISTS public.bloquear_historial_editorial();
DROP FUNCTION IF EXISTS public.validar_autorizacion_editorial();
DROP FUNCTION IF EXISTS public.validar_estado_catalogo();

DROP TABLE public.catalogo_auditoria;
DROP TABLE public.aprobacion_catalogo;
DROP TABLE public.revision_asignada;
DROP TABLE public.ronda_revision;
DROP TABLE public.version_fuente;
DROP TABLE public.alcance_editorial;
DROP TABLE public.autorizacion_editorial;
DROP TABLE public.version_catalogo;
DROP TABLE public.fuente_clinica;
DROP TABLE public.catalogo_medicion;
COMMIT;
