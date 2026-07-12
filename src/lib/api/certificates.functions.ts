import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getRequest } from "@tanstack/react-start/server";

const API_URL =
  (typeof process !== 'undefined' ? process.env?.VITE_API_URL : undefined) ??
  'http://localhost:8080/api';

function getAuthHeader(): string | null {
  try {
    const req = getRequest();
    return (req?.headers as any)?.get?.('authorization') ?? null;
  } catch {
    return null;
  }
}

async function backendFetch(path: string, opts: RequestInit = {}): Promise<any> {
  const authHeader = getAuthHeader();
  const res = await fetch(`${API_URL}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(authHeader ? { Authorization: authHeader } : {}),
      ...((opts.headers as Record<string, string>) ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Backend error ${res.status}: ${text}`);
  }
  return res.json();
}

export const generateCertificate = createServerFn({ method: "POST" })
  .inputValidator(z.object({ enrolmentId: z.string().uuid() }))
  .handler(async ({ data }) => {
    return backendFetch('/certificates/generate', {
      method: 'POST',
      body: JSON.stringify({ enrolmentId: data.enrolmentId }),
    });
  });

export const markCertificateQueued = createServerFn({ method: "POST" })
  .inputValidator(z.object({ certificateId: z.string().uuid() }))
  .handler(async ({ data }) => {
    await backendFetch(`/certificates/${data.certificateId}`, {
      method: 'PATCH',
      body: JSON.stringify({ email_status: 'queued' }),
    });
    return { ok: true };
  });

export const updateCertificatesStatus = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({ certificateIds: z.array(z.string().uuid()), status: z.string() })
  )
  .handler(async ({ data }) => {
    const { certificateIds, status } = data;
    if (!certificateIds?.length) return { updated: 0 };
    await Promise.all(
      certificateIds.map((id) =>
        backendFetch(`/certificates/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ email_status: status }),
        })
      )
    );
    return { updated: certificateIds.length };
  });

export const sendCertificateEmail = createServerFn({ method: "POST" })
  .inputValidator(z.object({ certificateId: z.string().uuid() }))
  .handler(async ({ data }) => {
    return backendFetch(`/certificates/${data.certificateId}/send-email`, { method: 'POST' });
  });

// Signing is handled server-side during generate; this is a no-op stub.
export const signCertificate = createServerFn({ method: "POST" })
  .inputValidator(z.object({ certificateId: z.string().uuid() }))
  .handler(async (_) => ({ ok: true, signature: null }));

// Previously returned R2 presigned URL — now the client posts directly to /certificates/{id}/pdf.
// Returns a sentinel so callers that still check the return value don't crash.
export const getCertificatePdfUploadUrl = createServerFn({ method: "POST" })
  .inputValidator(z.object({ certificateCode: z.string() }))
  .handler(async ({ data }) => ({
    presignedUrl: '',
    key: `${data.certificateCode}.pdf`,
  }));

export const verifyCertificateByCode = createServerFn({ method: "POST" })
  .inputValidator(z.object({ certificateCode: z.string() }))
  .handler(async ({ data }) => {
    return backendFetch(
      `/certificates/verify/${encodeURIComponent(data.certificateCode)}`
    );
  });
