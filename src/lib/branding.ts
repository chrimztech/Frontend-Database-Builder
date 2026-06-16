// Helpers to load branding assets + org settings used by the PDF generator.
import { supabase } from "@/integrations/supabase/client";
import { blobToDataUrl, isPdfMimeType, isSvgMimeType } from "./pdf-like";
import { ensureLayout, type TemplateLayout } from "./template-layout";

export const BRANDING_BUCKET = "branding";
export const SEAL_PATH = "seal.png";
export const SIGNATURE_PATH = "signature.png";          // signatory #1
export const SIGNATURE2_PATH = "signature2.png";        // signatory #2
export const TEMPLATE_BG_PATH = "template-background.png";

async function downloadBlob(path: string): Promise<Blob | null> {
  const { data, error } = await supabase.storage.from(BRANDING_BUCKET).download(path);
  if (error || !data) return null;
  return data;
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

let cache: { at: number; assets: BrandingAssets } | null = null;
const TTL = 30_000;

export async function loadBranding(): Promise<BrandingAssets> {
  if (cache && Date.now() - cache.at < TTL) return cache.assets;
  const [sealBlob, signatureBlob, signature2Blob, bgBlob, settingsRes] = await Promise.all([
    downloadBlob(SEAL_PATH).catch(() => null),
    downloadBlob(SIGNATURE_PATH).catch(() => null),
    downloadBlob(SIGNATURE2_PATH).catch(() => null),
    downloadBlob(TEMPLATE_BG_PATH).catch(() => null),
    supabase.from("org_settings").select("*").eq("id", true).maybeSingle(),
  ]);
  const [seal, signature, signature2, bg] = await Promise.all([
    sealBlob ? blobToDataUrl(sealBlob).catch(() => null) : Promise.resolve(null),
    signatureBlob ? blobToDataUrl(signatureBlob).catch(() => null) : Promise.resolve(null),
    signature2Blob ? blobToDataUrl(signature2Blob).catch(() => null) : Promise.resolve(null),
    bgBlob && !isPdfMimeType(bgBlob.type)
      ? blobToDataUrl(bgBlob).catch(() => null)
      : Promise.resolve(null),
  ]);
  const bgSvgMarkup =
    bgBlob && isSvgMimeType(bgBlob.type)
      ? await bgBlob.text().catch(() => null)
      : null;
  const row = (settingsRes.data ?? null) as (OrgSettings & { template_layout?: unknown }) | null;
  const settings: OrgSettings = row ? {
    org_name: row.org_name,
    org_prefix: row.org_prefix,
    signatory1_name: row.signatory1_name,
    signatory1_title: row.signatory1_title,
    signatory2_name: row.signatory2_name,
    signatory2_title: row.signatory2_title,
  } : DEFAULT_SETTINGS;
  const rawLayout = row?.template_layout ?? null;
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

export async function saveTemplateLayout(layout: TemplateLayout) {
  const { error } = await supabase
    .from("org_settings")
    .update({ template_layout: layout as any })
    .eq("id", true);
  if (error) throw error;
  clearBrandingCache();
}

export function clearBrandingCache() {
  cache = null;
}

export async function uploadBrandingFile(path: string, file: File) {
  const { error } = await supabase.storage
    .from(BRANDING_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type || "image/png" });
  if (error) throw error;
  clearBrandingCache();
}

export async function deleteBrandingFile(path: string) {
  const { error } = await supabase.storage.from(BRANDING_BUCKET).remove([path]);
  if (error) throw error;
  clearBrandingCache();
}

export async function getBrandingSignedUrl(path: string, expiresIn = 600): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BRANDING_BUCKET).createSignedUrl(path, expiresIn);
  if (error) return null;
  return data?.signedUrl ?? null;
}
