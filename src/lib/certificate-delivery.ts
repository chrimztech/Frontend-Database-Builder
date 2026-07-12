// Certificate email delivery with automatic PDF generation/repair.
// If the backend has no PDF on file for the certificate, it generates one
// client-side and uploads it before requesting the email send.

interface CertInput {
  id: string;
  certificate_id: string;
  certificate_code: string | null;
  recipient_name?: string | null;
  recipient_email?: string | null;
  programme?: string | null;
  issue_date?: string;
  issuer_name?: string | null;
  national_id?: string | null;
}

function apiBase(): string {
  return (
    (typeof import.meta !== 'undefined' ? (import.meta as any).env?.VITE_API_URL : undefined) ??
    'http://localhost:8080/api'
  );
}

function authHeader(): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('cemis_token') : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function ensurePdfUploaded(cert: CertInput): Promise<void> {
  const { generateCertificatePdf } = await import('./pdf');
  const code = cert.certificate_code ?? cert.certificate_id;

  const blob = await generateCertificatePdf({
    certificateId: code,
    recipientName: cert.recipient_name ?? 'Student',
    programme: cert.programme ?? 'your programme',
    issueDate: cert.issue_date ?? new Date().toISOString().split('T')[0],
    nrcNumber: cert.national_id ?? undefined,
  });

  const form = new FormData();
  form.append('file', new File([blob], `${code}.pdf`, { type: 'application/pdf' }));

  const res = await fetch(`${apiBase()}/certificates/${cert.id}/pdf`, {
    method: 'POST',
    headers: authHeader(),
    body: form,
  });

  if (!res.ok) {
    console.warn('[certificate-delivery] PDF upload returned', res.status);
  }
}

/**
 * Generate and upload the certificate PDF (if not already on the server),
 * then trigger the backend email delivery.
 */
export async function sendCertificateEmailWithRepair(
  cert: CertInput
): Promise<{ ok: boolean; sentTo?: string }> {
  try {
    await ensurePdfUploaded(cert);
  } catch (err) {
    console.warn('[certificate-delivery] PDF repair step failed -- proceeding with send:', err);
  }

  const res = await fetch(`${apiBase()}/certificates/${cert.id}/send-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(text || `Email delivery failed: HTTP ${res.status}`);
  }

  return res.json();
}

/** Extracts a human-readable message from a delivery error. */
export function certificateSendErrorMessage(error: any): string | null {
  if (!error) return null;
  const msg: string =
    typeof error === 'string' ? error : error?.message ?? error?.error ?? String(error);
  if (!msg) return null;

  if (/no recipient email|no email address/i.test(msg))
    return 'This certificate has no recipient email address -- update the student record first.';
  if (/smtp|delivery failed|email/i.test(msg))
    return `Email delivery failed: ${msg}`;
  if (/pdf|upload/i.test(msg))
    return `Could not prepare the certificate PDF: ${msg}`;
  return msg;
}
