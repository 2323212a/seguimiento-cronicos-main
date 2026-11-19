export default function Mensaje({ tipo = 'error', children }) {
  if (!children) return null;
  return <div className={`mensaje ${tipo}`} role={tipo === 'error' ? 'alert' : 'status'} aria-live={tipo === 'error' ? 'assertive' : 'polite'} aria-atomic="true">{children}</div>;
}
