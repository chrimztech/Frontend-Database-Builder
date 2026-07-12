// R2 storage has been replaced by the Spring Boot backend's local file storage.
// These stubs exist for import compatibility; the PDF upload path now goes through
// uploadCertificatePdf() in lib/pdf.ts → POST /api/certificates/{id}/pdf.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getR2UploadUrl = createServerFn({ method: "POST" })
  .inputValidator(z.object({ key: z.string().min(1) }))
  .handler(async ({ data }) => ({ presignedUrl: '', key: data.key }));

export const getR2DownloadUrl = createServerFn({ method: "POST" })
  .inputValidator(z.object({ key: z.string().min(1), expiresIn: z.number().optional() }))
  .handler(async (_) => ({ url: '' }));

export const deleteR2Files = createServerFn({ method: "POST" })
  .inputValidator(z.object({ keys: z.array(z.string()) }))
  .handler(async (_) => ({ ok: true }));

export const listR2CertificateFiles = createServerFn({ method: "POST" })
  .handler(async () => ({ files: [] }));
