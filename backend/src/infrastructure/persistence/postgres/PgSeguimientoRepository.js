import { NoEncontrado } from '../../../domain/errors.js';

export class PgSeguimientoRepository {
  constructor(db) { this.db = db; }
  async registrar({ idUsuario, idPaciente, tipoAccion, descripcion }) {
    return this.db.transaccion(async (client) => {
      const q = await client.query('SELECT id_usuario FROM paciente WHERE id_paciente = $1', [idPaciente]);
      if (!q.rows[0]) throw new NoEncontrado('Paciente no encontrado');
      const ids = [...new Set([Number(idUsuario), Number(q.rows[0].id_usuario)])].sort((a, b) => a - b);
      const { rows: users } = await client.query('SELECT id_usuario, rol, activo FROM usuario WHERE id_usuario = ANY($1::int[]) ORDER BY id_usuario FOR UPDATE', [ids]);
      const actor = users.find((u) => Number(u.id_usuario) === Number(idUsuario));
      const pacienteUser = users.find((u) => Number(u.id_usuario) === Number(q.rows[0].id_usuario));
      if (!actor?.activo || actor.rol !== 'seguimiento') throw new NoEncontrado('Paciente no encontrado');
      if (!pacienteUser?.activo || pacienteUser.rol !== 'paciente') throw new NoEncontrado('Paciente no encontrado');
      await client.query('SELECT id_paciente FROM paciente WHERE id_paciente = $1 FOR UPDATE', [idPaciente]);
      const asignado = await client.query('SELECT 1 FROM seguimiento_paciente WHERE id_seguimiento = $1 AND id_paciente = $2 AND activo', [idUsuario, idPaciente]);
      if (!asignado.rowCount) throw new NoEncontrado('Paciente no encontrado');
      const { rows } = await client.query(
        `INSERT INTO seguimiento_accion (id_paciente, id_usuario, tipo_accion, descripcion)
         VALUES ($1, $2, $3, $4) RETURNING id_accion, id_paciente, id_usuario, tipo_accion, descripcion, fecha_accion`,
        [idPaciente, idUsuario, tipoAccion, descripcion]);
      return this.aAccion(rows[0]);
    });
  }
  async listar({ idUsuario, idPaciente }) {
    const { rows } = await this.db.query(
      `SELECT a.id_accion, a.id_paciente, a.id_usuario, a.tipo_accion, a.descripcion, a.fecha_accion
         FROM seguimiento_accion a JOIN seguimiento_paciente sp
           ON sp.id_paciente = a.id_paciente AND sp.id_seguimiento = $1 AND sp.activo
         JOIN usuario actor ON actor.id_usuario=sp.id_seguimiento AND actor.activo AND actor.rol='seguimiento'
         JOIN paciente p ON p.id_paciente = a.id_paciente
         JOIN usuario u ON u.id_usuario = p.id_usuario AND u.activo AND u.rol = 'paciente'
        WHERE a.id_paciente = $2 ORDER BY a.fecha_accion DESC`, [idUsuario, idPaciente]);
    return rows.map((r) => this.aAccion(r));
  }
  aAccion(r) { return { id: r.id_accion, idPaciente: r.id_paciente, idUsuario: r.id_usuario,
    tipoAccion: r.tipo_accion, descripcion: r.descripcion, fechaAccion: r.fecha_accion }; }
}
