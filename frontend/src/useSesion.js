import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';

export function useSesion() {
  const [sesion, setSesion] = useState(null);
  const [cargando, setCargando] = useState(true);
  useEffect(() => {
    let activo = true;
    api.csrf().then(() => api.sesion()).then((s) => { if (activo) setSesion(s); })
      .catch(() => { if (activo) setSesion(null); })
      .finally(() => { if (activo) setCargando(false); });
    return () => { activo = false; };
  }, []);
  const entrar = useCallback((datos) => setSesion(datos), []);
  const salir = useCallback(async () => {
    await api.salir();
    setSesion(null);
  }, []);
  return { sesion, entrar, salir, cargando };
}
