// Helpers to load branding assets + org settings used by the PDF generator.
// Branding files are served by the Spring Boot backend's BrandingController
// (filesystem-backed, ./branding-assets on the server); org settings by
// SettingsController / the org_settings table.
import { blobToDataUrl, isPdfMimeType, readSvgMarkupFromBlob } from "./pdf-like";
import { ensureLayout, type TemplateLayout } from "./template-layout";
import { apiGet, apiPut, apiUpload, apiDelete, getToken } from "./api";

export const BRANDING_BUCKET = "branding";
export const SEAL_PATH = "seal.png";
export const SIGNATURE_PATH = "signature.png"; // signatory #1
export const SIGNATURE2_PATH = "signature2.png"; // signatory #2
export const TEMPLATE_BG_PATH = "template-background.png";

const BASE = (import.meta.env.VITE_API_URL ?? "http://localhost:8080/api") as string;

async function listBrandingFiles(): Promise<{ name: string; size: number }[]> {
  return apiGet<{ name: string; size: number }[]>("/branding");
}

async function downloadBlob(path: string): Promise<Blob | null> {
  const token = getToken();
  const res = await fetch(`${BASE}/branding/${encodeURIComponent(path)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) return null;
  return res.blob();
}

export interface OrgSettings {
  org_name: string;
  org_prefix: string;
  signatory1_name: string;
  signatory1_title: string;
  signatory2_name: string;
  signatory2_title: string;
}

export interface BrandingAssets {
  sealDataUrl: string | null;
  signatureDataUrl: string | null;
  signature2DataUrl: string | null;
  templateBgBlob: Blob | null;
  templateBgDataUrl: string | null;
  templateBgMimeType: string | null;
  templateBgSvgMarkup: string | null;
  settings: OrgSettings;
  layout: TemplateLayout;
  hasCustomLayout: boolean;
}

const DEFAULT_SETTINGS: OrgSettings = {
  org_name: "Your Organization",
  org_prefix: "ORG",
  signatory1_name: "Authorized Signatory",
  signatory1_title: "Director",
  signatory2_name: "Authorized Signatory",
  signatory2_title: "Programme Lead",
};

const TTL = 5 * 60_000; // 5 minutes
let cache: { at: number; assets: BrandingAssets } | null = null;
let pendingLoad: Promise<BrandingAssets> | null = null;

async function loadBrandingFresh(): Promise<BrandingAssets> {
  // List existing files first so we never request a file that doesn't exist.
  // Without this, missing signatures produce 404s in the browser console even
  // though the error is caught and handled as null.
  const fileList = await listBrandingFiles().catch(() => []);
  const existing = new Set(fileList.map((f) => f.name));
  const maybeDownload = (path: string) =>
    existing.has(path) ? downloadBlob(path).catch(() => null) : Promise.resolve(null);

  const [sealBlob, signatureBlob, signature2Blob, bgBlob, settingsRow] = await Promise.all([
    maybeDownload(SEAL_PATH),
    maybeDownload(SIGNATURE_PATH),
    maybeDownload(SIGNATURE2_PATH),
    maybeDownload(TEMPLATE_BG_PATH),
    apiGet<(OrgSettings & { template_layout?: unknown }) | null>("/settings").catch(() => null),
  ]);
  const bgSvgMarkup = bgBlob ? await readSvgMarkupFromBlob(bgBlob).catch(() => null) : null;
  const [seal, signature, signature2, bg] = await Promise.all([
    sealBlob ? blobToDataUrl(sealBlob).catch(() => null) : Promise.resolve(null),
    signatureBlob ? blobToDataUrl(signatureBlob).catch(() => null) : Promise.resolve(null),
    signature2Blob ? blobToDataUrl(signature2Blob).catch(() => null) : Promise.resolve(null),
    bgSvgMarkup
      ? blobToDataUrl(new Blob([bgSvgMarkup], { type: "image/svg+xml;charset=utf-8" })).catch(
          () => null,
        )
      : bgBlob && !isPdfMimeType(bgBlob.type)
        ? blobToDataUrl(bgBlob).catch(() => null)
        : Promise.resolve(null),
  ]);
  const settings: OrgSettings = settingsRow
    ? {
        org_name: settingsRow.org_name,
        org_prefix: settingsRow.org_prefix,
        signatory1_name: settingsRow.signatory1_name,
        signatory1_title: settingsRow.signatory1_title,
        signatory2_name: settingsRow.signatory2_name,
        signatory2_title: settingsRow.signatory2_title,
      }
    : DEFAULT_SETTINGS;
  const rawLayout = settingsRow?.template_layout ?? null;
  const assets: BrandingAssets = {
    sealDataUrl: seal,
    signatureDataUrl: signature,
    signature2DataUrl: signature2,
    templateBgBlob: bgBlob,
    templateBgDataUrl: bg,
    templateBgMimeType: bgBlob?.type || null,
    templateBgSvgMarkup: bgSvgMarkup,
    settings,
    layout: ensureLayout(rawLayout),
    hasCustomLayout: !!rawLayout,
  };
  cache = { at: Date.now(), assets };
  return assets;
}

export async function loadBranding(): Promise<BrandingAssets> {
  if (cache && Date.now() - cache.at < TTL) return cache.assets;
  if (pendingLoad) return pendingLoad;

  pendingLoad = loadBrandingFresh().finally(() => {
    pendingLoad = null;
  });

  return pendingLoad;
}

export async function saveTemplateLayout(layout: TemplateLayout) {
  await apiPut("/settings", { template_layout: layout });
  clearBrandingCache();
}

export function clearBrandingCache() {
  cache = null;
  pendingLoad = null;
}

export async function uploadBrandingFile(path: string, file: File) {
  const form = new FormData();
  form.append("file", file, path);
  await apiUpload(`/branding/${encodeURIComponent(path)}`, form);
  clearBrandingCache();
}

export async function deleteBrandingFile(path: string) {
  await apiDelete(`/branding/${encodeURIComponent(path)}`);
  clearBrandingCache();
}
