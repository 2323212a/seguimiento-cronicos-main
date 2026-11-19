import { useId } from 'react';

export default function Campo({ etiqueta, ayuda, error, ...props }) {
  const generado = useId();
  const { id: idProp, ...inputProps } = props;
  const id = idProp ?? inputProps.name ?? `campo-${generado}`;
  const descripciones = [inputProps['aria-describedby'], ayuda && `${id}-ayuda`, error && `${id}-error`].filter(Boolean).join(' ') || undefined;
  return (
    <label className="campo">
      <span>{etiqueta}{inputProps.required && <span className="campo-obligatorio" aria-hidden="true"> *</span>}</span>
      <input {...inputProps} id={id} aria-invalid={error ? 'true' : undefined} aria-describedby={descripciones} />
      {ayuda && <small id={`${id}-ayuda`}>{ayuda}</small>}
      {error && <small id={`${id}-error`} className="campo-error">{error}</small>}
    </label>
  );
}
