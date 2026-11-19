import { PacienteRepository } from '../../../application/ports/PacienteRepository.js';
import { Paciente } from '../../../domain/Paciente.js';
import { Conflicto } from '../../../domain/errors.js';

const aPaciente = (r) => new Paciente({
  id: r.id_paciente, idUsuario: r.id_usuario, nombre: r.nombre,
  apellidoPaterno: r.apellido_paterno, apellidoMaterno: r.apellido_materno,
  fechaNacimiento: r.fecha_nacimiento, telefono: r.telefono, telegramChatId: r.telegram_chat_id,
  telegramVerificado: r.telegram_verificado === true,
});

export class PgPacienteRepository extends PacienteRepository {
  constructor(db) { super(); this.db = db; }

  async registrar(usuario, paciente) {
    try {
      return await this.db.transaccion(async (client) => {
        const u = await client.query(
          'INSERT INTO usuario (correo, contrasena_hash, rol, activo) VALUES ($1, $2, $3, $4) RETURNING id_usuario',
          [usuario.correo, usuario.contrasenaHash, usuario.rol, false],
        );
        const idUsuario = u.rows[0].id_usuario;
        const p = await client.query(
          `INSERT INTO paciente
             (id_usuario, nombre, apellido_paterno, apellido_materno, fecha_nacimiento, telefono, telegram_chat_id)
           VALUES ($1, $2, $3, $4, $5, $6, NULL) RETURNING *`,
          [idUsuario, paciente.nombre, paciente.apellidoPaterno, paciente.apellidoMaterno,
            paciente.fechaNacimiento, paciente.telefono],
        );
        return aPaciente(p.rows[0]);
      });
    } catch (error) {
      if (error.code === '23505') throw new Conflicto('Ya existe una cuenta con ese correo');
      throw error;
    }
  }

  async buscarPorId(idPaciente) {
    const { rows } = await this.db.query('SELECT * FROM paciente WHERE id_paciente = $1', [idPaciente]);
    return rows[0] ? aPaciente(rows[0]) : null;
  }

  async buscarPorUsuario(idUsuario) {
    const { rows } = await this.db.query(
      `SELECT p.* FROM paciente p JOIN usuario u ON u.id_usuario=p.id_usuario
       WHERE p.id_usuario = $1 AND u.activo AND u.rol='paciente'`, [idUsuario]);
    return rows[0] ? aPaciente(rows[0]) : null;
  }

  async buscarIdActivoPorTelegramChatId(chatId) {
    const { rows } = await this.db.query(
      `SELECT p.id_paciente FROM paciente p JOIN usuario u ON u.id_usuario=p.id_usuario
       WHERE p.telegram_chat_id=$1 AND p.telegram_verificado=true
         AND u.activo=true AND u.rol='paciente' LIMIT 1`, [chatId]);
    return rows[0]?.id_paciente ?? null;
  }

  async buscarVinculadoPorTelegramChatId(chatId) {
    const { rows } = await this.db.query(
      `SELECT p.* FROM paciente p JOIN usuario u ON u.id_usuario=p.id_usuario
       WHERE p.telegram_chat_id=$1 AND p.telegram_verificado=true
         AND u.activo=true AND u.rol='paciente' LIMIT 1`, [chatId]);
    return rows[0] ? aPaciente(rows[0]) : null;
  }

  async listarAsignados(idUsuario, tipo) {
    const { rows } = tipo === 'medico'
      ? await this.db.query(
        `SELECT p.id_paciente, p.nombre, p.apellido_paterno, p.apellido_materno FROM paciente p JOIN medico_paciente a ON a.id_paciente = p.id_paciente
          JOIN usuario u ON u.id_usuario = p.id_usuario
          JOIN usuario actor ON actor.id_usuario = a.id_medico AND actor.activo AND actor.rol = 'medico'
         WHERE a.id_medico = $1 AND a.activo AND u.activo AND u.rol = 'paciente'
         ORDER BY p.id_paciente`, [idUsuario])
      : await this.db.query(
        `SELECT p.id_paciente, p.nombre, p.apellido_paterno, p.apellido_materno FROM paciente p JOIN seguimiento_paciente a ON a.id_paciente = p.id_paciente
          JOIN usuario u ON u.id_usuario = p.id_usuario
          JOIN usuario actor ON actor.id_usuario = a.id_seguimiento AND actor.activo AND actor.rol = 'seguimiento'
         WHERE a.id_seguimiento = $1 AND a.activo AND u.activo AND u.rol = 'paciente'
         ORDER BY p.id_paciente`, [idUsuario]);
    return rows.map((r) => ({ id: r.id_paciente, nombre: r.nombre, apellidoPaterno: r.apellido_paterno, apellidoMaterno: r.apellido_materno }));
  }

  async estaAsignado(idUsuario, idPaciente, tipo) {
    const col = tipo === 'medico' ? 'id_medico' : 'id_seguimiento';
    const tabla = tipo === 'medico' ? 'medico_paciente' : 'seguimiento_paciente';
    const { rowCount } = await this.db.query(
      `SELECT 1 FROM ${tabla} a JOIN paciente p ON p.id_paciente = a.id_paciente
        JOIN usuario up ON up.id_usuario = p.id_usuario
        JOIN usuario actor ON actor.id_usuario = a.${col}
       WHERE a.${col} = $1 AND a.id_paciente = $2 AND a.activo
         AND up.activo AND up.rol = 'paciente' AND actor.activo AND actor.rol = $3`,
      [idUsuario, idPaciente, tipo]);
    return rowCount > 0;
  }

  async existeCorreo(correo) {
    const { rowCount } = await this.db.query('SELECT 1 FROM usuario WHERE correo = $1', [correo]);
    return rowCount > 0;
  }
}
