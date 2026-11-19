import { createHmac, timingSafeEqual } from 'node:crypto';

const b64 = (value) => Buffer.from(value).toString('base64url');
const igual = (a, b) => {
  const x = Buffer.from(String(a)); const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
};

export class Jwt {
  constructor({ secreto, emisor = 'seguimiento-cronicos', audiencia = 'seguimiento-cronicos-web', ttlSegundos = 900 }) {
    if (!secreto || secreto.length < 32) throw new Error('JWT_SECRET debe tener al menos 32 caracteres');
    Object.assign(this, { secreto, emisor, audiencia, ttlSegundos });
  }

  firmar({ sub }) {
    const ahora = Math.floor(Date.now() / 1000);
    const header = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payload = b64(JSON.stringify({ sub: String(sub), iss: this.emisor, aud: this.audiencia, iat: ahora, exp: ahora + this.ttlSegundos }));
    const firma = createHmac('sha256', this.secreto).update(`${header}.${payload}`).digest('base64url');
    return `${header}.${payload}.${firma}`;
  }

  verificar(token) {
    try {
      const [header, payload, firma, extra] = token.split('.');
      if (!header || !payload || !firma || extra) return null;
      const esperado = createHmac('sha256', this.secreto).update(`${header}.${payload}`).digest('base64url');
      if (!igual(firma, esperado)) return null;
      const h = JSON.parse(Buffer.from(header, 'base64url').toString());
      const p = JSON.parse(Buffer.from(payload, 'base64url').toString());
      const ahora = Math.floor(Date.now() / 1000);
      if (h.alg !== 'HS256' || p.iss !== this.emisor || p.aud !== this.audiencia || !p.sub || !Number.isInteger(p.exp) || p.exp <= ahora) return null;
      return p;
    } catch { return null; }
  }
}

export { igual as comparacionSegura };
