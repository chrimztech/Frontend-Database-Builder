// Client-side certificate PDF generator (PORTRAIT A4).
import { jsPDF, GState } from "jspdf";
import QRCode from "qrcode";
import { verificationUrl } from "./cert";
import { loadBranding } from "./branding";
import { isPdfMimeType, renderPdfBlobPageToDataUrl, renderSvgMarkupToDataUrl } from "./pdf-like";
import {
  DEFAULT_LAYOUT,
  DEFAULT_LOGO_OVERLAY,
  mmToPt,
  type LayoutField,
  type TemplateLayout,
} from "./template-layout";
import { registerCustomFontsInDoc, preloadCustomFonts } from "./font-loader";
import { applyDynamicSvgTextBindings } from "./svg-template";
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
  } catch {
    return null;
  }
}

function formatDate(d: string) {
  try {
    return new Date(d + "T00:00:00").toLocaleDateString("en-GB", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return d;
  }
}

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [40, 40, 40];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function styleToJsPdf(style?: string): "normal" | "bold" | "italic" | "bolditalic" {
  switch (style) {
    case "bold":
      return "bold";
    case "italic":
      return "italic";
    case "bolditalic":
      return "bolditalic";
    default:
      return "normal";
  }
}

function addContainedBackgroundImage(doc: jsPDF, dataUrl: string, pageW: number, pageH: number) {
  const props = doc.getImageProperties(dataUrl);
  const imageW = Number(props.width);
  const imageH = Number(props.height);

  if (!Number.isFinite(imageW) || !Number.isFinite(imageH) || imageW <= 0 || imageH <= 0) {
    doc.addImage(dataUrl, "PNG", 0, 0, pageW, pageH);
    return;
  }

  const imageRatio = imageW / imageH;
  const pageRatio = pageW / pageH;
  const drawW = imageRatio > pageRatio ? pageW : pageH * imageRatio;
  const drawH = imageRatio > pageRatio ? pageW / imageRatio : pageH;

  doc.addImage(dataUrl, "PNG", (pageW - drawW) / 2, (pageH - drawH) / 2, drawW, drawH);
}

function getDefaultSettings() {
  return {
    org_name: "The University of Zambia TeLs",
    org_prefix: "TELS",
    signatory1_name: "Authorized Signatory",
    signatory1_title: "Director, CICT",
    signatory2_name: "Authorized Signatory",
    signatory2_title: "Manager, CTU",
  };
}

function buildSvgDynamicTextValues(
  cert: CertificateInput,
  settings: ReturnType<typeof getDefaultSettings>,
) {
  return {
    recipientName: cert.recipientName,
    programme: cert.programme,
    issueDate: formatDate(cert.issueDate),
    certificateId: cert.certificateId,
    nrcNumber: cert.nrcNumber ?? "",
    signature1Name: settings.signatory1_name,
    signature1Title: settings.signatory1_title,
    signature2Name: settings.signatory2_name,
    signature2Title: settings.signatory2_title,
  } as const;
}

function resolveText(
  f: LayoutField,
  cert: CertificateInput,
  settings: ReturnType<typeof getDefaultSettings>,
): string {
  // Custom text blocks have a staticText property
  if (f.staticText !== undefined) return f.staticText;
  switch (f.id) {
    case "recipientName":
      return cert.recipientName;
    case "programme":
      return cert.programme;
    case "issueDate":
      return formatDate(cert.issueDate);
    case "certificateId":
      return `ID: ${cert.certificateId}`;
    case "nrcNumber":
      return cert.nrcNumber ? `NRC: ${cert.nrcNumber}` : "";
    case "signature1Name":
      return settings.signatory1_name;
    case "signature1Title":
      return settings.signatory1_title;
    case "signature2Name":
      return settings.signatory2_name;
    case "signature2Title":
      return settings.signatory2_title;
    default:
      return f.label ?? "";
  }
}

function resolveImageDataUrl(
  f: LayoutField,
  branding: Awaited<ReturnType<typeof loadBranding>> | null,
  qrDataUrl: string,
): string | null {
  switch (f.id) {
    case "qr":
      return qrDataUrl;
    case "seal":
      return branding?.sealDataUrl ?? null;
    case "signature1Image":
      return branding?.signatureDataUrl ?? null;
    case "signature2Image":
      return branding?.signature2DataUrl ?? null;
    default:
      return null; // custom image slots not yet backed by uploaded assets
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
        try {
          doc.addImage(data, "PNG", xPt, yPt, wPt, hPt);
        } catch {}
      }
    } else if (f.kind === "shape") {
      doc.setFillColor(...hexToRgb(f.fillColor ?? "#ffffff"));
      doc.rect(xPt, yPt, wPt, hPt, "F");
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

async function drawBuiltInSampleBackground(
  doc: jsPDF,
  settings: ReturnType<typeof getDefaultSettings>,
) {
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const x = (mm: number) => mmToPt(mm);
  const y = (mm: number) => mmToPt(mm);

  doc.setFillColor(247, 243, 231);
  doc.rect(0, 0, W, H, "F");

  doc.saveGraphicsState();
  doc.setGState(new GState({ opacity: 0.16 }));
  doc.setFont("helvetica", "bold");
  doc.setFontSize(4.2);
  doc.setTextColor(51, 91, 67);
  const micro = "The University of Zambia TeLs";
  for (let row = 20; row < 286; row += 5.6) {
    const wave = Math.sin(row / 7) * 5;
    for (let col = 18; col < 196; col += 34) {
      doc.text(micro, x(col + wave), y(row), { angle: row % 11 > 5 ? 6 : -6 } as any);
    }
  }
  doc.restoreGraphicsState();

  doc.saveGraphicsState();
  doc.setGState(new GState({ opacity: 0.28 }));
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(7);
  for (let row = 18; row < 286; row += 38) {
    doc.lines(
      [
        [x(28), y(-12)],
        [x(44), y(14)],
        [x(72), y(-10)],
        [x(102), y(12)],
      ],
      x(28),
      y(row),
    );
  }
  doc.restoreGraphicsState();

  doc.setDrawColor(26, 92, 46);
  doc.setLineWidth(2);
  doc.rect(x(14.5), y(13.8), x(181), y(269.8));
  doc.setDrawColor(14, 61, 31);
  doc.setLineWidth(1.6);
  doc.rect(x(16.6), y(15.9), x(176.8), y(265.2));
  doc.setDrawColor(43, 43, 43);
  doc.setLineWidth(0.5);
  doc.rect(x(19), y(18.3), x(172), y(260.4));

  const logoData = await fetchAsDataUrl(unzaLogo.url).catch(() => null);
  if (logoData) {
    try {
      doc.addImage(logoData, "PNG", x(87), y(22), x(36), y(36));
    } catch {}
  }

  doc.setTextColor(47, 51, 54);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text("THE UNIVERSITY OF ZAMBIA", x(105), y(76), { align: "center" });
  doc.setFontSize(12.5);
  doc.text("CENTRE FOR INFORMATION AND COMMUNICATION TECHNOLOGIES", x(105), y(86), {
    align: "center",
  });
  doc.setTextColor(49, 92, 67);
  doc.setFontSize(12.5);
  doc.text("CONSULTANCY AND TRAINING UNIT", x(105), y(96), { align: "center" });
  doc.setTextColor(58, 58, 58);
  doc.setFont("times", "italic");
  doc.setFontSize(12);
  doc.text("Putting Quality First", x(105), y(104), { align: "center" });

  doc.setTextColor(52, 56, 61);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(24);
  doc.text("CERTIFICATE OF COMPETENCE", x(105), y(126), { align: "center" });
  doc.setFont("times", "italic");
  doc.setFontSize(15);
  doc.text("This is to certify that", x(105), y(143), { align: "center" });
  doc.text("Completed training in the following course", x(105), y(207), { align: "center" });
  doc.text("Date:", x(93), y(246), { align: "right" });

  doc.setDrawColor(36, 63, 51);
  doc.setLineWidth(1.2);
  doc.line(x(30), y(247.5), x(78), y(247.5));
  doc.line(x(132), y(247.5), x(180), y(247.5));
  doc.setTextColor(47, 51, 54);
  doc.setFont("times", "bold");
  doc.setFontSize(11);
  doc.text(settings.signatory1_title || "Director, CICT", x(54), y(260), { align: "center" });
  doc.text(settings.signatory2_title || "Manager, CTU", x(156), y(260), { align: "center" });

  doc.setDrawColor(200, 157, 65);
  doc.setLineWidth(0.8);
  doc.rect(x(93), y(254), x(24), y(24));
  doc.setTextColor(192, 108, 24);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("QR", x(105), y(267), { align: "center" });

  doc.setTextColor(47, 51, 54);
  doc.setFont("courier", "bold");
  doc.setFontSize(7);
  doc.text("CERTIFICATE NO.", x(190), y(286), { align: "right" });
}

export async function generateCertificatePdf(cert: CertificateInput): Promise<Blob> {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();

  // Branding fetch and font cache warm-up run in parallel — biggest speed win on cold load
  const [branding] = await Promise.all([
    loadBranding().catch(() => null),
    preloadCustomFonts(),
  ]);

  const settings = branding?.settings ?? getDefaultSettings();
  const layout: TemplateLayout = branding?.layout ?? DEFAULT_LAYOUT;
  const overlay = layout.logoOverlay ?? DEFAULT_LOGO_OVERLAY;

  // Register fonts in jsPDF — base64 already in cache from preload above, near-instant
  const fontFamiliesUsed = layout.fields
    .filter((f) => f.kind === "text" && f.visible && f.fontFamily)
    .map((f) => f.fontFamily!);
  await registerCustomFontsInDoc(doc, fontFamiliesUsed);

  // Fields successfully bound into the SVG background — skip their overlay to avoid duplicates.
  const svgBoundFields = new Set<string>();

  // Kick off background rendering and QR code generation in parallel.
  // applyDynamicSvgTextBindings is synchronous, so svgBoundFields is populated
  // before the async rasterization begins — no race condition.
  let backgroundPromise: Promise<string | null>;
  if (branding?.templateBgSvgMarkup) {
    const svgOverrides = layout.svgBackgroundOverrides ?? {};
    const { markup: svgMarkupForRender, svgBoundFieldIds } = applyDynamicSvgTextBindings(
      branding.templateBgSvgMarkup,
      buildSvgDynamicTextValues(cert, settings),
      svgOverrides,
    );
    for (const id of svgBoundFieldIds) svgBoundFields.add(id);
    backgroundPromise = renderSvgMarkupToDataUrl(svgMarkupForRender, {
      targetWidth: 1240,
      targetHeight: 1754,
    }).catch(() => null);
  } else if (branding?.templateBgBlob && isPdfMimeType(branding.templateBgMimeType)) {
    backgroundPromise = renderPdfBlobPageToDataUrl(branding.templateBgBlob, {
      targetWidth: 1240,
      targetHeight: 1754,
    }).catch(() => null);
  } else {
    backgroundPromise = Promise.resolve(branding?.templateBgDataUrl ?? null);
  }

  const [backgroundDataUrl, qrDataUrl] = await Promise.all([
    backgroundPromise,
    QRCode.toDataURL(verificationUrl(cert.certificateId), {
      margin: 1,
      width: 320,
      color: { dark: "#1a5c2e", light: "#ffffff" },
    }),
  ]);

  if (backgroundDataUrl) {
    try {
      addContainedBackgroundImage(doc, backgroundDataUrl, W, H);
    } catch {
      doc.setFillColor(245, 241, 232);
      doc.rect(0, 0, W, H, "F");
    }
  } else {
    await drawBuiltInSampleBackground(doc, settings);
  }

  // UNZA logo watermark overlay
  if (overlay.enabled && overlay.opacity > 0) {
    const logoData = await fetchAsDataUrl(unzaLogo.url).catch(() => null);
    if (logoData) {
      doc.saveGraphicsState();
      doc.setGState(new GState({ opacity: overlay.opacity }));
      try {
        doc.addImage(
          logoData,
          "PNG",
          mmToPt(overlay.x),
          mmToPt(overlay.y),
          mmToPt(overlay.w),
          mmToPt(overlay.h),
        );
      } catch {}
      doc.restoreGraphicsState();
    }
  }

  // Image fields are always drawn as overlays (SVG binding never handles images).
  const IMAGE_OVERLAY_IDS = new Set(["qr", "seal", "signature1Image", "signature2Image"]);

  for (const f of layout.fields) {
    // Skip text/shape overlays for fields the SVG background already rendered —
    // drawing them again would double-print programme, name, etc. on top of the SVG text.
    if (svgBoundFields.has(f.id) && !IMAGE_OVERLAY_IDS.has(f.id)) continue;
    drawField(doc, f, cert, settings, branding, qrDataUrl);
  }

  try {
    return doc.output("blob");
  } catch (err) {
    // A corrupted custom font registration can cause jsPDF to fail on output.
    // Recover by rebuilding with only built-in fonts and the default background.
    console.warn("[pdf] doc.output() failed — retrying with built-in fonts only:", err);
    const fallback = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
    await drawBuiltInSampleBackground(fallback, settings);
    for (const f of layout.fields) {
      if (svgBoundFields.has(f.id) && !IMAGE_OVERLAY_IDS.has(f.id)) continue;
      drawField(fallback, { ...f, fontFamily: undefined }, cert, settings, branding, qrDataUrl);
    }
    return fallback.output("blob");
  }
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

/** Renders the certificate and uploads the PDF directly to Cloudflare R2. */
export async function uploadCertificatePdf(cert: CertificateInput): Promise<string> {
  const blob = await generateCertificatePdf(cert);

  // Get a presigned PUT URL from the server (R2 credentials stay server-side)
  const { getCertificatePdfUploadUrl } = await import("@/lib/api/certificates.functions");
  const { presignedUrl, key } = await getCertificatePdfUploadUrl({
    data: { certificateCode: cert.certificateId },
  });

  // Upload directly from the browser to R2 via the presigned URL
  const res = await fetch(presignedUrl, {
    method: "PUT",
    headers: { "Content-Type": "application/pdf" },
    body: blob,
  });
  if (!res.ok) throw new Error(`PDF upload failed: ${res.status} ${res.statusText}`);

  // Return the key so callers can build a URL if needed
  return key;
}
