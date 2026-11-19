-- Fixture de integración. Exclusivo para la base vacía temporal catalogo_editorial_test.
\set ON_ERROR_STOP on
DO $$
DECLARE v_tabla text; v_hay_datos boolean;
BEGIN
  IF current_database() <> 'catalogo_editorial_test' THEN
    RAISE EXCEPTION 'Fixture bloqueado: usar exclusivamente catalogo_editorial_test temporal';
  END IF;
  FOREACH v_tabla IN ARRAY ARRAY['usuario','paciente','medico_paciente','seguimiento_paciente','medicion',
    'medicamento','horario_medicamento','alerta','seguimiento_accion','notificacion','reporte',
    'outbox_evento','evento_recibido'] LOOP
    EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I)', v_tabla) INTO v_hay_datos;
    IF v_hay_datos THEN RAISE EXCEPTION 'Fixture bloqueado: public.% no está vacía', v_tabla; END IF;
  END LOOP;
END; $$;

INSERT INTO public.usuario (id_usuario,correo,contrasena_hash,rol,activo) VALUES
  (1,'admin@example.invalid','test-only-placeholder','administrador',true),
  (2,'author@example.invalid','test-only-placeholder','medico',true),
  (3,'reviewer-a@example.invalid','test-only-placeholder','medico',true),
  (4,'reviewer-b@example.invalid','test-only-placeholder','medico',true),
  (5,'publisher@example.invalid','test-only-placeholder','medico',true);
INSERT INTO public.catalogo_medicion (id_catalogo,codigo,nombre,estado)
VALUES (100,'integration-test','Temporary editorial catalog','activo');
INSERT INTO public.fuente_clinica
  (id_fuente,institucion,titulo,identificador,version_documento,poblacion,url,estado)
VALUES (100,'Test institution','Test reference','TEST-100','test-only','adult test scope',
        'https://example.invalid/reference','vigente');
INSERT INTO public.autorizacion_editorial
  (id_autorizacion,id_usuario,capacidad,concedida_por)
VALUES (100,2,'autor',1),(101,3,'revisor',1),(102,4,'revisor',1),(103,5,'publicador',1);
INSERT INTO public.alcance_editorial
  (id_alcance,id_autorizacion,tipo_contenido,id_catalogo,enfermedad,poblacion)
VALUES (100,100,'catalogo_medicion',100,'diabetes_tipo_1','adulto_18_mas'),
       (101,101,'catalogo_medicion',100,'diabetes_tipo_1','adulto_18_mas'),
       (102,102,'catalogo_medicion',100,'diabetes_tipo_1','adulto_18_mas'),
       (103,103,'catalogo_medicion',100,'diabetes_tipo_1','adulto_18_mas');
INSERT INTO public.version_catalogo
  (id_version,id_catalogo,numero_version,enfermedad,poblacion,autor_id_usuario)
VALUES (1001,100,'1.0','diabetes_tipo_1','adulto_18_mas',2),
       (1002,100,'2.0','diabetes_tipo_1','adulto_18_mas',2),
       (1003,100,'3.0','diabetes_tipo_1','adulto_18_mas',2);
INSERT INTO public.version_fuente
  (id_version_fuente,id_version,id_fuente,institucion_snapshot,titulo_snapshot,
   identificador_snapshot,version_documento_snapshot,poblacion_snapshot,url_snapshot,seccion)
VALUES (1001,1001,100,'Test institution','Test reference','TEST-100','test-only','adult test scope',
        'https://example.invalid/reference','test section'),
       (1002,1002,100,'Test institution','Test reference','TEST-100','test-only','adult test scope',
        'https://example.invalid/reference','test section'),
       (1003,1003,100,'Test institution','Test reference','TEST-100','test-only','adult test scope',
        'https://example.invalid/reference','test section');
UPDATE public.version_catalogo SET estado='en_revision',enviada_revision_en=now()
WHERE id_version IN (1001,1002,1003);
INSERT INTO public.ronda_revision (id_ronda,id_version,numero_ronda,abierta_por)
VALUES (1001,1001,1,1),(1002,1002,1,1),(1003,1003,1,1);
INSERT INTO public.revision_asignada
  (id_revision,id_ronda,id_revisor,id_autorizacion,asignada_por)
VALUES (10011,1001,3,101,1),(10012,1001,4,102,1),
       (10021,1002,3,101,1),(10022,1002,4,102,1),
       (10031,1003,3,101,1),(10032,1003,4,102,1);
INSERT INTO public.aprobacion_catalogo
  (id_aprobacion,id_version,id_ronda,id_revisor,id_autorizacion,decision)
VALUES (10011,1001,1001,3,101,'aprobada'),(10012,1001,1001,4,102,'aprobada'),
       (10021,1002,1002,3,101,'aprobada'),(10022,1002,1002,4,102,'aprobada'),
       (10031,1003,1003,3,101,'aprobada'),(10032,1003,1003,4,102,'aprobada');
UPDATE public.revision_asignada SET estado='completada',completada_en=now()
WHERE id_revision IN (10011,10012,10021,10022,10031,10032);
UPDATE public.version_catalogo SET estado='aprobada'
WHERE id_version IN (1001,1002,1003);
UPDATE public.ronda_revision SET estado='cerrada',cerrada_por=1,cerrada_en=now()
WHERE id_ronda IN (1001,1002,1003);
