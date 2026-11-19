// Gráfica de líneas simple en SVG (sin librerías).
const ANCHO = 640;
const ALTO = 220;
const M = { izq: 44, der: 12, arr: 12, aba: 28 };
const COLORES = ['#2563eb', '#dc2626'];

export default function Grafica({ series, unidad }) {
  const todos = series.flatMap((s) => s.puntos);
  if (todos.length < 2) {
    return <p className="vacio">Registra al menos 2 mediciones para ver la evolución.</p>;
  }
  const xs = todos.map((p) => p.x.getTime());
  const ys = todos.map((p) => p.y);
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const margen = (Math.max(...ys) - Math.min(...ys)) * 0.1 || 5;
  const [y0, y1] = [Math.min(...ys) - margen, Math.max(...ys) + margen];

  const px = (x) => M.izq + ((x - x0) / (x1 - x0 || 1)) * (ANCHO - M.izq - M.der);
  const py = (y) => ALTO - M.aba - ((y - y0) / (y1 - y0 || 1)) * (ALTO - M.arr - M.aba);
  const marcas = [y0, (y0 + y1) / 2, y1];
  const fecha = (t) => new Date(t).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });

  return (
    <div className="grafica">
      <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} role="img" aria-label={`Evolución en ${unidad}`}>
        {marcas.map((m) => (
          <g key={m}>
            <line x1={M.izq} x2={ANCHO - M.der} y1={py(m)} y2={py(m)} stroke="#e5e7eb" />
            <text x={M.izq - 6} y={py(m) + 4} textAnchor="end" fontSize="11" fill="#6b7280">{Math.round(m)}</text>
          </g>
        ))}
        <text x={M.izq} y={ALTO - 8} fontSize="11" fill="#6b7280">{fecha(x0)}</text>
        <text x={ANCHO - M.der} y={ALTO - 8} fontSize="11" fill="#6b7280" textAnchor="end">{fecha(x1)}</text>
        {series.map((s, i) => (
          <g key={s.nombre}>
            <polyline fill="none" stroke={COLORES[i]} strokeWidth="2"
              points={s.puntos.map((p) => `${px(p.x.getTime())},${py(p.y)}`).join(' ')} />
            {s.puntos.map((p) => (
              <circle key={p.x.getTime()} cx={px(p.x.getTime())} cy={py(p.y)} r="3" fill={COLORES[i]} />
            ))}
          </g>
        ))}
      </svg>
      <div className="leyenda">
        {series.map((s, i) => (
          <span key={s.nombre}><i style={{ background: COLORES[i] }} /> {s.nombre} ({unidad})</span>
        ))}
      </div>
    </div>
  );
}
