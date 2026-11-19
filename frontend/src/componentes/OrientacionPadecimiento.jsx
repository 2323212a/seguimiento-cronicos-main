import { catalogoMedicamentosEducativo } from '../datos/catalogoMedicamentosEducativo.js';

export default function OrientacionPadecimiento({ codigo }) {
  const ficha = catalogoMedicamentosEducativo.find((item) => item.codigo === codigo);
  if (!ficha) return null;
  return <section className="orientacion-padecimiento" aria-label="Información educativa relacionada">
    <h3>Posible padecimiento señalado</h3>
    <p><strong>{ficha.padecimiento}</strong>. Es una referencia informativa asociada al criterio; no confirma un diagnóstico.</p>
    <h4>Medicamentos descritos en las guías</h4>
    <p className="detalle">La selección y dosis corresponden a la prescripción individual.</p>
    <ul className="lista">
      {ficha.grupos.map((grupo) => <li key={grupo.nombre}>
        <strong>{grupo.nombre}</strong><div>{grupo.ejemplos}</div><div className="detalle">{grupo.alcance}</div>
      </li>)}
    </ul>
    <div className="detalle">Fuentes: {ficha.fuentes.map((fuente, index) => <span key={fuente.url}>{index > 0 ? ' · ' : ''}<a href={fuente.url} target="_blank" rel="noreferrer">{fuente.nombre}</a></span>)}</div>
  </section>;
}
