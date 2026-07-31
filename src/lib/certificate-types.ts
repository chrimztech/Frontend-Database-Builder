export const CERTIFICATE_TYPES = [
  { value: "competence", label: "Certificate of Competence" },
  { value: "advanced_certificate", label: "Advanced Certificate" },
  { value: "honours_diploma", label: "Honours Diploma" },
  { value: "advanced_diploma", label: "Advanced Diploma" },
  { value: "professional_diploma", label: "Professional Diploma" },
] as const;

export type CertificateTypeValue = (typeof CERTIFICATE_TYPES)[number]["value"];

export const DEFAULT_CERTIFICATE_TYPE: CertificateTypeValue = "competence";

export function certificateTypeLabel(value: string): string {
  return CERTIFICATE_TYPES.find((t) => t.value === value)?.label ?? value;
}
