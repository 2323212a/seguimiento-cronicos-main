import { createHash, randomBytes } from 'node:crypto';
import { Conflicto, ErrorDeDominio } from '../../domain/errors.js';

const normalizarChatId = (chatId) => {
  const valor = String(chatId ?? '');
  if (!/^\d{1,20}$/.test(valor)) throw new ErrorDeDominio('Chat de Telegram no válido');
  return valor;
};

const hashCodigo = (codigo) => createHash('sha256').update(codigo).digest('hex');

export class GestionarVinculoTelegram {
  constructor({ repository }) { this.repository = repository; }

  async crear(chatId) {
    const telegramChatId = normalizarChatId(chatId);
    const codigo = randomBytes(9).toString('base64url').toUpperCase();
    await this.repository.crear({ telegramChatId, codigoHash: hashCodigo(codigo) });
    return { codigo, expiraEnMinutos: 10 };
  }

  async confirmar({ idPaciente, codigo }) {
    const limpio = String(codigo ?? '').trim().toUpperCase();
    if (!/^[A-Z0-9_-]{12}$/.test(limpio)) throw new ErrorDeDominio('Código de vinculación no válido');
    const confirmado = await this.repository.confirmar({ idPaciente, codigoHash: hashCodigo(limpio) });
    if (!confirmado) throw new Conflicto('El código venció o no es válido. Solicita otro en Telegram.');
    return { vinculado: true };
  }
}
