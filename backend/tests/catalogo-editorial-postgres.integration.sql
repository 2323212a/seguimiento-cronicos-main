-- Prueba de integración SQL para migración 004.
-- EJECUTAR EXCLUSIVAMENTE en una base PostgreSQL temporal creada para pruebas,
-- después de schema.sql y 004_catalogo_editorial.up.sql. No ejecutar en desarrollo.
-- Todos los usuarios y referencias de este archivo son ficticios y .invalid.
\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE v_tabla text; v_hay_datos boolean;
BEGIN
  IF current_database() <> 'catalogo_editorial_test' THEN
    RAISE EXCEPTION 'Prueba bloqueada: usar exclusivamente catalogo_editorial_test temporal';
  END IF;
  FOREACH v_tabla IN ARRAY ARRAY['usuario','paciente','medico_paciente','seguimiento_paciente','medicion',
    'medicamento','horario_medicamento','alerta','seguimiento_accion','notificacion','reporte',
    'outbox_evento','evento_recibido'] LOOP
    EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I)', v_tabla) INTO v_hay_datos;
    IF v_hay_datos THEN RAISE EXCEPTION 'Prueba bloqueada: public.% no está vacía', v_tabla; END IF;
  END LOOP;
END; $$;

CREATE FUNCTION pg_temp.assert_raises(p_nombre text, p_sql text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
    RAISE EXCEPTION 'ASSERTION_FAILED: se esperaba rechazo: %', p_nombre;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'ASSERTION_FAILED:%' THEN RAISE; END IF;
    RAISE NOTICE 'PASS: %', p_nombre;
  END;
END; $$;

INSERT INTO public.usuario (id_usuario, correo, contrasena_hash, rol, activo) VALUES
  (1,'admin@example.invalid','test-only-placeholder','administrador',true),
  (2,'autor@example.invalid','test-only-placeholder','medico',true),
  (3,'revisor-a@example.invalid','test-only-placeholder','medico',true),
  (4,'revisor-b@example.invalid','test-only-placeholder','medico',true),
  (5,'coordinador@example.invalid','test-only-placeholder','medico',true),
  (6,'publicador@example.invalid','test-only-placeholder','medico',true),
  (7,'inactivo@example.invalid','test-only-placeholder','medico',false),
  (8,'revisor-c@example.invalid','test-only-placeholder','medico',true);

INSERT INTO public.catalogo_medicion (id_catalogo,codigo,nombre,estado)
VALUES (100,'test-editorial','Catálogo de prueba','activo');
INSERT INTO public.fuente_clinica
  (id_fuente,institucion,titulo,identificador,version_documento,url,estado)
VALUES (100,'Institución de prueba','Documento de prueba','DOC-TEST','1','https://example.invalid/doc','vigente');

INSERT INTO public.autorizacion_editorial
  (id_autorizacion,id_usuario,capacidad,concedida_por)
VALUES (100,2,'autor',1),(101,3,'revisor',1),(102,4,'revisor',1),
       (103,5,'coordinador',1),(104,6,'publicador',1),(105,8,'revisor',1);
INSERT INTO public.alcance_editorial
  (id_alcance,id_autorizacion,tipo_contenido,id_catalogo,enfermedad,poblacion)
VALUES (100,100,'catalogo_medicion',100,'diabetes_tipo_1','adulto_18_mas'),
       (101,101,'catalogo_medicion',100,'diabetes_tipo_1','adulto_18_mas'),
       (102,102,'catalogo_medicion',100,'diabetes_tipo_1','adulto_18_mas'),
       (103,103,'catalogo_medicion',100,'diabetes_tipo_1','adulto_18_mas'),
       (104,104,'catalogo_medicion',100,'diabetes_tipo_1','adulto_18_mas'),
       (105,105,'catalogo_medicion',100,'diabetes_tipo_1','adulto_18_mas');

SELECT pg_temp.assert_raises('administrador no puede concederse autorización a sí mismo',
  $$INSERT INTO public.autorizacion_editorial(id_usuario,capacidad,concedida_por)
    VALUES (1,'revisor',1)$$);
SELECT pg_temp.assert_raises('no se autoriza a una cuenta inactiva',
  $$INSERT INTO public.autorizacion_editorial(id_usuario,capacidad,concedida_por)
    VALUES (7,'revisor',1)$$);
SELECT pg_temp.assert_raises('una cuenta no administradora no puede conceder capacidades',
  $$INSERT INTO public.autorizacion_editorial(id_usuario,capacidad,concedida_por)
    VALUES (3,'autor',2)$$);

INSERT INTO public.version_catalogo
  (id_version,id_catalogo,numero_version,enfermedad,poblacion,autor_id_usuario)
VALUES (100,100,'1.0','diabetes_tipo_1','adulto_18_mas',2),
       (101,100,'2.0','diabetes_tipo_1','adulto_18_mas',3);
INSERT INTO public.version_fuente
  (id_version_fuente,id_version,id_fuente,institucion_snapshot,titulo_snapshot,
   identificador_snapshot,version_documento_snapshot,url_snapshot,seccion,pagina)
VALUES (100,100,100,'Institución de prueba','Documento de prueba','DOC-TEST','1',
        'https://example.invalid/doc','Sección de prueba','p. 1');
UPDATE public.version_catalogo SET estado='en_revision', enviada_revision_en=now() WHERE id_version=100;
INSERT INTO public.ronda_revision (id_ronda,id_version,numero_ronda,abierta_por)
VALUES (100,100,1,5),(101,100,2,5),(102,101,1,5),
       (103,100,3,5),(104,100,4,5);
INSERT INTO public.revision_asignada
  (id_revision,id_ronda,id_revisor,id_autorizacion,asignada_por)
VALUES (100,100,3,101,5),(101,100,4,102,5),(102,100,8,105,5),
       (104,102,3,101,5);

INSERT INTO public.aprobacion_catalogo
  (id_aprobacion,id_version,id_ronda,id_revisor,id_autorizacion,decision)
VALUES (100,100,100,3,101,'aprobada'),(101,100,100,4,102,'aprobada');
SELECT pg_temp.assert_raises('decisiones duplicadas en la misma ronda',
  $$INSERT INTO public.aprobacion_catalogo(id_version,id_ronda,id_revisor,id_autorizacion,decision)
    VALUES (100,100,3,101,'aprobada')$$);
SELECT pg_temp.assert_raises('historial de aprobación no se modifica',
  $$UPDATE public.aprobacion_catalogo SET observacion='editada' WHERE id_aprobacion=100$$);
SELECT pg_temp.assert_raises('historial de aprobación no se elimina',
  $$DELETE FROM public.aprobacion_catalogo WHERE id_aprobacion=100$$);
SELECT pg_temp.assert_raises('snapshot bibliográfico se bloquea al enviar versión a revisión',
  $$UPDATE public.version_fuente SET titulo_snapshot='alterado' WHERE id_version_fuente=100$$);

INSERT INTO public.autorizacion_editorial
  (id_autorizacion,id_usuario,capacidad,concedida_por,vigente_desde,vigente_hasta)
VALUES (106,8,'revisor',1,now()-interval '2 days',now()-interval '1 day');
INSERT INTO public.alcance_editorial
  (id_alcance,id_autorizacion,tipo_contenido,id_catalogo,enfermedad,poblacion)
VALUES (106,106,'catalogo_medicion',100,'diabetes_tipo_1','adulto_18_mas');
INSERT INTO public.autorizacion_editorial
  (id_autorizacion,id_usuario,capacidad,concedida_por)
VALUES (107,3,'revisor',1);
INSERT INTO public.alcance_editorial
  (id_alcance,id_autorizacion,tipo_contenido,id_catalogo,enfermedad,poblacion)
VALUES (107,107,'catalogo_medicion',100,'diabetes_tipo_2','adulto_18_mas');
INSERT INTO public.revision_asignada
  (id_revision,id_ronda,id_revisor,id_autorizacion,asignada_por)
VALUES (106,101,8,106,5);
SELECT pg_temp.assert_raises('autorización vencida no permite decidir',
  $$INSERT INTO public.aprobacion_catalogo(id_version,id_ronda,id_revisor,id_autorizacion,decision)
    VALUES (100,101,8,106,'aprobada')$$);
SELECT pg_temp.assert_raises('un revisor sin asignación no puede decidir',
  $$INSERT INTO public.aprobacion_catalogo(id_version,id_ronda,id_revisor,id_autorizacion,decision)
    VALUES (100,101,4,102,'aprobada')$$);

INSERT INTO public.revision_asignada
  (id_revision,id_ronda,id_revisor,id_autorizacion,asignada_por)
VALUES (107,103,3,107,5);
UPDATE public.usuario SET activo=false WHERE id_usuario=4;
INSERT INTO public.revision_asignada
  (id_revision,id_ronda,id_revisor,id_autorizacion,asignada_por)
VALUES (108,104,4,102,5);
SELECT pg_temp.assert_raises('usuario inactivo no puede decidir',
  $$INSERT INTO public.aprobacion_catalogo(id_version,id_ronda,id_revisor,id_autorizacion,decision)
    VALUES (100,104,4,102,'aprobada')$$);
UPDATE public.usuario SET activo=true WHERE id_usuario=4;
SELECT pg_temp.assert_raises('decisión rechazada si la autorización no cubre enfermedad/población',
  $$INSERT INTO public.aprobacion_catalogo(id_version,id_ronda,id_revisor,id_autorizacion,decision)
    VALUES (100,103,3,107,'aprobada')$$);

SELECT pg_temp.assert_raises('el autor no puede aprobar su propia versión',
  $$INSERT INTO public.aprobacion_catalogo(id_version,id_ronda,id_revisor,id_autorizacion,decision)
    VALUES (101,102,3,101,'aprobada')$$);
UPDATE public.ronda_revision SET estado='cerrada',cerrada_por=5,cerrada_en=now()
WHERE id_ronda=100;
SELECT pg_temp.assert_raises('una ronda cerrada no acepta decisiones nuevas',
  $$INSERT INTO public.aprobacion_catalogo(id_version,id_ronda,id_revisor,id_autorizacion,decision)
    VALUES (100,100,8,105,'aprobada')$$);
SELECT pg_temp.assert_raises('ronda cerrada conserva su registro de cierre',
  $$UPDATE public.ronda_revision SET motivo_cierre='cambio' WHERE id_ronda=100$$);

UPDATE public.autorizacion_editorial
SET estado='revocada',revocada_por=1,revocada_en=now(),motivo_revocacion='prueba temporal'
WHERE id_autorizacion=100;
SELECT pg_temp.assert_raises('revocación de autorización es inmutable',
  $$UPDATE public.autorizacion_editorial SET motivo_revocacion='alterado' WHERE id_autorizacion=100$$);
SELECT pg_temp.assert_raises('alcance concedido no se edita',
  $$UPDATE public.alcance_editorial SET poblacion='adolescente_13_17' WHERE id_alcance=101$$);
SELECT pg_temp.assert_raises('no se borra historial editorial',
  $$DELETE FROM public.version_catalogo WHERE id_version=100$$);
UPDATE public.fuente_clinica
SET estado='retirada',revisada_en=now(),motivo_estado='retiro temporal'
WHERE id_fuente=100;
SELECT pg_temp.assert_raises('fuente retirada no se reactiva directamente',
  $$UPDATE public.fuente_clinica SET estado='vigente' WHERE id_fuente=100$$);

INSERT INTO public.version_catalogo
  (id_version,id_catalogo,numero_version,estado,autor_id_usuario,publicada_en,publicada_por)
VALUES (200,100,'current-a','vigente',2,now(),6);
SELECT pg_temp.assert_raises('índice parcial impide dos versiones vigentes por catálogo',
  $$INSERT INTO public.version_catalogo
      (id_catalogo,numero_version,estado,autor_id_usuario,publicada_en,publicada_por)
    VALUES (100,'current-b','vigente',2,now(),6)$$);

ROLLBACK;
