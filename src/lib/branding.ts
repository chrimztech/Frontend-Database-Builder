// Helpers to load branding assets + org settings used by the PDF generator.
// Branding files are served by the Spring Boot backend's BrandingController
// (filesystem-backed, ./branding-assets on the server), one fully independent
// set per certificate type — asset filenames are prefixed with the type
// (e.g. "advanced_diploma__seal.png"). Signatories + layout come from
// CertificateTemplateController (one row per type); org name/prefix stay
// global via SettingsController.
import { blobToDataUrl, isPdfMimeType, readSvgMarkupFromBlob } from "./pdf-like";
import { ensureLayout, type TemplateLayout } from "./template-layout";
import { apiGet, apiPut, apiUpload, apiDelete, getToken } from "./api";
import { DEFAULT_CERTIFICATE_TYPE, type CertificateTypeValue } from "./certificate-types";

const SEAL_FILE = "seal.png";
const SIGNATURE_FILE = "signature.png"; // signatory #1
const SIGNATURE2_FILE = "signature2.png"; // signatory #2
const TEMPLATE_BG_FILE = "template-background.png";

/** Type-prefixed storage filename, e.g. "advanced_diploma__seal.png". */
export function brandingFileName(certificateType: CertificateTypeValue, file: string): string {
  return `${certificateType}__${file}`;
}
export const SEAL_PATH = SEAL_FILE;
export const SIGNATURE_PATH = SIGNATURE_FILE;
export const SIGNATURE2_PATH = SIGNATURE2_FILE;
export const TEMPLATE_BG_PATH = TEMPLATE_BG_FILE;

const BASE = (import.meta.env.VITE_API_URL ?? "http://localhost:8080/api") as string;

async function listBrandingFiles(): Promise<{ name: string; size: number }[]> {
  return apiGet<{ name: string; size: number }[]>("/branding");
}

async function downloadBlob(storedName: string): Promise<Blob | null> {
  const token = getToken();
  const res = await fetch(`${BASE}/branding/${encodeURIComponent(storedName)}`, {
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

type CertificateTemplateRow = {
  certificate_type: CertificateTypeValue;
  signatory1_name: string;
  signatory1_title: string;
  signatory2_name: string;
  signatory2_title: string;
  template_layout?: unknown;
};

const TTL = 5 * 60_000; // 5 minutes
const cache = new Map<CertificateTypeValue, { at: number; assets: BrandingAssets }>();
const pendingLoad = new Map<CertificateTypeValue, Promise<BrandingAssets>>();

async function loadBrandingFresh(certificateType: CertificateTypeValue): Promise<BrandingAssets> {
  const sealName = brandingFileName(certificateType, SEAL_FILE);
  const signatureName = brandingFileName(certificateType, SIGNATURE_FILE);
  const signature2Name = brandingFileName(certificateType, SIGNATURE2_FILE);
  const bgName = brandingFileName(certificateType, TEMPLATE_BG_FILE);

  // List existing files first so we never request a file that doesn't exist.
  // Without this, missing signatures produce 404s in the browser console even
  // though the error is caught and handled as null.
  const fileList = await listBrandingFiles().catch(() => []);
  const existing = new Set(fileList.map((f) => f.name));
  // Back-compat: before per-type templates existed, assets were stored
  // unprefixed (just "seal.png" etc). Fall back to those for "competence" —
  // the type every pre-existing deployment's uploads implicitly belong to —
  // so upgrading doesn't require manually renaming files on the server.
  const maybeDownload = (storedName: string, legacyName?: string) => {
    if (existing.has(storedName)) return downloadBlob(storedName).catch(() => null);
    if (legacyName && existing.has(legacyName)) return downloadBlob(legacyName).catch(() => null);
    return Promise.resolve(null);
  };
  const legacyFallback = (file: string) => (certificateType === "competence" ? file : undefined);

  const [sealBlob, signatureBlob, signature2Blob, bgBlob, templateRow] = await Promise.all([
    maybeDownload(sealName, legacyFallback(SEAL_FILE)),
    maybeDownload(signatureName, legacyFallback(SIGNATURE_FILE)),
    maybeDownload(signature2Name, legacyFallback(SIGNATURE2_FILE)),
    maybeDownload(bgName, legacyFallback(TEMPLATE_BG_FILE)),
    apiGet<CertificateTemplateRow | null>(`/certificate-templates/${certificateType}`).catch(() => null),
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
  const settings: OrgSettings = templateRow
    ? {
        ...DEFAULT_SETTINGS,
        signatory1_name: templateRow.signatory1_name,
        signatory1_title: templateRow.signatory1_title,
        signatory2_name: templateRow.signatory2_name,
        signatory2_title: templateRow.signatory2_title,
      }
    : DEFAULT_SETTINGS;
  const rawLayout = templateRow?.template_layout ?? null;
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
  cache.set(certificateType, { at: Date.now(), assets });
  return assets;
}

export async function loadBranding(
  certificateType: CertificateTypeValue = DEFAULT_CERTIFICATE_TYPE,
): Promise<BrandingAssets> {
  const cached = cache.get(certificateType);
  if (cached && Date.now() - cached.at < TTL) return cached.assets;
  const pending = pendingLoad.get(certificateType);
  if (pending) return pending;

  const load = loadBrandingFresh(certificateType).finally(() => {
    pendingLoad.delete(certificateType);
  });
  pendingLoad.set(certificateType, load);

  return load;
}

export async function saveTemplateLayout(
  layout: TemplateLayout,
  certificateType: CertificateTypeValue = DEFAULT_CERTIFICATE_TYPE,
) {
  await apiPut(`/certificate-templates/${certificateType}`, { template_layout: layout });
  clearBrandingCache(certificateType);
}

export async function saveSignatories(
  signatories: Pick<
    OrgSettings,
    "signatory1_name" | "signatory1_title" | "signatory2_name" | "signatory2_title"
  >,
  certificateType: CertificateTypeValue = DEFAULT_CERTIFICATE_TYPE,
) {
  await apiPut(`/certificate-templates/${certificateType}`, signatories);
  clearBrandingCache(certificateType);
}

export function clearBrandingCache(certificateType?: CertificateTypeValue) {
  if (certificateType) {
    cache.delete(certificateType);
    pendingLoad.delete(certificateType);
  } else {
    cache.clear();
    pendingLoad.clear();
  }
}

export async function uploadBrandingFile(
  path: string,
  file: File,
  certificateType: CertificateTypeValue = DEFAULT_CERTIFICATE_TYPE,
) {
  const storedName = brandingFileName(certificateType, path);
  const form = new FormData();
  form.append("file", file, storedName);
  await apiUpload(`/branding/${encodeURIComponent(storedName)}`, form);
  clearBrandingCache(certificateType);
}

export async function deleteBrandingFile(
  path: string,
  certificateType: CertificateTypeValue = DEFAULT_CERTIFICATE_TYPE,
) {
  await apiDelete(`/branding/${encodeURIComponent(brandingFileName(certificateType, path))}`);
  clearBrandingCache(certificateType);
}
