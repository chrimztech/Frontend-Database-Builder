// Client-side certificate PDF generator (PORTRAIT A4).
import { jsPDF, GState } from "jspdf";
import QRCode from "qrcode";
import { verificationUrl } from "./cert";
import { loadBranding } from "./branding";
import { isPdfMimeType, renderPdfBlobPageToDataUrl } from "./pdf-like";
import { DEFAULT_LAYOUT, DEFAULT_LOGO_OVERLAY, mmToPt, type LayoutField, type TemplateLayout } from "./template-layout";
import { registerCustomFontsInDoc } from "./font-loader";
import unzaLogo from "@/assets/unza-logo.png.asset.json";

export interface CertificateInput {
  certificateId: string;
  recipientName: string;
  programme: string;
  issueDate: string; // YYYY-MM-DD
  issuerName?: string; // back-compat; unused
  nrcNumber?: string;
}

async function fetchAsDataUrl(url: string): Promise<string | null> {
  try {
    const resp = await fetch(url);
    const blob = await resp.blob();
    return await new Promise<string>((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result as string);
      r.onerror = rej;
      r.readAsDataURL(blob);
    });
  } catch { return null; }
}

function formatDate(d: string) {
  try {
    return new Date(d + "T00:00:00").toLocaleDateString(undefined, {
      year: "numeric", month: "long", day: "numeric",
    });
  } catch { return d; }
}

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [40, 40, 40];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function styleToJsPdf(style?: string): "normal" | "bold" | "italic" | "bolditalic" {
  switch (style) {
    case "bold": return "bold";
    case "italic": return "italic";
    case "bolditalic": return "bolditalic";
    default: return "normal";
  }
}

function getDefaultSettings() {
  return {
    org_name: "Your Organization",
    org_prefix: "ORG",
    signatory1_name: "Authorized Signatory",
    signatory1_title: "Director",
    signatory2_name: "Authorized Signatory",
    signatory2_title: "Programme Lead",
  };
}

function resolveText(f: LayoutField, cert: CertificateInput, settings: ReturnType<typeof getDefaultSettings>): string {
  // Custom text blocks have a staticText property
  if (f.staticText !== undefined) return f.staticText;
  switch (f.id) {
    case "recipientName": return cert.recipientName;
    case "programme":     return cert.programme;
    case "issueDate":     return formatDate(cert.issueDate);
    case "certificateId": return `ID: ${cert.certificateId}`;
    case "nrcNumber":     return cert.nrcNumber ? `NRC: ${cert.nrcNumber}` : "";
    case "signature1Name":  return settings.signatory1_name;
    case "signature1Title": return settings.signatory1_title;
    case "signature2Name":  return settings.signatory2_name;
    case "signature2Title": return settings.signatory2_title;
    default: return f.label ?? "";
  }
}

function resolveImageDataUrl(f: LayoutField, branding: Awaited<ReturnType<typeof loadBranding>> | null, qrDataUrl: string): string | null {
  switch (f.id) {
    case "qr":             return qrDataUrl;
    case "seal":           return branding?.sealDataUrl ?? null;
    case "signature1Image": return branding?.signatureDataUrl ?? null;
    case "signature2Image": return branding?.signature2DataUrl ?? null;
    default: return null; // custom image slots not yet backed by uploaded assets
  }
}

function applyTextTransform(text: string, t?: LayoutField["textTransform"]): string {
  if (t === "uppercase") return text.toUpperCase();
  if (t === "lowercase") return text.toLowerCase();
  return text;
}

function drawField(
  doc: jsPDF,
  f: LayoutField,
  cert: CertificateInput,
  settings: ReturnType<typeof getDefaultSettings>,
  branding: Awaited<ReturnType<typeof loadBranding>> | null,
  qrDataUrl: string,
) {
  if (!f.visible) return;
  const xPt = mmToPt(f.x);
  const yPt = mmToPt(f.y);
  const wPt = mmToPt(f.w);
  const hPt = mmToPt(f.h);

  const opacity = f.opacity ?? 1;
  const hasOpacity = opacity < 0.999;
  if (hasOpacity) {
    doc.saveGraphicsState();
    doc.setGState(new GState({ opacity }));
  }

  try {
    if (f.kind === "image") {
      const data = resolveImageDataUrl(f, branding, qrDataUrl);
      if (data) {
        try { doc.addImage(data, "PNG", xPt, yPt, wPt, hPt); } catch {}
      }
    } else {
      const rawText = resolveText(f, cert, settings);
      if (rawText) {
        const text = applyTextTransform(rawText, f.textTransform);
        try {
          doc.setFont(f.fontFamily ?? "helvetica", styleToJsPdf(f.fontStyle));
        } catch {
          doc.setFont("helvetica", "normal");
        }
        doc.setFontSize(f.fontSize ?? 11);
        doc.setTextColor(...hexToRgb(f.color ?? "#282828"));
        if (f.letterSpacing) doc.setCharSpace(f.letterSpacing);
        const align = f.align ?? "left";
        const baselineY = yPt + Math.max(hPt * 0.75, (f.fontSize ?? 11) * 0.85);
        let xText = xPt;
        if (align === "center") xText = xPt + wPt / 2;
        else if (align === "right") xText = xPt + wPt;
        doc.text(text, xText, baselineY, { align, maxWidth: wPt });
        if (f.letterSpacing) doc.setCharSpace(0);
      }
    }
  } finally {
    if (hasOpacity) doc.restoreGraphicsState();
  }
}

export async function generateCertificatePdf(cert: CertificateInput): Promise<Blob> {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();

  const branding = await loadBranding().catch(() => null);
  const settings = branding?.settings ?? getDefaultSettings();
  const layout: TemplateLayout = branding?.layout ?? DEFAULT_LAYOUT;
  const overlay = layout.logoOverlay ?? DEFAULT_LOGO_OVERLAY;

  // Register any custom (non-built-in) fonts used in this layout
  const fontFamiliesUsed = layout.fields
    .filter((f) => f.kind === "text" && f.visible && f.fontFamily)
    .map((f) => f.fontFamily!);
  await registerCustomFontsInDoc(doc, fontFamiliesUsed);

  // Background
  const backgroundDataUrl =
    branding?.templateBgDataUrl ||
    (branding?.templateBgBlob && isPdfMimeType(branding.templateBgMimeType)
      ? await renderPdfBlobPageToDataUrl(branding.templateBgBlob, {
          targetWidth: 2480,
          targetHeight: 3508,
        }).catch(() => null)
      : null);

  if (backgroundDataUrl) {
    try { doc.addImage(backgroundDataUrl, "PNG", 0, 0, W, H); }
    catch {
      doc.setFillColor(245, 241, 232);
      doc.rect(0, 0, W, H, "F");
    }
  } else {
    doc.setFillColor(245, 241, 232);
    doc.rect(0, 0, W, H, "F");
    doc.setDrawColor(201, 164, 76);
    doc.setLineWidth(2);
    doc.rect(24, 24, W - 48, H - 48);
    doc.setLineWidth(0.5);
    doc.rect(32, 32, W - 64, H - 64);
    doc.setTextColor(11, 29, 58);
    doc.setFont("times", "bold");
    doc.setFontSize(13);
    doc.text(settings.org_name.toUpperCase(), W / 2, 60, { align: "center" });
    doc.setFont("times", "italic");
    doc.setFontSize(28);
    doc.text("Certificate of Completion", W / 2, 100, { align: "center" });
  }

  // UNZA logo watermark overlay
  if (overlay.enabled && overlay.opacity > 0) {
    const logoData = await fetchAsDataUrl(unzaLogo.url).catch(() => null);
    if (logoData) {
      doc.saveGraphicsState();
      doc.setGState(new GState({ opacity: overlay.opacity }));
      try {
        doc.addImage(logoData, "PNG", mmToPt(overlay.x), mmToPt(overlay.y), mmToPt(overlay.w), mmToPt(overlay.h));
      } catch {}
      doc.restoreGraphicsState();
    }
  }

  // QR code
  const url = verificationUrl(cert.certificateId);
  const qrDataUrl = await QRCode.toDataURL(url, {
    margin: 1, width: 320, color: { dark: "#0b1d3a", light: "#ffffff" },
  });

  for (const f of layout.fields) {
    drawField(doc, f, cert, settings, branding, qrDataUrl);
  }

  return doc.output("blob");
}

export async function downloadCertificatePdf(cert: CertificateInput) {
  const blob = await generateCertificatePdf(cert);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `certificate-${cert.certificateId}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Uploads the rendered PDF to the `certificates` storage bucket. Returns public URL. */
export async function uploadCertificatePdf(cert: CertificateInput): Promise<string> {
  const { supabase } = await import("@/integrations/supabase/client");
  const blob = await generateCertificatePdf(cert);
  const path = `${cert.certificateId}.pdf`;
  const { error } = await supabase.storage
    .from("certificates")
    .upload(path, blob, { upsert: true, contentType: "application/pdf" });
  if (error) throw error;
  const { data } = supabase.storage.from("certificates").getPublicUrl(path);
  return data.publicUrl;
}
