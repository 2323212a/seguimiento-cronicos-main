import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GestionEditorialCatalogo } from '../src/application/use-cases/GestionEditorialCatalogo.js';
import { PgCatalogoEditorialRepository } from '../src/infrastructure/persistence/postgres/PgCatalogoEditorialRepository.js';
import { crearApp } from '../src/infrastructure/http/crearApp.js';
import { Jwt } from '../src/infrastructure/security/Jwt.js';
import { Csrf } from '../src/infrastructure/security/Csrf.js';
import { readFile } from 'node:fs/promises';
import { AutorizacionEditorial, VersionCatalogo } from '../src/domain/Editorial.js';

const secret='test-editorial-secret-at-least-thirty-two-characters-long';

function baseDePublicacion({decisiones=null,actorId=13,autorId=10,inactivos=[],autorizacion=true,estadoFuente='vigente',sinFuentes=false,snapshotCompleto=true,estadoCatalogo='activo',estadoRonda='cerrada'}={}) {
  const sql=[]; let rollback=false;
  const votos=decisiones??[
    {id_aprobacion:1,id_revisor:11,id_autorizacion:21,decision:'aprobada',revision_estado:'completada'},
    {id_aprobacion:2,id_revisor:12,id_autorizacion:22,decision:'aprobada',revision_estado:'completada'},
  ];
  const db={transaccion:async(fn)=>{try{return await fn({query:async(q,p=[])=>{
    sql.push(q);
    if(q.includes('SELECT * FROM public.version_catalogo WHERE id_version=$1'))return {rows:[{id_version:4,id_catalogo:3,estado:'aprobada',autor_id_usuario:autorId,tipo_contenido:'catalogo_medicion',enfermedad:'diabetes_tipo_1',poblacion:'adulto_18_mas'}]};
    if(q.includes('SELECT * FROM public.catalogo_medicion'))return {rows:[{id_catalogo:3,estado:estadoCatalogo}]};
    if(q.includes('SELECT * FROM public.ronda_revision'))return {rows:estadoRonda==='cerrada'?[{id_ronda:5,id_version:4,estado:estadoRonda}]:[]};
    if(q.includes('SELECT a.*,ra.estado'))return {rows:votos};
    if(q.includes('SELECT id_usuario,activo'))return {rows:[autorId,actorId,...votos.map(x=>x.id_revisor)].map(id_usuario=>({id_usuario,activo:!inactivos.includes(Number(id_usuario))}))};
    if(q.includes('SELECT activo FROM public.usuario'))return {rows:[{activo:!inactivos.includes(Number(p[0]))}]};
    if(q.includes('FROM public.alcance_editorial WHERE id_autorizacion'))return {rows:[{tipoContenido:'catalogo_medicion',idCatalogo:null,enfermedad:null,poblacion:null},{tipoContenido:'fuente_clinica',idCatalogo:null,enfermedad:null,poblacion:null}]};
    if(q.includes('FROM public.autorizacion_editorial ae'))return {rows:autorizacion?[{id_autorizacion:p[6]??30,idUsuario:Number(p[0]),capacidad:p[1],estado:'activa',vigenteDesde:new Date('2020-01-01T00:00:00Z'),vigenteHasta:null,usuario_activo:true}]:[]};
    if(q.includes('FROM public.version_fuente vf')) {
      const rows=sinFuentes?[]:[{estado_fuente:estadoFuente,institucion_snapshot:'Institución',titulo_snapshot:'Documento',url_snapshot:'https://example.invalid/doc',poblacion_snapshot:snapshotCompleto?'adultos':null,seccion:snapshotCompleto?'sección 1':null}];
      return {rowCount:rows.length,rows};
    }
    if(q.includes("estado='vigente' FOR UPDATE"))return {rows:[]};
    return {rows:[],rowCount:1};
  }});}catch(e){rollback=true;throw e;}}};
  return {db,sql,rollback:()=>rollback};
}

test('el caso de uso toma el actor de su argumento y limita operaciones', async()=>{
  const calls=[]; const uc=new GestionEditorialCatalogo({catalogoEditorialRepository:{ejecutar:async(op,data)=>{calls.push([op,data]);return {ok:true};}}});
  await uc.ejecutar('crearCatalogo',17,{actorId:999,codigo:'x'});
  assert.equal(calls[0][1].actorId,17);
  assert.throws(()=>uc.ejecutar('sqlArbitrario',17,{}),/no soportada/);
});

test('el dominio editorial comprueba vigencia, cuenta y alcance sin elevar al administrador',()=>{
  const grant=new AutorizacionEditorial({idUsuario:9,capacidad:'revisor',estado:'activa',vigenteDesde:'2026-01-01T00:00:00Z',alcances:[{tipoContenido:'catalogo_medicion',idCatalogo:4,enfermedad:'diabetes_tipo_1',poblacion:'adulto_18_mas'}]});
  const base={usuarioActivo:true,capacidad:'revisor',tipoContenido:'catalogo_medicion',idCatalogo:4,enfermedad:'diabetes_tipo_1',poblacion:'adulto_18_mas',ahora:new Date('2026-02-01T00:00:00Z')};
  assert.equal(grant.permite(base),true);
  assert.equal(grant.permite({...base,usuarioActivo:false}),false);
  assert.equal(grant.permite({...base,capacidad:'publicador'}),false);
  assert.equal(grant.permite({...base,poblacion:'adolescente_13_17'}),false);
  const expired=new AutorizacionEditorial({idUsuario:9,capacidad:'revisor',estado:'activa',vigenteDesde:'2025-01-01T00:00:00Z',vigenteHasta:'2026-01-01T00:00:00Z',alcances:grant.alcances});
  assert.equal(expired.permite(base),false);
  const revoked=new AutorizacionEditorial({idUsuario:9,capacidad:'revisor',estado:'revocada',revocadaEn:'2026-01-15',vigenteDesde:'2025-01-01',alcances:grant.alcances});
  assert.equal(revoked.permite(base),false);
  const version=new VersionCatalogo({estado:'aprobada',tipoContenido:'catalogo_medicion'});
  assert.equal(version.puedeTransicionarA('vigente'),true);
  assert.equal(version.puedeTransicionarA('borrador'),false);
});

test('la concesión editorial requiere administrador activo y prohíbe autoconcesión',async()=>{
  const sql=[]; const client={query:async(q,p=[])=>{sql.push(q); if(q.includes('FROM public.usuario WHERE id_usuario=ANY')) return {rows:[{id_usuario:1,rol:'administrador',activo:true},{id_usuario:2,rol:'medico',activo:true}]}; if(q.includes('INSERT INTO public.autorizacion_editorial'))return {rows:[{id:8}]}; return {rows:[],rowCount:1};}};
  const repo=new PgCatalogoEditorialRepository({transaccion:fn=>fn(client)});
  const ok=await repo.concederAutorizacion({actorId:1,idUsuario:2,capacidad:'autor',alcances:[{tipoContenido:'catalogo_medicion'}]});
  assert.equal(ok.estado,'activa'); assert.ok(sql.some(x=>x.includes('INSERT INTO public.alcance_editorial')));
  await assert.rejects(()=>repo.concederAutorizacion({actorId:2,idUsuario:2,capacidad:'autor',alcances:[{tipoContenido:'catalogo_medicion'}]}),{name:'Conflicto'});
  const nonAdmin=new PgCatalogoEditorialRepository({transaccion:fn=>fn({query:async(q)=>q.includes('FROM public.usuario WHERE id_usuario=ANY')?{rows:[{id_usuario:1,rol:'medico',activo:true},{id_usuario:2,rol:'paciente',activo:true}]}:{rows:[]}})});
  await assert.rejects(()=>nonAdmin.concederAutorizacion({actorId:1,idUsuario:2,capacidad:'autor',alcances:[{tipoContenido:'catalogo_medicion'}]}),{name:'NoAutorizado'});
});

test('la publicación verifica quorum antes de mutar y usa una transacción',async()=>{
  const statements=[]; let rolled=false;
  const db={transaccion:async(fn)=>{try{return await fn({query:async(q,p=[])=>{statements.push(q); if(q.includes('SELECT * FROM public.version_catalogo WHERE id_version=$1'))return {rows:[{id_version:4,id_catalogo:3,estado:'aprobada',autor_id_usuario:10,tipo_contenido:'catalogo_medicion',enfermedad:'diabetes_tipo_1',poblacion:'adulto_18_mas'}]}; if(q.includes('SELECT * FROM public.catalogo_medicion'))return {rows:[{id_catalogo:3,estado:'activo'}]}; if(q.includes('SELECT * FROM public.ronda_revision'))return {rows:[{id_ronda:5,id_version:4,estado:'cerrada'}]}; if(q.includes('SELECT a.*,ra.estado'))return {rows:[{id_aprobacion:1,id_revisor:11,id_autorizacion:21,decision:'aprobada',revision_estado:'completada'},{id_aprobacion:2,id_revisor:12,id_autorizacion:22,decision:'aprobada',revision_estado:'completada'}]}; if(q.includes('SELECT activo FROM public.usuario'))return {rows:[{activo:true}]}; if(q.includes('SELECT id_usuario,activo'))return {rows:[10,11,12,13].map(id_usuario=>({id_usuario,activo:true}))}; if(q.includes('FROM public.alcance_editorial WHERE id_autorizacion'))return {rows:[{tipoContenido:'catalogo_medicion',idCatalogo:null,enfermedad:null,poblacion:null},{tipoContenido:'fuente_clinica',idCatalogo:null,enfermedad:null,poblacion:null}]}; if(q.includes('FROM public.autorizacion_editorial ae'))return {rows:[{id_autorizacion:p[6]??23,idUsuario:Number(p[0]),capacidad:p[1],estado:'activa',vigenteDesde:new Date('2020-01-01T00:00:00Z'),vigenteHasta:null,usuario_activo:true}]}; if(q.includes('FROM public.version_fuente vf'))return {rowCount:1,rows:[{estado_fuente:'vigente',institucion_snapshot:'I',titulo_snapshot:'T',url_snapshot:'https://example.test',poblacion_snapshot:'adultos',seccion:'sección 1'}]}; if(q.includes("estado='vigente' FOR UPDATE"))return {rows:[]}; return {rows:[],rowCount:1};}});}catch(e){rolled=true;throw e;}}};
  const repo=new PgCatalogoEditorialRepository(db);
  const result=await repo.publicarVersion({actorId:13,idVersion:4});
  assert.equal(result.estado,'vigente'); assert.equal(rolled,false);
  assert.ok(statements.some(q=>q.includes("SET estado='vigente',publicada_en=now()")));
  assert.ok(statements.some(q=>q.includes('INSERT INTO public.catalogo_auditoria')));
});

test('publicación insuficiente aborta antes de actualizar versiones',async()=>{
  const state=baseDePublicacion({decisiones:[{id_revisor:11,id_autorizacion:21,decision:'aprobada',revision_estado:'completada'}]});
  await assert.rejects(()=>new PgCatalogoEditorialRepository(state.db).publicarVersion({actorId:13,idVersion:4}),{name:'Conflicto'});
  assert.equal(state.sql.some(q=>q.startsWith('UPDATE public.version_catalogo SET estado=\'vigente\'')),false);
  assert.equal(state.rollback(),true);
});

test('publicación rechaza decisiones negativas, usuarios inactivos, alcance revocado y fuentes no vigentes',async()=>{
  const escenarios=[
    {decisiones:[{id_revisor:11,id_autorizacion:21,decision:'aprobada'},{id_revisor:12,id_autorizacion:22,decision:'rechazada'}]},
    {decisiones:[{id_revisor:11,id_autorizacion:21,decision:'aprobada'},{id_revisor:12,id_autorizacion:22,decision:'requiere_cambios'}]},
    {inactivos:[11]},
    {autorizacion:false},
    {estadoFuente:'retirada'},
    {sinFuentes:true},
    {snapshotCompleto:false},
    {estadoCatalogo:'retirado'},
    {estadoRonda:'abierta'},
  ];
  for(const escenario of escenarios){
    const state=baseDePublicacion(escenario);
    await assert.rejects(()=>new PgCatalogoEditorialRepository(state.db).publicarVersion({actorId:escenario.actorId??13,idVersion:4}),error=>['NoEncontrado','Conflicto','NoAutorizado'].includes(error.name));
    assert.equal(state.sql.some(q=>q.startsWith('UPDATE public.version_catalogo SET estado=\'vigente\'')),false);
    assert.equal(state.rollback(),true);
  }
});

test('publicador y autor no pueden ser revisores ni entre sí; catálogo serializa antes de bloquear versión',async()=>{
  for(const actorId of [10,11]){
    const state=baseDePublicacion({actorId});
    await assert.rejects(()=>new PgCatalogoEditorialRepository(state.db).publicarVersion({actorId,idVersion:4}),{name:'Conflicto'});
  }
  const state=baseDePublicacion();
  await new PgCatalogoEditorialRepository(state.db).publicarVersion({actorId:13,idVersion:4});
  const catalogLock=state.sql.findIndex(q=>q.includes('SELECT * FROM public.catalogo_medicion')&&q.includes('FOR UPDATE'));
  const versionLock=state.sql.findIndex(q=>q.includes('SELECT * FROM public.version_catalogo WHERE id_version=$1 FOR UPDATE'));
  assert.ok(catalogLock>=0&&versionLock>catalogLock);
});

test('endpoint editorial toma actor del JWT y no del body',async(t)=>{
  let called; const actor={id:42,correo:'admin@example.test',rol:'administrador',activo:true};
  const server=crearApp({casosDeUso:{gestionEditorialCatalogo:{ejecutar:async(...args)=>{called=args;return {ok:true};}}},
    usuarioRepository:{buscarActual:async()=>actor},jwt:new Jwt({secreto:secret}),csrf:new Csrf(secret),origenesPermitidos:['http://localhost:5173']}).listen(0);
  t.after(()=>server.close());
  const csrf=new Csrf(secret).crear(); const token=new Jwt({secreto:secret}).firmar({sub:42});
  const r=await fetch(`http://localhost:${server.address().port}/api/admin/editorial/autorizaciones`,{method:'POST',headers:{'content-type':'application/json',cookie:`sesion=${encodeURIComponent(token)}; csrf_token=${encodeURIComponent(csrf)}`,'x-csrf-token':csrf},body:JSON.stringify({actorId:999,idUsuario:8,capacidad:'autor',alcances:[{tipoContenido:'catalogo_medicion'}]})});
  assert.equal(r.status,200); assert.equal(called[1],42); assert.equal(called[2].actorId,undefined);
});

test('migración declara historial inmutable, llaves compuestas y rollback protegido',async()=>{
  const up=await readFile(new URL('../migrations/004_catalogo_editorial.up.sql',import.meta.url),'utf8');
  const down=await readFile(new URL('../migrations/004_catalogo_editorial.down.sql',import.meta.url),'utf8');
  assert.match(up,/UNIQUE \(id_ronda, id_revisor\)/);
  assert.match(up,/FOREIGN KEY \(id_ronda, id_version\)/);
  assert.match(up,/BEFORE UPDATE OR DELETE ON public\.aprobacion_catalogo/);
  assert.match(up,/BEFORE INSERT OR UPDATE OR DELETE ON public\.version_fuente/);
  assert.match(up,/CREATE UNIQUE INDEX uq_version_catalogo_vigente/);
  assert.match(up,/La concesión requiere un administrador activo/);
  assert.doesNotMatch(up,/CREATE TRIGGER trg_evaluar_medicion/);
  assert.doesNotMatch(up,/ALTER TABLE public\.(usuario|paciente|medicion|alerta)/);
  assert.equal([...up.matchAll(/CREATE TABLE public\./g)].length,10);
  assert.match(up,/FOREACH v_tabla IN ARRAY/);
  assert.match(down,/IF v_hay_datos THEN/);
  for(const tabla of ['usuario','paciente','medico_paciente','seguimiento_paciente','medicion','medicamento','horario_medicamento','alerta','seguimiento_accion','notificacion','reporte','outbox_evento','evento_recibido']) assert.doesNotMatch(down,new RegExp(`DROP TABLE public\\.${tabla}`));
  assert.doesNotMatch(up,/CREATE TABLE public\.(diagnostico|objetivo|interpretacion|alerta_clinica)/);
});
