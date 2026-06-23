import { extractPdfPageTextItems, type PdfPageTextItem } from "./pdf-like";
import {
  A4_MM,
  DEFAULT_LAYOUT,
  DEFAULT_LOGO_OVERLAY,
  type FieldId,
  type LayoutField,
  type TemplateLayout,
} from "./template-layout";

type TextFieldId =
  | "recipientName"
  | "programme"
  | "issueDate"
  | "certificateId"
  | "nrcNumber"
  | "signature1Name"
  | "signature1Title"
  | "signature2Name"
  | "signature2Title";

interface RawTextItem {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  color?: string;
}

interface TemplateTextLine {
  index: number;
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  fontSize: number;
  centerX: number;
  color?: string;
}

export interface TemplateFieldDetectionResult {
  layout: TemplateLayout;
  detectedCount: number;
  detectedIds: FieldId[];
  source: "svg" | "pdf";
  notes: string[];
  usedFallback: boolean;
}

const TEXT_FIELD_ORDER: TextFieldId[] = [
  "recipientName",
  "programme",
  "issueDate",
  "certificateId",
  "nrcNumber",
  "signature1Name",
  "signature1Title",
  "signature2Name",
  "signature2Title",
];

const DATE_RE =
  /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b|\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b|\b\d{4}-\d{1,2}-\d{1,2}\b/i;
const CERT_ID_RE =
  /\b(?:certificate|cert)\s*(?:id|no|number|#)\b|\b[A-Z]{2,}\d{6,}\b|\b[A-Z]{2,}-\d{4}-[A-Z0-9-]{4,}\b/i;
const NRC_RE = /\bNRC\b|\bnational\s+(?:id|registration)\b|\b\d{6}\/\d{2}\/\d\b/i;
const PROGRAMME_RE =
  /\b(programme|program|course|training|diploma|degree|certification|fundamentals|workshop|bootcamp|skills?|essentials?|computer|ict|excel|word|powerpoint)\b/i;
const TITLE_RE =
  /\b(director|coordinator|manager|registrar|officer|chair|head|lead|principal|dean|instructor|signatory|secretary|founder|ceo|administrator)\b/i;
const DECORATIVE_RE =
  /\b(certificate|completion|achievement|appreciation|awarded|presented|certifies|successfully|hereby|institution|organization|organisation|university|school|academy|official)\b/i;

function normalizeText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function parseNumber(value: string | null | undefined) {
  if (!value) return undefined;
  const firstToken = value.trim().split(/[\s,]+/)[0];
  const parsed = Number(firstToken.replace(/px|pt|mm|cm|in$/i, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseLength(value: string | null | undefined) {
  if (!value) return undefined;

  const match = value.trim().match(/^(-?\d*\.?\d+)(px|pt|mm|cm|in)?$/i);
  if (!match) return undefined;

  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return undefined;

  switch (match[2]?.toLowerCase()) {
    case "pt":
      return amount * (96 / 72);
    case "mm":
      return amount * (96 / 25.4);
    case "cm":
      return amount * (96 / 2.54);
    case "in":
      return amount * 96;
    default:
      return amount;
  }
}

function parseStyle(style: string | null | undefined) {
  return Object.fromEntries(
    (style ?? "")
      .split(";")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const [rawName, ...rawValue] = entry.split(":");
        return [rawName?.trim().toLowerCase(), rawValue.join(":").trim()] as const;
      })
      .filter(([name, value]) => !!name && !!value),
  ) as Record<string, string>;
}

function presentationValue(el: Element | null, attr: string): string | null {
  let current: Element | null = el;
  while (current) {
    const direct = current.getAttribute(attr);
    if (direct) return direct;
    const styled = parseStyle(current.getAttribute("style"))[attr.toLowerCase()];
    if (styled) return styled;
    current = current.parentElement;
  }
  return null;
}

function readSvgGeometry(root: Element) {
  const rawViewBox = root
    .getAttribute("viewBox")
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);
  const viewBox =
    rawViewBox?.length === 4 && rawViewBox.every(Number.isFinite)
      ? { minX: rawViewBox[0], minY: rawViewBox[1], width: rawViewBox[2], height: rawViewBox[3] }
      : null;

  const width = viewBox?.width ?? parseLength(root.getAttribute("width")) ?? 595;
  const height = viewBox?.height ?? parseLength(root.getAttribute("height")) ?? 842;

  return {
    minX: viewBox?.minX ?? 0,
    minY: viewBox?.minY ?? 0,
    width,
    height,
  };
}

interface SimpleTransform {
  scaleX: number;
  scaleY: number;
  x: number;
  y: number;
}

function identityTransform(): SimpleTransform {
  return { scaleX: 1, scaleY: 1, x: 0, y: 0 };
}

function combineTransforms(parent: SimpleTransform, local: SimpleTransform): SimpleTransform {
  return {
    scaleX: parent.scaleX * local.scaleX,
    scaleY: parent.scaleY * local.scaleY,
    x: parent.x + local.x * parent.scaleX,
    y: parent.y + local.y * parent.scaleY,
  };
}

function parseTransform(transform: string | null | undefined): SimpleTransform {
  if (!transform) return identityTransform();

  let next = identityTransform();
  const commands = transform.match(/[a-z]+\([^)]*\)/gi) ?? [];

  for (const command of commands) {
    const name = command.slice(0, command.indexOf("(")).toLowerCase();
    const values = command
      .slice(command.indexOf("(") + 1, -1)
      .trim()
      .split(/[\s,]+/)
      .map(Number);

    if (name === "translate") {
      next = combineTransforms(next, {
        scaleX: 1,
        scaleY: 1,
        x: Number.isFinite(values[0]) ? values[0] : 0,
        y: Number.isFinite(values[1]) ? values[1] : 0,
      });
    }

    if (name === "scale") {
      const sx = Number.isFinite(values[0]) ? values[0] : 1;
      const sy = Number.isFinite(values[1]) ? values[1] : sx;
      next = combineTransforms(next, { scaleX: sx, scaleY: sy, x: 0, y: 0 });
    }

    if (name === "matrix" && values.length >= 6) {
      next = combineTransforms(next, {
        scaleX: Number.isFinite(values[0]) ? values[0] : 1,
        scaleY: Number.isFinite(values[3]) ? values[3] : 1,
        x: Number.isFinite(values[4]) ? values[4] : 0,
        y: Number.isFinite(values[5]) ? values[5] : 0,
      });
    }
  }

  return next;
}

function cumulativeTransform(el: Element, root: Element): SimpleTransform {
  const chain: Element[] = [];
  let current: Element | null = el;

  while (current && current !== root) {
    chain.unshift(current);
    current = current.parentElement;
  }

  return chain.reduce(
    (transform, item) => combineTransforms(transform, parseTransform(item.getAttribute("transform"))),
    identityTransform(),
  );
}

function firstCoordinate(el: Element, attr: "x" | "y") {
  let current: Element | null = el;
  while (current) {
    const value = parseNumber(current.getAttribute(attr));
    if (value !== undefined) return value;
    current = current.parentElement;
  }
  return undefined;
}

function collectSvgTextItems(svgMarkup: string): { items: RawTextItem[]; width: number; height: number } {
  const doc = new DOMParser().parseFromString(svgMarkup, "image/svg+xml");
  const root = doc.documentElement;
  const parseError = doc.querySelector("parsererror");

  if (parseError || root.tagName.toLowerCase() !== "svg") {
    throw new Error("The uploaded SVG could not be parsed.");
  }

  const geometry = readSvgGeometry(root);
  const textItems: RawTextItem[] = [];

  for (const textEl of Array.from(root.querySelectorAll("text"))) {
    const tspans = Array.from(textEl.querySelectorAll("tspan")).filter((tspan) =>
      Boolean(normalizeText(tspan.textContent ?? "")),
    );
    const elements = tspans.length > 0 ? tspans : [textEl];

    for (const el of elements) {
      const text = normalizeText(el.textContent ?? "");
      if (!text) continue;

      const transform = cumulativeTransform(el, root);
      const rawX = firstCoordinate(el, "x") ?? 0;
      const rawY = firstCoordinate(el, "y") ?? 0;
      if (rawX === 0 && rawY === 0 && transform.x === 0 && transform.y === 0) continue;

      const fontSize = Math.max(
        1,
        (parseNumber(presentationValue(el, "font-size")) ?? 12) * Math.abs(transform.scaleY),
      );
      const x = rawX * transform.scaleX + transform.x;
      const baselineY = rawY * transform.scaleY + transform.y;
      const width =
        text.length === 1
          ? fontSize * 0.35
          : Math.max(fontSize * 0.4, text.length * fontSize * 0.55);

      textItems.push({
        text,
        x,
        y: baselineY - fontSize * 0.85,
        width,
        height: fontSize * 1.15,
        fontSize,
        color: normalizeColor(presentationValue(el, "fill")),
      });
    }
  }

  return {
    items: textItems.map((item) => ({
      ...item,
      x: item.x - geometry.minX,
      y: item.y - geometry.minY,
    })),
    width: geometry.width,
    height: geometry.height,
  };
}

function normalizeColor(value: string | null) {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (/^#[0-9a-f]{3,8}$/i.test(trimmed)) return trimmed.slice(0, 7);
  return undefined;
}

function rawItemsToLines(items: RawTextItem[], pageWidth: number, pageHeight: number) {
  const sorted = [...items]
    .filter((item) => item.text.length > 0 && item.width > 0 && item.height > 0)
    .sort((a, b) => a.y - b.y || a.x - b.x);

  const groups: RawTextItem[][] = [];

  for (const item of sorted) {
    const last = groups[groups.length - 1];
    const lastY =
      last && last.length > 0 ? last.reduce((sum, next) => sum + next.y, 0) / last.length : null;
    const tolerance = Math.max(1.8, item.fontSize * 0.7);

    if (last && lastY !== null && Math.abs(lastY - item.y) <= tolerance) {
      last.push(item);
    } else {
      groups.push([item]);
    }
  }

  return groups
    .map((group, index): TemplateTextLine | null => {
      const lineItems = [...group].sort((a, b) => a.x - b.x);
      const minX = Math.min(...lineItems.map((item) => item.x));
      const minY = Math.min(...lineItems.map((item) => item.y));
      const maxX = Math.max(...lineItems.map((item) => item.x + item.width));
      const maxY = Math.max(...lineItems.map((item) => item.y + item.height));
      const fontSize =
        lineItems.reduce((sum, item) => sum + item.fontSize, 0) / Math.max(1, lineItems.length);
      let text = "";
      let previousEnd: number | null = null;

      for (const item of lineItems) {
        if (previousEnd !== null) {
          const gap = item.x - previousEnd;
          if (gap > Math.max(fontSize * 0.45, 2.5)) text += " ";
        }
        text += item.text;
        previousEnd = item.x + item.width;
      }

      text = normalizeText(text);
      if (text.length < 2) return null;

      const x = (minX / pageWidth) * A4_MM.w;
      const y = (minY / pageHeight) * A4_MM.h;
      const w = ((maxX - minX) / pageWidth) * A4_MM.w;
      const h = ((maxY - minY) / pageHeight) * A4_MM.h;

      return {
        index,
        text,
        x: clamp(x, 0, A4_MM.w),
        y: clamp(y, 0, A4_MM.h),
        w: clamp(w, 4, A4_MM.w),
        h: clamp(h, 3, A4_MM.h),
        fontSize: clamp((fontSize / pageHeight) * A4_MM.h * 2.83464567, 6, 42),
        centerX: clamp(x + w / 2, 0, A4_MM.w),
        color: lineItems.find((item) => item.color)?.color,
      };
    })
    .filter((line): line is TemplateTextLine => Boolean(line));
}

function pdfItemsToLines(items: PdfPageTextItem[]) {
  const pageWidth = items[0]?.pageWidth ?? 595;
  const pageHeight = items[0]?.pageHeight ?? 842;

  return rawItemsToLines(
    items.map((item) => ({
      text: item.text,
      x: item.x,
      y: item.y,
      width: Math.max(item.width, item.text.length * item.height * 0.5),
      height: Math.max(item.height, 6),
      fontSize: Math.max(item.height, 6),
    })),
    pageWidth,
    pageHeight,
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function isDateLine(line: TemplateTextLine) {
  return DATE_RE.test(line.text) || /\bdate\b/i.test(line.text);
}

function isCertIdLine(line: TemplateTextLine) {
  return CERT_ID_RE.test(line.text);
}

function isNrcLine(line: TemplateTextLine) {
  return NRC_RE.test(line.text);
}

function isProgrammeLine(line: TemplateTextLine) {
  return PROGRAMME_RE.test(line.text);
}

function looksLikePersonName(line: TemplateTextLine) {
  const words = line.text.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 5) return false;
  if (/[0-9:|]/.test(line.text)) return false;
  if (DECORATIVE_RE.test(line.text) || PROGRAMME_RE.test(line.text)) return false;

  const nameLikeWords = words.filter((word) => /^[A-Z][a-z'.-]+$/.test(word) || /^[A-Z]{2,}$/.test(word));
  return nameLikeWords.length / words.length >= 0.7;
}

function sortByScore<T>(items: T[], score: (item: T) => number) {
  return [...items].sort((a, b) => score(b) - score(a));
}

function chooseLine(
  lines: TemplateTextLine[],
  used: Set<number>,
  filter: (line: TemplateTextLine) => boolean,
  score: (line: TemplateTextLine) => number,
) {
  return sortByScore(
    lines.filter((line) => !used.has(line.index) && filter(line)),
    score,
  )[0];
}

function detectLineFields(lines: TemplateTextLine[]) {
  const detected = new Map<TextFieldId, TemplateTextLine>();
  const used = new Set<number>();
  const bodyLines = lines.filter((line) => line.y >= 45 && line.y <= 190 && line.text.length <= 120);

  const recipient = chooseLine(
    bodyLines,
    used,
    (line) =>
      looksLikePersonName(line) &&
      !isDateLine(line) &&
      !isCertIdLine(line) &&
      !isNrcLine(line),
    (line) => line.fontSize * 4 + (A4_MM.w / 2 - Math.abs(line.centerX - A4_MM.w / 2)) - Math.abs(line.y - 92),
  );
  if (recipient) {
    detected.set("recipientName", recipient);
    used.add(recipient.index);
  }

  const programme = chooseLine(
    bodyLines,
    used,
    (line) =>
      isProgrammeLine(line) ||
      Boolean(recipient && line.y > recipient.y + 4 && line.y < recipient.y + 55 && line.text.length > 6),
    (line) => {
      const belowRecipient = recipient ? 80 - Math.abs(line.y - (recipient.y + 25)) : 0;
      return belowRecipient + (isProgrammeLine(line) ? 120 : 0) + line.w * 0.3;
    },
  );
  if (programme) {
    detected.set("programme", programme);
    used.add(programme.index);
  }

  const issueDate = chooseLine(
    lines,
    used,
    (line) => isDateLine(line) && !isCertIdLine(line),
    (line) => (line.y > 95 && line.y < 205 ? 80 : 20) - Math.abs(line.centerX - A4_MM.w / 2) * 0.2,
  );
  if (issueDate) {
    detected.set("issueDate", issueDate);
    used.add(issueDate.index);
  }

  const certificateId = chooseLine(
    lines,
    used,
    isCertIdLine,
    (line) => (line.y > 210 ? 80 : 20) + Math.min(line.text.length, 40),
  );
  if (certificateId) {
    detected.set("certificateId", certificateId);
    used.add(certificateId.index);
  }

  const nrcNumber = chooseLine(lines, used, isNrcLine, (line) => (line.y > 190 ? 90 : 20));
  if (nrcNumber) {
    detected.set("nrcNumber", nrcNumber);
    used.add(nrcNumber.index);
  }

  detectSignatureFields(lines, used, detected);

  return detected;
}

function detectSignatureFields(
  lines: TemplateTextLine[],
  used: Set<number>,
  detected: Map<TextFieldId, TemplateTextLine>,
) {
  const bottomLines = lines.filter(
    (line) => line.y >= 205 && line.y <= 276 && line.text.length >= 2 && line.text.length <= 70,
  );
  const sides: Array<{ side: 1 | 2; min: number; max: number }> = [
    { side: 1, min: 0, max: A4_MM.w / 2 },
    { side: 2, min: A4_MM.w / 2, max: A4_MM.w },
  ];

  for (const { side, min, max } of sides) {
    const sideLines = bottomLines.filter((line) => line.centerX >= min && line.centerX <= max);
    const title = chooseLine(
      sideLines,
      used,
      (line) => TITLE_RE.test(line.text),
      (line) => line.y,
    );

    if (title) {
      const id = `signature${side}Title` as TextFieldId;
      detected.set(id, title);
      used.add(title.index);
    }

    const name = chooseLine(
      sideLines,
      used,
      (line) =>
        !TITLE_RE.test(line.text) &&
        !isDateLine(line) &&
        !isCertIdLine(line) &&
        !isNrcLine(line) &&
        !DECORATIVE_RE.test(line.text),
      (line) => {
        const titleBonus = title ? 60 - Math.abs(line.y - Math.max(205, title.y - 8)) : 0;
        return titleBonus + (looksLikePersonName(line) ? 70 : 20) + line.fontSize;
      },
    );

    if (name) {
      const id = `signature${side}Name` as TextFieldId;
      detected.set(id, name);
      used.add(name.index);
    }
  }
}

function defaultField(id: FieldId) {
  return DEFAULT_LAYOUT.fields.find((field) => field.id === id);
}

function existingOrDefaultField(currentLayout: TemplateLayout, id: FieldId) {
  return currentLayout.fields.find((field) => field.id === id) ?? defaultField(id);
}

function centeredBox(line: TemplateTextLine, minWidth = 90, padding = 18) {
  const width = clamp(Math.max(minWidth, line.w + padding), 28, 180);
  return {
    x: clamp(line.centerX - width / 2, 4, A4_MM.w - width - 4),
    w: width,
  };
}

function makeTextField(id: TextFieldId, line: TemplateTextLine): LayoutField {
  const def = defaultField(id);
  const color = line.color ?? def?.color ?? "#282828";
  const h = clamp(line.h + 2, 4, 18);

  if (id === "recipientName") {
    const box = centeredBox(line, 125, 34);
    return {
      ...def,
      id,
      kind: "text",
      visible: true,
      x: box.x,
      y: clamp(line.y - 1, 0, A4_MM.h - h),
      w: box.w,
      h,
      fontFamily: "times",
      fontStyle: "bold",
      fontSize: clamp(line.fontSize, 18, 42),
      color,
      align: "center",
    };
  }

  if (id === "programme") {
    const box = centeredBox(line, 120, 28);
    return {
      ...def,
      id,
      kind: "text",
      visible: true,
      x: box.x,
      y: clamp(line.y - 0.5, 0, A4_MM.h - h),
      w: box.w,
      h,
      fontFamily: "times",
      fontStyle: "italic",
      fontSize: clamp(line.fontSize, 11, 26),
      color,
      align: "center",
    };
  }

  if (id.startsWith("signature")) {
    const box = centeredBox(line, 62, 14);
    return {
      ...def,
      id,
      kind: "text",
      visible: true,
      x: box.x,
      y: clamp(line.y, 0, A4_MM.h - h),
      w: box.w,
      h,
      fontFamily: "helvetica",
      fontStyle: id.endsWith("Name") ? "bold" : "normal",
      fontSize: clamp(line.fontSize, id.endsWith("Name") ? 9 : 7, id.endsWith("Name") ? 14 : 11),
      color,
      align: "center",
    };
  }

  const align = line.centerX > A4_MM.w * 0.68 ? "right" : line.centerX < A4_MM.w * 0.32 ? "left" : "center";
  const width = clamp(Math.max(line.w + 10, id === "issueDate" ? 58 : 72), 38, 100);
  const x =
    align === "center"
      ? clamp(line.centerX - width / 2, 4, A4_MM.w - width - 4)
      : align === "right"
        ? clamp(line.x + line.w - width, 4, A4_MM.w - width - 4)
        : clamp(line.x - 2, 4, A4_MM.w - width - 4);

  return {
    ...def,
    id,
    kind: "text",
    visible: true,
    x,
    y: clamp(line.y, 0, A4_MM.h - h),
    w: width,
    h,
    fontFamily: id === "issueDate" ? "helvetica" : "courier",
    fontStyle: "normal",
    fontSize: clamp(line.fontSize, 7, 14),
    color,
    align,
  };
}

function makeMaskField(id: TextFieldId, line: TemplateTextLine): LayoutField {
  return {
    id: `mask_${id}`,
    label: `Cover baked ${id}`,
    kind: "shape",
    visible: true,
    x: clamp(line.x - 1.5, 0, A4_MM.w),
    y: clamp(line.y - 0.8, 0, A4_MM.h),
    w: clamp(line.w + 3, 6, A4_MM.w),
    h: clamp(line.h + 1.8, 4, A4_MM.h),
    fillColor: "#ffffff",
    opacity: 1,
  };
}

function makeMaskFromField(id: TextFieldId, field: LayoutField): LayoutField {
  return {
    id: `mask_${id}`,
    label: `Cover baked ${id}`,
    kind: "shape",
    visible: true,
    x: clamp(field.x - 1, 0, A4_MM.w),
    y: clamp(field.y - 0.6, 0, A4_MM.h),
    w: clamp(field.w + 2, 6, A4_MM.w),
    h: clamp(field.h + 1.2, 4, A4_MM.h),
    fillColor: "#ffffff",
    opacity: 1,
  };
}

function buildFallbackLayout(
  source: TemplateFieldDetectionResult["source"],
  currentLayout: TemplateLayout,
  notes: string[],
): TemplateFieldDetectionResult {
  const fallbackFields = DEFAULT_LAYOUT.fields.map((field) => {
    const existing = currentLayout.fields.find((candidate) => candidate.id === field.id);
    return { ...field, ...existing, visible: true };
  });
  const fallbackMasks = fallbackFields
    .filter((field) => field.kind === "text")
    .map((field) => makeMaskFromField(field.id as TextFieldId, field));

  return {
    layout: {
      version: 1,
      fields: [...fallbackMasks, ...fallbackFields],
      logoOverlay: { ...(currentLayout.logoOverlay ?? DEFAULT_LOGO_OVERLAY), enabled: false },
      svgBackgroundOverrides: {},
    },
    detectedCount: 0,
    detectedIds: [],
    source,
    usedFallback: true,
    notes: [
      "No selectable template text was detected in the uploaded artwork.",
      ...notes,
    ],
  };
}

function buildLayoutFromLines(
  source: TemplateFieldDetectionResult["source"],
  lines: TemplateTextLine[],
  currentLayout: TemplateLayout,
): TemplateFieldDetectionResult {
  const detected = detectLineFields(lines);
  const masks: LayoutField[] = [];
  const textFields: LayoutField[] = [];
  const detectedIds: FieldId[] = [];

  for (const id of TEXT_FIELD_ORDER) {
    const line = detected.get(id);
    if (!line) continue;
    masks.push(makeMaskField(id, line));
    textFields.push(makeTextField(id, line));
    detectedIds.push(id);
  }

  if (detectedIds.length === 0) {
    return buildFallbackLayout(source, currentLayout, [
      "This usually means Illustrator exported text as paths/outlines rather than real SVG text.",
    ]);
  }

  for (const id of TEXT_FIELD_ORDER) {
    if (textFields.some((field) => field.id === id)) continue;
    const fallback = existingOrDefaultField(currentLayout, id);
    if (fallback) textFields.push({ ...fallback, visible: true });
  }

  const qr = existingOrDefaultField(currentLayout, "qr") ?? defaultField("qr");
  const fields = [...masks, ...textFields];
  if (qr) fields.push({ ...qr, visible: true });

  const notes: string[] = [];
  if (!detected.has("recipientName")) notes.push("Recipient name was not confidently detected.");
  if (!detected.has("programme")) notes.push("Programme/course line was not confidently detected.");
  if (!detected.has("issueDate")) notes.push("Issue date was not confidently detected.");
  if (!detected.has("certificateId")) notes.push("Certificate ID used the current/default position.");
  if (!detected.has("nrcNumber")) notes.push("NRC used the current/default position.");

  return {
    layout: {
      version: 1,
      fields,
      logoOverlay: { ...(currentLayout.logoOverlay ?? DEFAULT_LOGO_OVERLAY), enabled: false },
      svgBackgroundOverrides: {},
    },
    detectedCount: detectedIds.length,
    detectedIds,
    source,
    usedFallback: false,
    notes,
  };
}

export function detectTemplateFieldsFromSvgMarkup(
  svgMarkup: string,
  currentLayout: TemplateLayout = DEFAULT_LAYOUT,
): TemplateFieldDetectionResult {
  const { items, width, height } = collectSvgTextItems(svgMarkup);
  const lines = rawItemsToLines(items, width, height);
  return buildLayoutFromLines("svg", lines, currentLayout);
}

export async function detectTemplateFieldsFromPdfBlob(
  blob: Blob,
  currentLayout: TemplateLayout = DEFAULT_LAYOUT,
): Promise<TemplateFieldDetectionResult> {
  const items = await extractPdfPageTextItems(blob);
  const lines = pdfItemsToLines(items);
  return buildLayoutFromLines("pdf", lines, currentLayout);
}
