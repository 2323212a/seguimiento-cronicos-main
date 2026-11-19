import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const eq = (a, b) => {
  if (!a || !b) return false;
  const x = Buffer.from(String(a)); const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
};

export class Csrf {
  constructor(secret) { this.secret = secret; }
  crear() {
    const nonce = randomBytes(32).toString('base64url');
    const firma = createHmac('sha256', this.secret).update(nonce).digest('base64url');
    return `${nonce}.${firma}`;
  }
  valido(token) {
    if (!token || typeof token !== 'string') return false;
    const [nonce, firma, extra] = token.split('.');
    if (!nonce || !firma || extra) return false;
    const esperado = createHmac('sha256', this.secret).update(nonce).digest('base64url');
    return eq(firma, esperado);
  }
}
