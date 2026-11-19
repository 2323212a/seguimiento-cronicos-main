import { Conflicto, NoAutorizado, NoEncontrado } from '../../../domain/errors.js';

const rolDe = { medico: 'medico', seguimiento: 'seguimiento' };
const tablaDe = { medico: 'medico_paciente', seguimiento: 'seguimiento_paciente' };
const columnaDe = { medico: 'id_medico', seguimiento: 'id_seguimiento' };

export class PgAsignacionRepository {
  constructor(db) { this.db = db; }

  async asignar({ actorId, idPaciente, idProfesional, tipo }) {
    if (!tablaDe[tipo]) throw new Conflicto('Tipo de asignación inválido');
    const tabla = tablaDe[tipo]; const profesionalCol = columnaDe[tipo];
    return this.db.transaccion(async (client) => {
      const pacienteBase = await client.query('SELECT id_usuario FROM paciente WHERE id_paciente = $1', [idPaciente]);
      if (!pacienteBase.rows[0]) throw new NoEncontrado('Paciente no encontrado');
      const ids = [...new Set([Number(actorId), Number(idProfesional), Number(pacienteBase.rows[0].id_usuario)])].sort((a, b) => a - b);
      const { rows: usuarios } = await client.query(
        'SELECT id_usuario, rol, activo FROM usuario WHERE id_usuario = ANY($1::int[]) ORDER BY id_usuario FOR UPDATE', [ids]);
      const actor = usuarios.find((u) => Number(u.id_usuario) === Number(actorId));
      const prof = usuarios.find((u) => Number(u.id_usuario) === Number(idProfesional));
      const cuentaPaciente = usuarios.find((u) => Number(u.id_usuario) === Number(pacienteBase.rows[0].id_usuario));
      if (!actor?.activo || actor.rol !== 'administrador') throw new NoAutorizado('Se requiere administrador activo');
      if (!prof?.activo || prof.rol !== rolDe[tipo]) throw new Conflicto('La cuenta profesional debe estar activa y tener el rol requerido');
      if (!cuentaPaciente?.activo || cuentaPaciente.rol !== 'paciente') throw new Conflicto('La cuenta del paciente no está activa');

      const paciente = await client.query('SELECT id_paciente FROM paciente WHERE id_paciente = $1 FOR UPDATE', [idPaciente]);
      if (!paciente.rowCount) throw new NoEncontrado('Paciente no encontrado');
      const actual = await client.query(`SELECT id_asignacion, ${profesionalCol} AS profesional FROM ${tabla} WHERE id_paciente = $1 AND activo FOR UPDATE`, [idPaciente]);
      if (actual.rows[0] && Number(actual.rows[0].profesional) === Number(idProfesional)) return { id: actual.rows[0].id_asignacion, idPaciente: Number(idPaciente), idProfesional: Number(idProfesional), tipo, activo: true };
      if (actual.rows[0]) await client.query(`UPDATE ${tabla} SET activo = FALSE WHERE id_asignacion = $1`, [actual.rows[0].id_asignacion]);
      const { rows } = await client.query(
        `INSERT INTO ${tabla} (${profesionalCol}, id_paciente, id_usuario_asignador, activo)
         VALUES ($1, $2, $3, TRUE) RETURNING id_asignacion`, [idProfesional, idPaciente, actorId]);
      return { id: rows[0].id_asignacion, idPaciente: Number(idPaciente), idProfesional: Number(idProfesional), tipo, activo: true };
    });
  }

  async listarParaAdministrador() {
    const { rows } = await this.db.query(
      `SELECT 'medico' AS tipo, mp.id_asignacion AS id, mp.id_paciente,
              p.id_usuario AS id_usuario_paciente, up.correo AS correo_paciente,
              mp.id_medico AS id_profesional, um.correo AS correo_profesional,
              mp.id_usuario_asignador AS id_asignador, mp.fecha_asignacion, mp.activo
         FROM medico_paciente mp JOIN paciente p ON p.id_paciente = mp.id_paciente
         JOIN usuario up ON up.id_usuario = p.id_usuario JOIN usuario um ON um.id_usuario = mp.id_medico
       UNION ALL
       SELECT 'seguimiento', sp.id_asignacion, sp.id_paciente,
              p.id_usuario, up.correo, sp.id_seguimiento, us.correo,
              sp.id_usuario_asignador, sp.fecha_asignacion, sp.activo
         FROM seguimiento_paciente sp JOIN paciente p ON p.id_paciente = sp.id_paciente
         JOIN usuario up ON up.id_usuario = p.id_usuario JOIN usuario us ON us.id_usuario = sp.id_seguimiento
       ORDER BY id_paciente, tipo, fecha_asignacion DESC`);
    return rows;
  }

  async cerrar({ actorId, idPaciente, tipo }) {
    if (!tablaDe[tipo]) throw new Conflicto('Tipo de asignación inválido');
    const tabla = tablaDe[tipo];
    return this.db.transaccion(async (client) => {
      const p = await client.query('SELECT id_usuario FROM paciente WHERE id_paciente=$1', [idPaciente]);
      if (!p.rows[0]) throw new NoEncontrado('Paciente no encontrado');
      const ids = [...new Set([Number(actorId), Number(p.rows[0].id_usuario)])].sort((a, b) => a - b);
      const { rows } = await client.query('SELECT id_usuario, rol, activo FROM usuario WHERE id_usuario=ANY($1::int[]) ORDER BY id_usuario FOR UPDATE', [ids]);
      const actor = rows.find((u) => Number(u.id_usuario) === Number(actorId));
      const paciente = rows.find((u) => Number(u.id_usuario) === Number(p.rows[0].id_usuario));
      if (!actor?.activo || actor.rol !== 'administrador') throw new NoAutorizado('Se requiere administrador activo');
      if (!paciente?.activo || paciente.rol !== 'paciente') throw new Conflicto('La cuenta del paciente no está activa');
      await client.query('SELECT id_paciente FROM paciente WHERE id_paciente=$1 FOR UPDATE', [idPaciente]);
      const result = await client.query(`UPDATE ${tabla} SET activo=FALSE WHERE id_paciente=$1 AND activo RETURNING id_asignacion`, [idPaciente]);
      return { idPaciente: Number(idPaciente), tipo, cerradas: result.rowCount };
    });
  }
}
