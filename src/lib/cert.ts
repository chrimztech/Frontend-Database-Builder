// Shared certificate utilities (client-safe).
export const ORG_NAME = "UNZA · TeLS";
export const ORG_FULL_NAME = "University of Zambia — Center for Information and Communication Technologies (CICT), Technology & E-learning Support Unit (TeLS)";
export const ORG_PREFIX = "UNZA";
export const ORG_EMAIL = "train@unza.ac.zm";
export const ORG_WHATSAPP = "+260775606059";
export const ORG_WHATSAPP_URL = `https://wa.me/260775606059`;


export function verificationUrl(certificateId: string, origin?: string): string {
  const base = origin ?? (typeof window !== "undefined" ? window.location.origin : "");
  return `${base}/verify/${certificateId}`;
}

export function certificateStoragePath(certificateId: string) {
  return `${certificateId}.pdf`;
}
