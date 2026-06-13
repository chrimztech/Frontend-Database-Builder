import { describe, it, expect } from 'vitest';
import { signPayload, verifySignature } from '../certificate-signing';

describe('certificate signing', () => {
  it('signs and verifies payloads', () => {
    const secret = 'test-secret-123';
    const payload = { certificate_code: 'COURSE-20260613-0001', issued_at: '2026-06-13T12:00:00Z', issuer_id: 'issuer-1' };
    const sig = signPayload(payload, secret);
    expect(typeof sig).toBe('string');
    expect(verifySignature(payload, sig, secret)).toBe(true);
    // wrong secret
    expect(verifySignature(payload, sig, 'wrong')).toBe(false);
  });
});
