// R2 has been replaced by Spring Boot backend file storage. These are no-op stubs.

export type R2FileInfo = { key: string; size: number; lastModified: string | null };

export async function getPresignedUploadUrl(_key: string): Promise<string> {
  return '';
}

export async function getPresignedDownloadUrl(_key: string): Promise<string> {
  return '';
}

export async function getPublicOrPresignedUrl(_key: string): Promise<string> {
  return '';
}

export async function downloadFromR2(_key: string): Promise<Buffer> {
  throw new Error('R2 storage has been removed');
}

export async function deleteFromR2(_keys: string[]): Promise<void> {
  // no-op
}

export async function listR2Files(_prefix?: string): Promise<R2FileInfo[]> {
  return [];
}

export function r2Bucket(): string {
  return '';
}
