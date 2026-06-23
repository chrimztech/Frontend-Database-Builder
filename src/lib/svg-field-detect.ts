/**
 * Scans an SVG certificate template for placeholder text elements and maps them
 * to layout field positions (in A4 millimetres).
 *
 * Detection works by:
 *  1. Parsing the SVG with DOMParser (off-screen – no visual freeze).
 *  2. Reading the viewBox to establish the coordinate scale.
 *  3. Walking every <text> element, accumulating parent transforms, then
 *     converting the resolved baseline position to A4 mm.
 *  4. Matching the element's text content against known field patterns.
 *  5. Scanning <image> and <rect> elements for image-slot candidates.
 */

import {
  A4_MM,
  DEFAULT_LAYOUT,
  FIELD_KINDS,
  FIELD_LABELS,
  MM_TO_PT,
  type FieldId,
  type LayoutField,
} from "./template-layout";
import { collectSvgBindingHints, matchSvgDynamicFieldHints } from "./svg-template";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface DetectedField {
  fieldId: FieldId;
  /** mm from left edge (top-left origin) */
  x: number;
  /** mm from top edge (top-left origin) */
  y: number;
  w: number;
  h: number;
  /** Estimated font size in pt (text fields only) */
  fontSize?: number;
  color?: string;
  align?: "left" | "center" | "right";
  /** How sure we are about the match */
  confidence: "high" | "medium";
  /** The text content that triggered the match */
  matchedText: string;
}

// ---------------------------------------------------------------------------
// Pattern library
// ---------------------------------------------------------------------------

const TEXT_PATTERNS: Array<{
  id: FieldId;
  confidence: "high" | "medium";
  tests: RegExp[];
}> = [
  // ── Recipient name ──────────────────────────────────────────────────────
  {
    id: "recipientName",
    confidence: "high",
    tests: [
      /\{\{[\s_-]*(name|full.?name|recipient|student|graduate|holder)[^}]*\}\}/i,
      /\[\[?[\s_-]*(name|recipient|student|graduate)[^]]*\]?\]/i,
      /^(recipient[\s_-]*name|full[\s_-]*name|student[\s_-]*name|graduate[\s_-]*name|name[\s_-]*of[\s_-]*(student|recipient|graduate)|your[\s_-]*name[\s_-]*here|name[\s_-]*here)$/i,
    ],
  },
  {
    id: "recipientName",
    confidence: "medium",
    tests: [
      /^(recipient|participant|attendee|learner|holder|awardee)$/i,
      // Title-case "Firstname Lastname" placeholder
      /^[A-Z][a-z]+\s+[A-Z][a-z]+$/,
    ],
  },

  // ── Programme ───────────────────────────────────────────────────────────
  {
    id: "programme",
    confidence: "high",
    tests: [
      /\{\{[\s_-]*(programme|program|course|subject|qualification)[^}]*\}\}/i,
      /\[\[?[\s_-]*(programme|program|course)[^]]*\]?\]/i,
      /^(programme[\s_-]*name|program[\s_-]*name|course[\s_-]*(name|title)|name[\s_-]*of[\s_-]*(course|programme|program)|field[\s_-]*of[\s_-]*study|course[\s_-]*of[\s_-]*study)$/i,
    ],
  },
  {
    id: "programme",
    confidence: "medium",
    tests: [
      /^(programme|program|course|subject|study|qualification|training|diploma)$/i,
    ],
  },

  // ── Issue date ──────────────────────────────────────────────────────────
  {
    id: "issueDate",
    confidence: "high",
    tests: [
      /\{\{[\s_-]*(date|issue.?date|issued.?on|award.?date)[^}]*\}\}/i,
      /^(issue[\s_-]*date|date[\s_-]*of[\s_-]*(issue|award|completion)|award[\s_-]*date|issued[\s_-]*on|date[\s_-]*issued)$/i,
      /^(dd[\/\-]mm[\/\-]yyyy|mm[\/\-]dd[\/\-]yyyy|yyyy[\/\-]mm[\/\-]dd)$/i,
      // actual date-like strings  e.g. "01/06/2026"
      /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/,
    ],
  },
  {
    id: "issueDate",
    confidence: "medium",
    tests: [
      /^(date|issued|awarded|completion[\s_-]*date|given[\s_-]*this[\s_-]*day)$/i,
    ],
  },

  // ── Certificate ID ───────────────────────────────────────────────────────
  {
    id: "certificateId",
    confidence: "high",
    tests: [
      /\{\{[\s_-]*(cert.?id|certificate.?id|cert.?code|cert.?number|ref)[^}]*\}\}/i,
      /^(certificate[\s_-]*(no\.?|id|number|code|reference)|cert\.?[\s_-]*(no\.?|id)|serial[\s_-]*(no\.?|number)|ref(erence)?[\s_-]*(no\.?|number|#))$/i,
    ],
  },
  {
    id: "certificateId",
    confidence: "medium",
    tests: [
      /^(cert[\s_-]*id|cert[\s_-]*code|cert|reference|ref\.?|id|serial)\.?$/i,
    ],
  },

  // ── NRC / national ID ────────────────────────────────────────────────────
  {
    id: "nrcNumber",
    confidence: "high",
    tests: [
      /\{\{[\s_-]*(nrc|national.?id|passport)[^}]*\}\}/i,
      /^(nrc[\s_-]*(no\.?|number)?\.?|national[\s_-]*(id|identity|registration)|passport[\s_-]*no\.?|id[\s_-]*number)$/i,
    ],
  },
  {
    id: "nrcNumber",
    confidence: "medium",
    tests: [
      /^(nrc|national[\s_-]*id|passport|id\.?)$/i,
    ],
  },

  // ── Signatures ───────────────────────────────────────────────────────────
  {
    id: "signature1Name",
    confidence: "high",
    tests: [
      /^(signatory[\s_-]*1[\s_-]*name|signature[\s_-]*1[\s_-]*name|first[\s_-]*signatory[\s_-]*name|1st[\s_-]*signatory[\s_-]*name)$/i,
    ],
  },
  {
    id: "signature1Name",
    confidence: "medium",
    tests: [
      /^(signatory|authorized[\s_-]*signatory|director|signature[\s_-]*name|signatory[\s_-]*name)$/i,
    ],
  },
  {
    id: "signature1Title",
    confidence: "high",
    tests: [
      /^(signatory[\s_-]*1[\s_-]*title|signature[\s_-]*1[\s_-]*title|title[\s_-]*1|1st[\s_-]*signatory[\s_-]*title)$/i,
    ],
  },
  {
    id: "signature1Title",
    confidence: "medium",
    tests: [
      /^(title|position|designation|signatory[\s_-]*title|authorized[\s_-]*by)$/i,
    ],
  },
  {
    id: "signature2Name",
    confidence: "high",
    tests: [
      /^(signatory[\s_-]*2[\s_-]*name|signature[\s_-]*2[\s_-]*name|second[\s_-]*signatory[\s_-]*name|2nd[\s_-]*signatory[\s_-]*name)$/i,
    ],
  },
  {
    id: "signature2Title",
    confidence: "high",
    tests: [
      /^(signatory[\s_-]*2[\s_-]*title|signature[\s_-]*2[\s_-]*title|title[\s_-]*2|2nd[\s_-]*signatory[\s_-]*title)$/i,
    ],
  },

  // ── Image-adjacent labels (position hint for image slots) ────────────────
  {
    id: "qr",
    confidence: "high",
    tests: [
      /^(qr[\s_-]*code|qr|scan|scan[\s_-]*to[\s_-]*verify|verify[\s_-]*qr|verification[\s_-]*code)$/i,
    ],
  },
  {
    id: "seal",
    confidence: "high",
    tests: [
      /^(seal|official[\s_-]*seal|stamp|official[\s_-]*stamp|emblem)$/i,
    ],
  },
  {
    id: "signature1Image",
    confidence: "high",
    tests: [
      /^(signature[\s_-]*1|signature[\s_-]*image[\s_-]*1|sign[\s_-]*here[\s_-]*1|first[\s_-]*signature|1st[\s_-]*signature)$/i,
    ],
  },
  {
    id: "signature1Image",
    confidence: "medium",
    tests: [
      /^(signature|sign[\s_-]*here|authorized[\s_-]*signature)$/i,
    ],
  },
  {
    id: "signature2Image",
    confidence: "high",
    tests: [
      /^(signature[\s_-]*2|signature[\s_-]*image[\s_-]*2|sign[\s_-]*here[\s_-]*2|second[\s_-]*signature|2nd[\s_-]*signature)$/i,
    ],
  },
];

function matchText(text: string): { id: FieldId; confidence: "high" | "medium" } | null {
  const t = text.trim();
  if (!t || t.length < 2) return null;
  for (const pattern of TEXT_PATTERNS) {
    for (const test of pattern.tests) {
      if (test.test(t)) return { id: pattern.id, confidence: pattern.confidence };
    }
  }
  return null;
}

function matchHints(hints: string[]): { id: FieldId; confidence: "high" | "medium" } | null {
  for (const hint of hints) {
    const matched = matchText(hint);
    if (matched) return matched;
  }

  const semanticField = matchSvgDynamicFieldHints(hints);
  if (!semanticField) return null;

  return {
    id: semanticField,
    confidence: hints.some((hint) => /\{\{|\[\[/.test(hint)) ? "high" : "medium",
  };
}

// ---------------------------------------------------------------------------
// Transform accumulation (translate + scale only; handles 99 % of templates)
// ---------------------------------------------------------------------------

interface SimpleCTM {
  tx: number;
  ty: number;
  sx: number;
  sy: number;
}

const IDENTITY: SimpleCTM = { tx: 0, ty: 0, sx: 1, sy: 1 };

function parseTransformAttr(attr: string | null): SimpleCTM {
  if (!attr) return IDENTITY;

  // matrix(a b c d e f)  –  e = x translation, f = y translation
  const mat = /matrix\(\s*([-\d.e]+)[\s,]+([-\d.e]+)[\s,]+([-\d.e]+)[\s,]+([-\d.e]+)[\s,]+([-\d.e]+)[\s,]+([-\d.e]+)\s*\)/i.exec(attr);
  if (mat) {
    return {
      tx: parseFloat(mat[5]) || 0,
      ty: parseFloat(mat[6]) || 0,
      sx: parseFloat(mat[1]) || 1,
      sy: parseFloat(mat[4]) || 1,
    };
  }

  let tx = 0, ty = 0, sx = 1, sy = 1;

  const tr = /translate\(\s*([-\d.e]+)(?:[\s,]+([-\d.e]+))?\s*\)/i.exec(attr);
  if (tr) {
    tx = parseFloat(tr[1]) || 0;
    ty = tr[2] ? parseFloat(tr[2]) || 0 : 0;
  }

  const sc = /scale\(\s*([-\d.e]+)(?:[\s,]+([-\d.e]+))?\s*\)/i.exec(attr);
  if (sc) {
    sx = parseFloat(sc[1]) || 1;
    sy = sc[2] ? parseFloat(sc[2]) || sx : sx;
  }

  return { tx, ty, sx, sy };
}

function combineCTM(parent: SimpleCTM, child: SimpleCTM): SimpleCTM {
  return {
    tx: parent.tx + parent.sx * child.tx,
    ty: parent.ty + parent.sy * child.ty,
    sx: parent.sx * child.sx,
    sy: parent.sy * child.sy,
  };
}

/** Walk from el up to (but not including) svgRoot, accumulating transforms. */
function accumulateCTM(el: Element, svgRoot: Element): SimpleCTM {
  const chain: SimpleCTM[] = [];
  let cur: Element | null = el;
  while (cur && cur !== svgRoot.parentElement) {
    chain.unshift(parseTransformAttr(cur.getAttribute("transform")));
    cur = cur.parentElement;
  }
  return chain.reduce(combineCTM, IDENTITY);
}

// ---------------------------------------------------------------------------
// Attribute helpers
// ---------------------------------------------------------------------------

function numAttr(el: Element, name: string): number {
  const v = parseFloat(el.getAttribute(name) ?? "");
  return Number.isFinite(v) ? v : 0;
}

function styleVal(el: Element, prop: string): string | null {
  const attr = el.getAttribute("style") ?? "";
  const m = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, "i").exec(attr);
  return m ? m[1].trim() : null;
}

function presentationVal(el: Element, attr: string, cssProp = attr): string | null {
  return el.getAttribute(attr) ?? styleVal(el, cssProp);
}

/** Inherited font-size walking up to <svg>. */
function resolvedFontSize(el: Element): number | null {
  let cur: Element | null = el;
  while (cur && cur.tagName.toLowerCase() !== "svg") {
    const v =
      cur.getAttribute("font-size") ??
      styleVal(cur, "font-size");
    if (v) {
      const n = parseFloat(v);
      if (Number.isFinite(n) && n > 0) return n;
    }
    cur = cur.parentElement;
  }
  return null;
}

function resolvedTextAnchor(el: Element): "start" | "middle" | "end" {
  let cur: Element | null = el;
  while (cur && cur.tagName.toLowerCase() !== "svg") {
    const v =
      cur.getAttribute("text-anchor") ??
      styleVal(cur, "text-anchor");
    if (v === "middle") return "middle";
    if (v === "end") return "end";
    if (v === "start") return "start";
    cur = cur.parentElement;
  }
  return "start";
}

// ---------------------------------------------------------------------------
// ViewBox → A4 mm scale
// ---------------------------------------------------------------------------

function parseViewBox(root: Element): { vx: number; vy: number; vw: number; vh: number } {
  const vb = root.getAttribute("viewBox");
  if (vb) {
    const p = vb.trim().split(/[\s,]+/).map(Number);
    if (p.length === 4 && p.every(Number.isFinite)) {
      return { vx: p[0], vy: p[1], vw: p[2], vh: p[3] };
    }
  }
  return {
    vx: 0,
    vy: 0,
    vw: parseFloat(root.getAttribute("width") ?? "") || A4_MM.w,
    vh: parseFloat(root.getAttribute("height") ?? "") || A4_MM.h,
  };
}

// ---------------------------------------------------------------------------
// Default field sizes by ID
// ---------------------------------------------------------------------------

const FIELD_SIZE: Partial<Record<FieldId, { w: number; h: number }>> = {
  recipientName:   { w: 172, h: 14 },
  programme:       { w: 162, h: 14 },
  issueDate:       { w:  54, h:  6 },
  certificateId:   { w:  42, h:  5 },
  nrcNumber:       { w: 134, h:  9 },
  qr:              { w:  24, h: 24 },
  seal:            { w:  38, h: 38 },
  signature1Image: { w:  48, h: 16 },
  signature1Name:  { w:  70, h:  6 },
  signature1Title: { w:  70, h:  6 },
  signature2Image: { w:  48, h: 16 },
  signature2Name:  { w:  70, h:  6 },
  signature2Title: { w:  70, h:  6 },
};

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

// ---------------------------------------------------------------------------
// Main export – detect fields
// ---------------------------------------------------------------------------

export async function detectFieldsFromSvg(svgMarkup: string): Promise<DetectedField[]> {
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(svgMarkup, "image/svg+xml");
  } catch {
    return [];
  }
  if (doc.querySelector("parsererror")) return [];

  const root = doc.documentElement;
  const { vx, vy, vw, vh } = parseViewBox(root);
  if (vw <= 0 || vh <= 0) return [];

  const scX = A4_MM.w / vw;
  const scY = A4_MM.h / vh;

  const results: DetectedField[] = [];

  // Helper: add / replace (upgrade low confidence with high)
  function addResult(d: DetectedField) {
    const idx = results.findIndex((r) => r.fieldId === d.fieldId);
    if (idx >= 0) {
      if (results[idx].confidence === "medium" && d.confidence === "high") {
        results[idx] = d;
      }
      // already have same or higher confidence — skip
      return;
    }
    results.push(d);
  }

  // ── Text elements ─────────────────────────────────────────────────────────
  for (const el of Array.from(root.querySelectorAll("text"))) {
    const rawText = (el.textContent ?? "").replace(/\s+/g, " ").trim();
    if (!rawText || rawText.length < 2) continue;

    const match = matchText(rawText) ?? matchHints(collectSvgBindingHints(el));
    if (!match) continue;

    const ctm = accumulateCTM(el, root);

    // Resolved baseline position in SVG user units
    const rawX = numAttr(el, "x") || numAttr(el, "cx");
    const rawY = numAttr(el, "y") || numAttr(el, "cy");
    const resolvedX = ctm.tx + ctm.sx * rawX;
    const resolvedY = ctm.ty + ctm.sy * rawY;

    // Font size → mm
    const fsSvg = (resolvedFontSize(el) ?? 12) * Math.abs(ctm.sy);
    const fsMm = fsSvg * scY;
    const fsPt = Math.max(7, Math.min(96, round1(fsMm * MM_TO_PT)));

    // Convert baseline to top-left origin (baseline ≈ 0.85 × em above baseline)
    const xMm = (resolvedX - vx) * scX;
    const yMm = (resolvedY - vy - fsSvg * 0.85) * scY;

    // Text anchor → layout alignment
    const anchor = resolvedTextAnchor(el);
    const align: "left" | "center" | "right" =
      anchor === "middle" ? "center" : anchor === "end" ? "right" : "left";

    const { w, h } = FIELD_SIZE[match.id] ?? { w: 120, h: 8 };

    // Adjust x so that x is always the left edge regardless of anchor
    let fieldX = xMm;
    if (align === "center") fieldX = xMm - w / 2;
    else if (align === "right") fieldX = xMm - w;

    // Clamp to A4
    fieldX = Math.max(0, Math.min(A4_MM.w - w, fieldX));
    const fieldY = Math.max(0, Math.min(A4_MM.h - h, yMm));

    const fill = presentationVal(el, "fill", "fill");
    const color =
      fill && fill !== "none" && /^#|^rgb/.test(fill) ? fill : undefined;

    addResult({
      fieldId: match.id,
      x: round1(fieldX),
      y: round1(fieldY),
      w,
      h,
      fontSize: fsPt,
      color,
      align,
      confidence: match.confidence,
      matchedText: rawText.length > 40 ? rawText.slice(0, 37) + "…" : rawText,
    });
  }

  // ── Image elements → guess image-slot fields ──────────────────────────────
  //    We only add an image-slot guess if we haven't already detected it via text.
  const IMAGE_FIELD_ORDER: FieldId[] = [
    "qr", "seal", "signature1Image", "signature2Image",
  ];
  for (const el of Array.from(root.querySelectorAll("image, rect"))) {
    const wSvg = numAttr(el, "width");
    const hSvg = numAttr(el, "height");
    if (wSvg < 5 || hSvg < 5) continue;

    const ctm = accumulateCTM(el, root);
    const rx = ctm.tx + ctm.sx * numAttr(el, "x");
    const ry = ctm.ty + ctm.sy * numAttr(el, "y");

    const xMm = round1((rx - vx) * scX);
    const yMm = round1((ry - vy) * scY);
    const wMm = round1(wSvg * ctm.sx * scX);
    const hMm = round1(hSvg * ctm.sy * scY);

    if (wMm < 5 || hMm < 5) continue;

    const hintMatch = matchHints(collectSvgBindingHints(el));
    if (
      hintMatch &&
      IMAGE_FIELD_ORDER.includes(hintMatch.id) &&
      !results.some((r) => r.fieldId === hintMatch.id)
    ) {
      results.push({
        fieldId: hintMatch.id,
        x: xMm,
        y: yMm,
        w: round1(wMm),
        h: round1(hMm),
        confidence: hintMatch.confidence,
        matchedText: "(named placeholder)",
      });
      continue;
    }

    // Choose which image field this most resembles based on aspect ratio + position
    const aspect = wMm / hMm;
    const isSquare = Math.abs(aspect - 1) < 0.35;
    const isLandscapeBand = aspect > 1.5 && hMm < 25; // wide + short → signature strip

    for (const fieldId of IMAGE_FIELD_ORDER) {
      if (results.some((r) => r.fieldId === fieldId)) continue;

      const def = FIELD_SIZE[fieldId] ?? { w: wMm, h: hMm };
      const defAspect = def.w / def.h;

      const aspectOk =
        fieldId === "qr" || fieldId === "seal"
          ? isSquare
          : fieldId === "signature1Image" || fieldId === "signature2Image"
            ? isLandscapeBand
            : true;

      if (!aspectOk) continue;

      // Prefer rough aspect match
      if (Math.abs(wMm / hMm - defAspect) > 1.5) continue;

      results.push({
        fieldId,
        x: xMm,
        y: yMm,
        w: round1(wMm),
        h: round1(hMm),
        confidence: "medium",
        matchedText: "(image element)",
      });
      break;
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Apply detected fields into an existing layout field array
// ---------------------------------------------------------------------------

export function applyDetectedToLayout(
  currentFields: LayoutField[],
  detected: DetectedField[],
  selectedIds: Set<FieldId>,
): LayoutField[] {
  const result: LayoutField[] = [...currentFields];

  for (const d of detected) {
    if (!selectedIds.has(d.fieldId)) continue;

    const patch: Partial<LayoutField> = {
      x: d.x,
      y: d.y,
      w: d.w,
      h: d.h,
      visible: true,
      ...(d.fontSize ? { fontSize: d.fontSize } : {}),
      ...(d.color ? { color: d.color } : {}),
      ...(d.align ? { align: d.align } : {}),
    };

    const existingIdx = result.findIndex((f) => f.id === d.fieldId);
    if (existingIdx >= 0) {
      result[existingIdx] = { ...result[existingIdx], ...patch };
    } else {
      const base =
        DEFAULT_LAYOUT.fields.find((f) => f.id === d.fieldId) ??
        ({
          id: d.fieldId,
          kind: FIELD_KINDS[d.fieldId] ?? "text",
          visible: true,
          x: d.x,
          y: d.y,
          w: d.w,
          h: d.h,
        } as LayoutField);
      result.push({ ...base, ...patch });
    }
  }

  return result;
}

/** Human-readable label for a FieldId (falls back to the id itself). */
export function fieldLabel(id: FieldId): string {
  return FIELD_LABELS[id] ?? id;
}
