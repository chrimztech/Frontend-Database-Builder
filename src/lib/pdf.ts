// Client-side certificate PDF generator (PORTRAIT A4) with QR code, digital seal,
// two signature blocks, and a customizable template layout (positions/fonts saved
// from the Template Editor).
import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import { verificationUrl } from "./cert";
import { loadBranding } from "./branding";
import { DEFAULT_LAYOUT, mmToPt, type FieldId, type LayoutField, type TemplateLayout } from "./template-layout";

export interface CertificateInput {
  certificateId: string;
  recipientName: string;
  programme: string;
  issueDate: string; // YYYY-MM-DD
  issuerName?: string; // back-compat; unused
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

function textValueFor(id: FieldId, cert: CertificateInput, settings: ReturnType<typeof getDefaultSettings>): string {
  switch (id) {
    case "recipientName": return cert.recipientName;
    case "programme":     return cert.programme;
    case "issueDate":     return formatDate(cert.issueDate);
    case "certificateId": return `ID: ${cert.certificateId}`;
    case "signature1Name":  return settings.signatory1_name;
    case "signature1Title": return settings.signatory1_title;
    case "signature2Name":  return settings.signatory2_name;
    case "signature2Title": return settings.signatory2_title;
    default: return "";
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

function imageDataUrlFor(id: FieldId, branding: Awaited<ReturnType<typeof loadBranding>> | null, qrDataUrl: string): string | null {
  switch (id) {
    case "qr": return qrDataUrl;
    case "seal": return branding?.sealDataUrl ?? null;
    case "signature1Image": return branding?.signatureDataUrl ?? null;
    case "signature2Image": return branding?.signature2DataUrl ?? null;
    default: return null;
  }
}

function drawField(doc: jsPDF, f: LayoutField, cert: CertificateInput, settings: ReturnType<typeof getDefaultSettings>, branding: Awaited<ReturnType<typeof loadBranding>> | null, qrDataUrl: string) {
  if (!f.visible) return;
  const xPt = mmToPt(f.x);
  const yPt = mmToPt(f.y);
  const wPt = mmToPt(f.w);
  const hPt = mmToPt(f.h);

  if (f.kind === "image") {
    const data = imageDataUrlFor(f.id, branding, qrDataUrl);
    if (!data) return;
    try { doc.addImage(data, "PNG", xPt, yPt, wPt, hPt); } catch {}
    return;
  }

  const text = textValueFor(f.id, cert, settings);
  if (!text) return;
  doc.setFont(f.fontFamily ?? "helvetica", styleToJsPdf(f.fontStyle));
  doc.setFontSize(f.fontSize ?? 11);
  doc.setTextColor(...hexToRgb(f.color ?? "#282828"));
  const align = f.align ?? "left";
  // jsPDF text() y is the baseline. Place text centered vertically inside the field box.
  const baselineY = yPt + Math.max(hPt * 0.75, (f.fontSize ?? 11) * 0.85);
  let xText = xPt;
  if (align === "center") xText = xPt + wPt / 2;
  else if (align === "right") xText = xPt + wPt;
  doc.text(text, xText, baselineY, { align, maxWidth: wPt });
}

export async function generateCertificatePdf(cert: CertificateInput): Promise<Blob> {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();

  const branding = await loadBranding().catch(() => null);
  const settings = branding?.settings ?? getDefaultSettings();
  const layout: TemplateLayout = branding?.layout ?? DEFAULT_LAYOUT;

  // Background
  if (branding?.templateBgDataUrl) {
    try { doc.addImage(branding.templateBgDataUrl, "PNG", 0, 0, W, H); }
    catch {
      doc.setFillColor(245, 241, 232);
      doc.rect(0, 0, W, H, "F");
    }
  } else {
    // Fallback navy/gold frame so the certificate is still presentable without a template.
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

  // QR code (always generated, placed via layout)
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
