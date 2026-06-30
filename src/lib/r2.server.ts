/**
 * Cloudflare R2 storage helpers (server-only — never imported on the client).
 * R2 is S3-compatible, so we use the AWS SDK S3 client pointed at the R2 endpoint.
 *
 * Required env vars:
 *   R2_ACCOUNT_ID         — Cloudflare account ID (found in dashboard right sidebar)
 *   R2_ACCESS_KEY_ID      — R2 API token Access Key ID
 *   R2_SECRET_ACCESS_KEY  — R2 API token Secret Access Key
 *   R2_BUCKET_NAME        — bucket name (e.g. tels-certificates)
 *   R2_PUBLIC_URL         — optional: public bucket URL (e.g. https://pub-xxx.r2.dev)
 *                           If set, public links use this base instead of presigned URLs.
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function getEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`R2: missing env var ${key}`);
  return v;
}

function makeClient(): S3Client {
  const accountId = getEnv("R2_ACCOUNT_ID");
  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: getEnv("R2_ACCESS_KEY_ID"),
      secretAccessKey: getEnv("R2_SECRET_ACCESS_KEY"),
    },
  });
}

export function r2Bucket(): string {
  return process.env.R2_BUCKET_NAME ?? "tels-certificates";
}

/** Presigned PUT URL for direct browser → R2 upload (expires in 15 minutes). */
export async function getPresignedUploadUrl(key: string, expiresIn = 900): Promise<string> {
  const client = makeClient();
  const cmd = new PutObjectCommand({
    Bucket: r2Bucket(),
    Key: key,
    ContentType: "application/pdf",
  });
  return getSignedUrl(client, cmd, { expiresIn });
}

/** Presigned GET URL for time-limited download (default 7 days — R2 maximum). */
export async function getPresignedDownloadUrl(key: string, expiresIn = 604_800): Promise<string> {
  const client = makeClient();
  const cmd = new GetObjectCommand({ Bucket: r2Bucket(), Key: key });
  return getSignedUrl(client, cmd, { expiresIn });
}

/**
 * Permanent public URL for a file, using the configured R2_PUBLIC_URL base.
 * Falls back to a presigned 7-day URL if the bucket is not public.
 */
export async function getPublicOrPresignedUrl(key: string): Promise<string> {
  const base = process.env.R2_PUBLIC_URL;
  if (base) return `${base.replace(/\/$/, "")}/${key}`;
  return getPresignedDownloadUrl(key);
}

/** Download a file from R2 and return its contents as a Buffer. */
export async function downloadFromR2(key: string): Promise<Buffer> {
  const client = makeClient();
  const { Body } = await client.send(new GetObjectCommand({ Bucket: r2Bucket(), Key: key }));
  if (!Body) throw new Error(`R2: empty response for ${key}`);
  const chunks: Uint8Array[] = [];
  for await (const chunk of Body as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/** Delete one or more files from R2 (errors are swallowed per-file). */
export async function deleteFromR2(keys: string[]): Promise<void> {
  const client = makeClient();
  await Promise.allSettled(
    keys.map((key) =>
      client.send(new DeleteObjectCommand({ Bucket: r2Bucket(), Key: key })),
    ),
  );
}

export type R2FileInfo = {
  key: string;
  size: number;
  lastModified: string | null;
};

/** List all objects in the bucket (or under an optional prefix). */
export async function listR2Files(prefix?: string): Promise<R2FileInfo[]> {
  const client = makeClient();
  const files: R2FileInfo[] = [];
  let continuationToken: string | undefined;

  do {
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: r2Bucket(),
        Prefix: prefix,
        ContinuationToken: continuationToken,
        MaxKeys: 1000,
      }),
    );
    for (const obj of res.Contents ?? []) {
      files.push({
        key: obj.Key ?? "",
        size: obj.Size ?? 0,
        lastModified: obj.LastModified?.toISOString() ?? null,
      });
    }
    continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (continuationToken);

  return files;
}
