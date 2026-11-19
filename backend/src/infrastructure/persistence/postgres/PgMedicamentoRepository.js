import { MedicamentoRepository } from '../../../application/ports/MedicamentoRepository.js';
import { Medicamento } from '../../../domain/Medicamento.js';
import { NoEncontrado } from '../../../domain/errors.js';

const aMedicamento = (r) => new Medicamento({
  id: r.id_medicamento, idPaciente: r.id_paciente, nombre: r.nombre, dosis: r.dosis,
  frecuencia: r.frecuencia, fechaInicio: r.fecha_inicio, fechaFin: r.fecha_fin,
  observaciones: r.observaciones, horarios: (r.horarios ?? []).map((h) => h.slice(0, 5)),
});

export class PgMedicamentoRepository extends MedicamentoRepository {
  constructor(db) { super(); this.db = db; }

  async guardar(med, { actorId = null } = {}) {
    return this.db.transaccion(async (client) => {
      if (actorId) {
        const p = await client.query('SELECT id_usuario FROM paciente WHERE id_paciente=$1', [med.idPaciente]);
        if (!p.rows[0]) throw new NoEncontrado('Paciente no encontrado');
        const ids = [...new Set([Number(actorId), Number(p.rows[0].id_usuario)])].sort((a, b) => a - b);
        const { rows: users } = await client.query('SELECT id_usuario, rol, activo FROM usuario WHERE id_usuario=ANY($1::int[]) ORDER BY id_usuario FOR UPDATE', [ids]);
        const actor = users.find((u) => Number(u.id_usuario) === Number(actorId));
        const paciente = users.find((u) => Number(u.id_usuario) === Number(p.rows[0].id_usuario));
        if (!actor?.activo || actor.rol !== 'medico' || !paciente?.activo || paciente.rol !== 'paciente') throw new NoEncontrado('Paciente no encontrado');
        await client.query('SELECT id_paciente FROM paciente WHERE id_paciente=$1 FOR UPDATE', [med.idPaciente]);
        const asignacion = await client.query('SELECT 1 FROM medico_paciente WHERE id_medico=$1 AND id_paciente=$2 AND activo', [actorId, med.idPaciente]);
        if (!asignacion.rowCount) throw new NoEncontrado('Paciente no encontrado');
      }
      const { rows } = await client.query(
        `INSERT INTO medicamento
           (id_paciente, nombre, dosis, frecuencia, fecha_inicio, fecha_fin, observaciones)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [med.idPaciente, med.nombre, med.dosis, med.frecuencia, med.fechaInicio, med.fechaFin, med.observaciones],
      );
      const fila = rows[0];
      for (const hora of med.horarios) {
        await client.query(
          'INSERT INTO horario_medicamento (id_medicamento, hora) VALUES ($1, $2)',
          [fila.id_medicamento, hora],
        );
      }
      return aMedicamento({ ...fila, horarios: med.horarios });
    });
  }

  async listarPorPaciente(idPaciente, { usuarioId, rol } = {}) {
    const params = [idPaciente];
    let acceso = '';
    if (usuarioId && rol) {
      params.push(usuarioId); const actor = `$${params.length}`;
      params.push(rol); const roleParam = `$${params.length}`;
      const assignment = rol === 'medico'
        ? `EXISTS (SELECT 1 FROM medico_paciente a WHERE a.id_paciente=m.id_paciente AND a.id_medico=${actor} AND a.activo)`
        : `p.id_usuario=${actor}`;
      acceso = ` AND EXISTS (SELECT 1 FROM paciente p JOIN usuario up ON up.id_usuario=p.id_usuario
        JOIN usuario ua ON ua.id_usuario=${actor} WHERE p.id_paciente=m.id_paciente AND up.activo
        AND up.rol='paciente' AND ua.activo AND ua.rol=${roleParam} AND ${assignment})`;
    }
    const { rows } = await this.db.query(
      `SELECT m.*, COALESCE(array_agg(h.hora::text ORDER BY h.hora) FILTER (WHERE h.id_horario IS NOT NULL), '{}') AS horarios
         FROM medicamento m
         LEFT JOIN horario_medicamento h ON h.id_medicamento = m.id_medicamento
        WHERE m.id_paciente = $1${acceso}
        GROUP BY m.id_medicamento
        ORDER BY m.fecha_inicio DESC`,
      params,
    );
    return rows.map(aMedicamento);
  }

  async listarRecordatorios(hora) {
    const { rows } = await this.db.query(
      `SELECT h.id_horario, to_char(h.hora, 'HH24:MI') AS hora,
              m.id_medicamento, m.nombre AS medicamento, m.dosis,
              p.id_paciente, p.nombre AS paciente, p.telegram_chat_id
         FROM horario_medicamento h
         JOIN medicamento m ON m.id_medicamento = h.id_medicamento
         JOIN paciente p ON p.id_paciente = m.id_paciente
        WHERE h.activo AND m.activo
          AND to_char(h.hora, 'HH24:MI') = $1
          AND m.fecha_inicio <= CURRENT_DATE
          AND (m.fecha_fin IS NULL OR m.fecha_fin >= CURRENT_DATE)
          AND p.telegram_chat_id IS NOT NULL AND p.telegram_verificado=true`,
      [hora],
    );
    return rows.map((r) => ({
      idHorario: r.id_horario, hora: r.hora, idMedicamento: r.id_medicamento,
      medicamento: r.medicamento, dosis: r.dosis, idPaciente: r.id_paciente,
      paciente: r.paciente, telegramChatId: r.telegram_chat_id,
    }));
  }
}
