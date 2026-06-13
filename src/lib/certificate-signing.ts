import * as crypto from 'crypto';

export function stableStringify(obj: any): string {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(stableStringify).join(',') + ']';
  const keys = Object.keys(obj).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}';
}

export function signPayload(payload: any, secret: string): string {
  const str = stableStringify(payload);
  return crypto.createHmac('sha256', secret).update(str).digest('hex');
}

export function verifySignature(payload: any, signature: string, secret: string): boolean {
  if (!secret) return false;
  const expected = signPayload(payload, secret);
  return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'));
}
