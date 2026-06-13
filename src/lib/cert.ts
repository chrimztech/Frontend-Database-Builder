// Shared certificate utilities (client-safe).
export const ORG_NAME = "UNZA · TeLS";
export const ORG_FULL_NAME = "University of Zambia — Center for Information and Communication Technologies (CICT), Technology & E-learning Support Unit (TeLS)";
export const ORG_PREFIX = "UNZA";
export const ORG_EMAIL = "train@unza.ac.zm";
export const ORG_WHATSAPP = "+260775606059";
export const ORG_WHATSAPP_URL = `https://wa.me/260775606059`;

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

function randomChunk(len: number) {
  let s = "";
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  for (let i = 0; i < len; i++) s += ALPHABET[arr[i] % ALPHABET.length];
  return s;
}

/**
 * Generate a certificate ID with the format: PREFIX-YYYY-XXXX-XXXX
 * `prefix` defaults to ORG_PREFIX but should normally be the course prefix.
 */
export function generateCertificateId(year = new Date().getFullYear(), prefix: string = ORG_PREFIX): string {
  const safe = (prefix || ORG_PREFIX).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10) || ORG_PREFIX;
  return `${safe}-${year}-${randomChunk(4)}-${randomChunk(4)}`;
}

export function verificationUrl(certificateId: string, origin?: string): string {
  const base = origin ?? (typeof window !== "undefined" ? window.location.origin : "");
  return `${base}/verify/${certificateId}`;
}

export function certificateStoragePath(certificateId: string) {
  return `${certificateId}.pdf`;
}
