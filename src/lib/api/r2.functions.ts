import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  getPresignedUploadUrl,
  getPresignedDownloadUrl,
  deleteFromR2,
  listR2Files,
} from "@/lib/r2.server";

/** Returns a presigned PUT URL so the browser can upload a PDF directly to R2. */
export const getR2UploadUrl = createServerFn({ method: "POST" })
  .inputValidator(z.object({ key: z.string().min(1) }))
  .handler(async ({ data }) => {
    const presignedUrl = await getPresignedUploadUrl(data.key);
    return { presignedUrl, key: data.key };
  });

/** Returns a presigned GET URL for a time-limited download from R2. */
export const getR2DownloadUrl = createServerFn({ method: "POST" })
  .inputValidator(z.object({ key: z.string().min(1), expiresIn: z.number().optional() }))
  .handler(async ({ data }) => {
    const url = await getPresignedDownloadUrl(data.key, data.expiresIn);
    return { url };
  });

/** Deletes one or more keys from R2 (server-side — credentials never reach the browser). */
export const deleteR2Files = createServerFn({ method: "POST" })
  .inputValidator(z.object({ keys: z.array(z.string()) }))
  .handler(async ({ data }) => {
    await deleteFromR2(data.keys);
    return { ok: true };
  });

/** Lists all files in the R2 certificates bucket. */
export const listR2CertificateFiles = createServerFn({ method: "POST" })
  .handler(async () => {
    const files = await listR2Files();
    return { files };
  });
