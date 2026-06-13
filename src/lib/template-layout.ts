// Certificate template layout schema. Coordinates are stored in millimetres (mm)
// relative to A4 portrait (210mm × 297mm), top-left origin, so they stay accurate
// regardless of the background image resolution.

export const A4_MM = { w: 210, h: 297 } as const;
export const MM_TO_PT = 2.83464567;

export type FieldId =
  | "recipientName"
  | "programme"
  | "issueDate"
  | "certificateId"
  | "qr"
  | "seal"
  | "signature1Image"
  | "signature1Name"
  | "signature1Title"
  | "signature2Image"
  | "signature2Name"
  | "signature2Title";

export type FieldKind = "text" | "image";

export type FontFamily = "helvetica" | "times" | "courier";
export type FontStyle = "normal" | "bold" | "italic" | "bolditalic";
export type TextAlign = "left" | "center" | "right";

export interface LayoutField {
  id: FieldId;
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
}

export interface TemplateLayout {
  version: 1;
  fields: LayoutField[];
}

export const FIELD_LABELS: Record<FieldId, string> = {
  recipientName: "Recipient name",
  programme: "Programme",
  issueDate: "Issue date",
  certificateId: "Certificate ID",
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
  qr: "image",
  seal: "image",
  signature1Image: "image",
  signature1Name: "text",
  signature1Title: "text",
  signature2Image: "image",
  signature2Name: "text",
  signature2Title: "text",
};

// Default layout mirrors the existing hardcoded design (centred portrait A4).
export const DEFAULT_LAYOUT: TemplateLayout = {
  version: 1,
  fields: [
    { id: "recipientName", kind: "text", visible: true, x: 20, y: 84, w: 170, h: 14, fontFamily: "times", fontStyle: "bold", fontSize: 30, color: "#0b1d3a", align: "center" },
    { id: "programme",     kind: "text", visible: true, x: 20, y: 110, w: 170, h: 10, fontFamily: "times", fontStyle: "italic", fontSize: 20, color: "#0b1d3a", align: "center" },
    { id: "issueDate",     kind: "text", visible: true, x: 20, y: 122, w: 170, h: 8, fontFamily: "helvetica", fontStyle: "normal", fontSize: 11, color: "#282828", align: "center" },
    { id: "seal",          kind: "image", visible: true, x: 86, y: 135, w: 38, h: 38 },
    { id: "signature1Image", kind: "image", visible: true, x: 27, y: 230, w: 50, h: 16 },
    { id: "signature1Name",  kind: "text", visible: true, x: 18, y: 250, w: 70, h: 6, fontFamily: "helvetica", fontStyle: "bold", fontSize: 11, color: "#0b1d3a", align: "center" },
    { id: "signature1Title", kind: "text", visible: true, x: 18, y: 256, w: 70, h: 5, fontFamily: "helvetica", fontStyle: "normal", fontSize: 9, color: "#282828", align: "center" },
    { id: "signature2Image", kind: "image", visible: true, x: 133, y: 230, w: 50, h: 16 },
    { id: "signature2Name",  kind: "text", visible: true, x: 122, y: 250, w: 70, h: 6, fontFamily: "helvetica", fontStyle: "bold", fontSize: 11, color: "#0b1d3a", align: "center" },
    { id: "signature2Title", kind: "text", visible: true, x: 122, y: 256, w: 70, h: 5, fontFamily: "helvetica", fontStyle: "normal", fontSize: 9, color: "#282828", align: "center" },
    { id: "qr",            kind: "image", visible: true, x: 91, y: 263, w: 28, h: 28 },
    { id: "certificateId", kind: "text", visible: true, x: 14, y: 290, w: 80, h: 5, fontFamily: "courier", fontStyle: "normal", fontSize: 8, color: "#0b1d3a", align: "left" },
  ],
};

export function ensureLayout(raw: unknown): TemplateLayout {
  if (!raw || typeof raw !== "object") return DEFAULT_LAYOUT;
  const obj = raw as Partial<TemplateLayout>;
  if (obj.version !== 1 || !Array.isArray(obj.fields)) return DEFAULT_LAYOUT;
  // Merge: any missing field falls back to default so newly-added fields still render.
  const byId = new Map(obj.fields.map((f) => [f.id, f] as const));
  const merged = DEFAULT_LAYOUT.fields.map((d) => ({ ...d, ...(byId.get(d.id) ?? {}) }));
  return { version: 1, fields: merged };
}

export function mmToPt(mm: number) { return mm * MM_TO_PT; }
