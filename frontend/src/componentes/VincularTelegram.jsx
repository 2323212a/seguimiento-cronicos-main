import { useState } from 'react';
import { api } from '../api.js';
import Mensaje from './Mensaje.jsx';

export default function VincularTelegram({ perfil, onVinculado }) {
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState('');
  const [exito, setExito] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [vinculado, setVinculado] = useState(false);
  const codigoNormalizado = codigo.replace(/\s/g, '').toUpperCase();

  if (!perfil) return null;
  if (perfil.telegramVerificado || vinculado) return <section className="tarjeta" aria-live="polite">
    <h2>Telegram vinculado</h2>
    <p>Tu cuenta ya está vinculada. Recibirás avisos genéricos por el bot.</p>
  </section>;

  const enviar = async (evento) => {
    evento.preventDefault(); setError(''); setExito(''); setEnviando(true);
    try {
      await api.vincularTelegram(codigoNormalizado);
      setCodigo(''); setVinculado(true); setExito('Telegram quedó vinculado.');
      await onVinculado?.();
    } catch (e) { setError(e.message); }
    finally { setEnviando(false); }
  };

  return <section className="tarjeta">
    <form className="formulario-vinculo-telegram" onSubmit={enviar}>
      <h2>Vincular Telegram</h2>
      <p className="descripcion-seccion">En el chat privado con el bot envía <code>/vincular</code>. Pega aquí el código de 12 caracteres que te responda. Vence en 10 minutos; pedir otro invalida el anterior.</p>
      <label htmlFor="codigo-telegram">Código de un solo uso</label>
      <input id="codigo-telegram" name="codigoTelegram" autoComplete="one-time-code" autoCapitalize="characters" spellCheck="false" placeholder="12 caracteres" value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\s/g, '').slice(0, 12).toUpperCase())} maxLength={12} required aria-describedby="ayuda-codigo-telegram" />
      <small id="ayuda-codigo-telegram">{codigoNormalizado.length}/12 caracteres</small>
      <Mensaje>{error}</Mensaje><Mensaje tipo="exito">{exito}</Mensaje>
      <button type="submit" disabled={enviando || !/^[A-Z0-9_-]{12}$/.test(codigoNormalizado)}>{enviando ? 'Vinculando…' : 'Vincular Telegram'}</button>
    </form>
  </section>;
}
