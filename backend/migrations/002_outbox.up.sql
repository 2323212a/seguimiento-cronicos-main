BEGIN;

CREATE TABLE public.outbox_evento (
  id_outbox BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id UUID NOT NULL UNIQUE,
  tipo VARCHAR(80) NOT NULL,
  agregado_tipo VARCHAR(40) NOT NULL,
  agregado_id INTEGER NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  estado VARCHAR(20) NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente', 'procesando', 'reintento', 'enviado', 'fallido')),
  intentos INTEGER NOT NULL DEFAULT 0 CHECK (intentos >= 0),
  creado_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  disponible_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lease_hasta TIMESTAMPTZ,
  enviado_at TIMESTAMPTZ,
  ultimo_error VARCHAR(500)
);
CREATE INDEX idx_outbox_pendiente ON public.outbox_evento (disponible_at, creado_at)
  WHERE estado IN ('pendiente', 'reintento', 'procesando');

-- Bandeja persistente del receptor n8n. El lease vencido permite recuperar eventos abandonados.
CREATE TABLE public.evento_recibido (
  event_id UUID PRIMARY KEY,
  estado VARCHAR(20) NOT NULL DEFAULT 'procesando'
    CHECK (estado IN ('procesando', 'enviado')),
  intentos INTEGER NOT NULL DEFAULT 1 CHECK (intentos > 0),
  recibido_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lease_hasta TIMESTAMPTZ NOT NULL,
  completado_at TIMESTAMPTZ
);

COMMIT;
