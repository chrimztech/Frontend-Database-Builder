// Certificate template layout schema. Coordinates are stored in millimetres (mm)
// relative to A4 portrait (210mm x 297mm), top-left origin, so they stay accurate
// regardless of the background image resolution.

export const A4_MM = { w: 210, h: 297 } as const;
export const MM_TO_PT = 2.83464567;

export type FieldId =
  | "recipientName"
  | "programme"
  | "issueDate"
  | "certificateId"
  | "nrcNumber"
  | "qr"
  | "seal"
  | "signature1Image"
  | "signature1Name"
  | "signature1Title"
  | "signature2Image"
  | "signature2Name"
  | "signature2Title";

export type FieldKind = "text" | "image" | "shape";

export type FontFamily =
  | "helvetica"
  | "times"
  | "courier"
  | "cormorant"
  | "playfair"
  | "manrope"
  | "lato"
  | "cinzel";
export type FontStyle = "normal" | "bold" | "italic" | "bolditalic";
export type TextAlign = "left" | "center" | "right";

export interface LayoutField {
  id: string; // FieldId for predefined fields; "custom_N" for user-added blocks
  label?: string; // display name for custom fields
  staticText?: string; // the literal text for custom text blocks (not from cert data)
  kind: FieldKind;
  visible: boolean;
  x: number; // mm, top-left
  y: number; // mm, top-left
  w: number; // mm
  h: number; // mm
  fontFamily?: FontFamily;
  fontStyle?: FontStyle;
  fontSize?: number; // pt
  color?: string; // hex
  align?: TextAlign;
  letterSpacing?: number; // pt, 0 = normal
  textTransform?: "none" | "uppercase" | "lowercase";
  opacity?: number; // 0-1, default 1
  fillColor?: string;
}

export interface LogoOverlay {
  enabled: boolean;
  x: number; // mm
  y: number; // mm
  w: number; // mm
  h: number; // mm
  opacity: number; // 0-1
}

export interface SvgBackgroundOverride {
  text?: string;
  hrefDataUrl?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fontSize?: number;
  fill?: string;
  opacity?: number;
}

export const DEFAULT_LOGO_OVERLAY: LogoOverlay = {
  enabled: false,
  x: 70,
  y: 100,
  w: 70,
  h: 70,
  opacity: 0.08,
};

export interface TemplateLayout {
  version: 1;
  fields: LayoutField[];
  logoOverlay?: LogoOverlay;
  svgBackgroundOverrides?: Record<string, SvgBackgroundOverride>;
}

export const FIELD_LABELS: Record<FieldId, string> = {
  recipientName: "Recipient name",
  programme: "Programme",
  issueDate: "Issue date",
  certificateId: "Certificate ID",
  nrcNumber: "NRC Number",
  qr: "QR code",
  seal: "Digital seal",
  signature1Image: "Signature 1 (image)",
  signature1Name: "Signature 1 name",
  signature1Title: "Signature 1 title",
  signature2Image: "Signature 2 (image)",
  signature2Name: "Signature 2 name",
  signature2Title: "Signature 2 title",
};

export const FIELD_KINDS: Record<FieldId, FieldKind> = {
  recipientName: "text",
  programme: "text",
  issueDate: "text",
  certificateId: "text",
  nrcNumber: "text",
  qr: "image",
  seal: "image",
  signature1Image: "image",
  signature1Name: "text",
  signature1Title: "text",
  signature2Image: "image",
  signature2Name: "text",
  signature2Title: "text",
};

export function getFieldLabel(f: LayoutField): string {
  if (f.label) return f.label;
  return FIELD_LABELS[f.id as FieldId] ?? f.id;
}

export function isPredefined(id: string): id is FieldId {
  return id in FIELD_LABELS;
}

// Default layout follows the UNZA TeLs competence certificate sample.
export const DEFAULT_LAYOUT: TemplateLayout = {
  version: 1,
  fields: [
    {
      id: "recipientName",
      kind: "text",
      visible: true,
      x: 19,
      y: 154,
      w: 172,
      h: 14,
      fontFamily: "cormorant",
      fontStyle: "bolditalic",
      fontSize: 34,
      color: "#2f3336",
      align: "center",
    },
    {
      id: "nrcNumber",
      kind: "text",
      visible: true,
      x: 38,
      y: 180,
      w: 134,
      h: 9,
      fontFamily: "manrope",
      fontStyle: "bold",
      fontSize: 15,
      color: "#2f3336",
      align: "center",
      letterSpacing: 1.5,
    },
    {
      id: "programme",
      kind: "text",
      visible: true,
      x: 24,
      y: 217,
      w: 162,
      h: 14,
      fontFamily: "manrope",
      fontStyle: "bold",
      fontSize: 17,
      color: "#b23337",
      align: "center",
      letterSpacing: 2,
      textTransform: "uppercase",
    },
    {
      id: "issueDate",
      kind: "text",
      visible: true,
      x: 100,
      y: 241,
      w: 54,
      h: 6,
      fontFamily: "times",
      fontStyle: "normal",
      fontSize: 11,
      color: "#2f3336",
      align: "left",
    },
    { id: "seal", kind: "image", visible: true, x: 86, y: 17, w: 38, h: 38, opacity: 1 },
    { id: "signature1Image", kind: "image", visible: true, x: 28, y: 246, w: 48, h: 16 },
    {
      id: "signature1Name",
      kind: "text",
      visible: false,
      x: 20,
      y: 266,
      w: 70,
      h: 6,
      fontFamily: "helvetica",
      fontStyle: "bold",
      fontSize: 9,
      color: "#2f3336",
      align: "center",
    },
    {
      id: "signature1Title",
      kind: "text",
      visible: false,
      x: 18,
      y: 260,
      w: 70,
      h: 6,
      fontFamily: "times",
      fontStyle: "bold",
      fontSize: 12,
      color: "#2f3336",
      align: "center",
    },
    { id: "signature2Image", kind: "image", visible: true, x: 134, y: 246, w: 48, h: 16 },
    {
      id: "signature2Name",
      kind: "text",
      visible: false,
      x: 120,
      y: 266,
      w: 70,
      h: 6,
      fontFamily: "helvetica",
      fontStyle: "bold",
      fontSize: 9,
      color: "#2f3336",
      align: "center",
    },
    {
      id: "signature2Title",
      kind: "text",
      visible: false,
      x: 122,
      y: 260,
      w: 70,
      h: 6,
      fontFamily: "times",
      fontStyle: "bold",
      fontSize: 12,
      color: "#2f3336",
      align: "center",
    },
    { id: "qr", kind: "image", visible: true, x: 93, y: 254, w: 24, h: 24 },
    {
      id: "certificateId",
      kind: "text",
      visible: true,
      x: 148,
      y: 284,
      w: 42,
      h: 4.8,
      fontFamily: "courier",
      fontStyle: "bold",
      fontSize: 8,
      color: "#2f3336",
      align: "right",
    },
  ],
  svgBackgroundOverrides: {},
};

// Layout for SVG backgrounds that carry all text via {{...}} bindings.
// All predefined text fields are hidden; image overlays are positioned to
// match the built-in sample SVG template (2480×3508 px → A4 portrait).
export const SVG_SAMPLE_LAYOUT: TemplateLayout = {
  version: 1,
  fields: [
    // Text fields — hidden, SVG template owns all text
    { id: "recipientName", kind: "text", visible: false, x: 19, y: 154, w: 172, h: 14 },
    { id: "nrcNumber", kind: "text", visible: false, x: 38, y: 180, w: 134, h: 9 },
    { id: "programme", kind: "text", visible: false, x: 24, y: 217, w: 162, h: 14 },
    { id: "issueDate", kind: "text", visible: false, x: 100, y: 241, w: 54, h: 6 },
    { id: "certificateId", kind: "text", visible: false, x: 148, y: 284, w: 42, h: 4.8 },
    { id: "signature1Name", kind: "text", visible: false, x: 20, y: 266, w: 70, h: 6 },
    { id: "signature1Title", kind: "text", visible: false, x: 18, y: 260, w: 70, h: 6 },
    { id: "signature2Name", kind: "text", visible: false, x: 120, y: 266, w: 70, h: 6 },
    { id: "signature2Title", kind: "text", visible: false, x: 122, y: 260, w: 70, h: 6 },
    // Image fields — coordinates derived from SVG template units (2480×3508) → mm
    { id: "seal", kind: "image", visible: true, x: 86, y: 17, w: 38, h: 38, opacity: 1 },
    // Signature images sit just above their underlines (SVG line at y≈212mm)
    { id: "signature1Image", kind: "image", visible: true, x: 27, y: 196, w: 48, h: 16 },
    { id: "signature2Image", kind: "image", visible: true, x: 135, y: 196, w: 48, h: 16 },
    // QR code over the SVG placeholder box (SVG: x=1086, y=2648, 308×308 px)
    { id: "qr", kind: "image", visible: true, x: 92, y: 224, w: 26, h: 26 },
  ],
};

export function toQrOnlyLayout(layout: TemplateLayout = DEFAULT_LAYOUT): TemplateLayout {
  const defaultQr = DEFAULT_LAYOUT.fields.find((field) => field.id === "qr");
  const existingQr = layout.fields.find((field) => field.id === "qr");
  const qr = existingQr ?? defaultQr;

  if (!qr) {
    return {
      version: 1,
      fields: [],
      logoOverlay: { ...DEFAULT_LOGO_OVERLAY, enabled: false },
      svgBackgroundOverrides: {},
    };
  }

  return {
    version: 1,
    fields: [{ ...qr, visible: true }],
    logoOverlay: { ...(layout.logoOverlay ?? DEFAULT_LOGO_OVERLAY), enabled: false },
    svgBackgroundOverrides: {},
  };
}

export function isQrOnlyLayout(layout: TemplateLayout) {
  const visibleFields = layout.fields.filter((field) => field.visible);
  return visibleFields.length === 1 && visibleFields[0]?.id === "qr";
}

export function ensureLayout(raw: unknown): TemplateLayout {
  if (!raw || typeof raw !== "object") return DEFAULT_LAYOUT;
  const obj = raw as Partial<TemplateLayout>;
  if (obj.version !== 1 || !Array.isArray(obj.fields)) return DEFAULT_LAYOUT;

  const defaultById = new Map(DEFAULT_LAYOUT.fields.map((f) => [f.id, f]));

  // Merge each saved field: predefined fields get missing defaults filled in;
  // custom fields are kept as-is. Fields not present in saved are absent (user deleted them).
  const fields: LayoutField[] = obj.fields.map((saved) => {
    const def = defaultById.get(saved.id);
    return def ? { ...def, ...saved } : { ...saved };
  });

  const logoOverlay: LogoOverlay = obj.logoOverlay
    ? { ...DEFAULT_LOGO_OVERLAY, ...obj.logoOverlay }
    : DEFAULT_LOGO_OVERLAY;

  const svgBackgroundOverrides =
    obj.svgBackgroundOverrides &&
    typeof obj.svgBackgroundOverrides === "object" &&
    !Array.isArray(obj.svgBackgroundOverrides)
      ? obj.svgBackgroundOverrides
      : {};

  return { version: 1, fields, logoOverlay, svgBackgroundOverrides };
}

export function mmToPt(mm: number) {
  return mm * MM_TO_PT;
}
