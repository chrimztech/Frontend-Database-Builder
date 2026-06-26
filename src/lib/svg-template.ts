import type { FieldId } from "./template-layout";

const BLOCKED_TAGS = new Set([
  "script",
  "foreignobject",
  "iframe",
  "object",
  "embed",
  "audio",
  "video",
]);

const XLINK_NS = "http://www.w3.org/1999/xlink";

export type SvgDynamicTextFieldId = Exclude<
  FieldId,
  "qr" | "seal" | "signature1Image" | "signature2Image"
>;

export type SvgDynamicTextValues = Partial<Record<SvgDynamicTextFieldId, string>>;

const SVG_BINDING_ATTRS = [
  "id",
  "class",
  "data-name",
  "data-field",
  "data-placeholder",
  "aria-label",
  "label",
  "inkscape:label",
] as const;

const SVG_DYNAMIC_FIELD_DEFS: Array<{
  id: SvgDynamicTextFieldId;
  aliases: string[];
  patterns: RegExp[];
}> = [
  {
    id: "recipientName",
    aliases: [
      "recipient",
      "recipientname",
      "fullname",
      "full_name",
      "studentname",
      "student_name",
      "graduatename",
      "graduate_name",
      "holdername",
      "holder_name",
      "awardeename",
      "awardee_name",
      "participantname",
      "participant_name",
    ],
    patterns: [
      /\{\{\s*(full.?name|recipient.?name|student.?name|graduate.?name)\s*\}\}/i,
      /^(recipient|student|graduate|holder|awardee)\s+name$/i,
    ],
  },
  {
    id: "programme",
    aliases: [
      "programme",
      "program",
      "programmename",
      "programme_name",
      "programname",
      "program_name",
      "coursename",
      "course_name",
      "course",
      "qualification",
      "subject",
    ],
    patterns: [
      /\{\{\s*(programme|program|programme.?name|program.?name|course|course.?name)\s*\}\}/i,
      /^(programme|program|course|qualification|subject)(\s+name)?$/i,
    ],
  },
  {
    id: "issueDate",
    aliases: [
      "issuedate",
      "issue_date",
      "issuedon",
      "issued_on",
      "awarddate",
      "award_date",
      "dateissued",
      "date_issued",
    ],
    patterns: [
      /\{\{\s*(issue.?date|issued.?on|award.?date|date)\s*\}\}/i,
      /^(issue|issued|award)\s+date$/i,
      /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/i,
    ],
  },
  {
    id: "certificateId",
    aliases: [
      "certificateid",
      "certificate_id",
      "certificatecode",
      "certificate_code",
      "certid",
      "cert_id",
      "certcode",
      "cert_code",
      "certificatenumber",
      "certificate_number",
      "certificateno",
      "certificate_no",
      "certnumber",
      "cert_number",
      "certno",
      "cert_no",
      "reference",
      "serialnumber",
      "serial_number",
    ],
    patterns: [
      /\{\{\s*(certificate.?id|certificate.?code|certificate.?number|cert.?id|cert.?code|cert.?number|ref)\s*\}\}/i,
      /^(certificate|cert)(\s+|[-_])?(id|code|number|no\.?)$/i,
      /^(?=[A-Z0-9-]*\d)[A-Z0-9-]{6,}$/i,
    ],
  },
  {
    id: "nrcNumber",
    aliases: [
      "nrc",
      "nrcnumber",
      "nrc_number",
      "nationalid",
      "national_id",
      "idnumber",
      "id_number",
      "passportnumber",
      "passport_number",
    ],
    patterns: [
      /\{\{\s*(nrc|nrc.?number|national.?id|passport|id.?number)\s*\}\}/i,
      /^(nrc|national\s+id|passport|id\s+number)$/i,
      /^\d{6}\/\d{2}\/\d$/i,
    ],
  },
  {
    id: "signature1Name",
    aliases: [
      "signature1name",
      "signature1_name",
      "signatory1name",
      "signatory1_name",
      "firstsignatoryname",
      "first_signatory_name",
    ],
    patterns: [
      /\{\{\s*(signature1.?name|signatory1.?name|first.?signatory.?name)\s*\}\}/i,
      /^(signature|signatory)\s*1\s*name$/i,
    ],
  },
  {
    id: "signature1Title",
    aliases: [
      "signature1title",
      "signature1_title",
      "signatory1title",
      "signatory1_title",
      "firstsignatorytitle",
      "first_signatory_title",
    ],
    patterns: [
      /\{\{\s*(signature1.?title|signatory1.?title|first.?signatory.?title)\s*\}\}/i,
      /^(signature|signatory)\s*1\s*title$/i,
    ],
  },
  {
    id: "signature2Name",
    aliases: [
      "signature2name",
      "signature2_name",
      "signatory2name",
      "signatory2_name",
      "secondsignatoryname",
      "second_signatory_name",
    ],
    patterns: [
      /\{\{\s*(signature2.?name|signatory2.?name|second.?signatory.?name)\s*\}\}/i,
      /^(signature|signatory)\s*2\s*name$/i,
    ],
  },
  {
    id: "signature2Title",
    aliases: [
      "signature2title",
      "signature2_title",
      "signatory2title",
      "signatory2_title",
      "secondsignatorytitle",
      "second_signatory_title",
    ],
    patterns: [
      /\{\{\s*(signature2.?title|signatory2.?title|second.?signatory.?title)\s*\}\}/i,
      /^(signature|signatory)\s*2\s*title$/i,
    ],
  },
];

function normalizeHint(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function extractPlaceholderTokens(value: string) {
  const tokens: string[] = [];
  const regex = /\{\{\s*([^}]+?)\s*\}\}|\[\[\s*([^\]]+?)\s*\]\]/g;
  let match: RegExpExecArray | null = regex.exec(value);

  while (match) {
    const token = normalizeHint(match[1] ?? match[2]);
    if (token) tokens.push(token);
    match = regex.exec(value);
  }

  return tokens;
}

function looksLikeNameSample(value: string) {
  const words = value.trim().split(/\s+/).filter(Boolean);
  return (
    words.length >= 2 &&
    words.length <= 5 &&
    // Each word must be title-case (capital + at least one lowercase) — rejects ALL-CAPS phrases
    // like "CERTIFICATE OF COMPETENCE" which would otherwise satisfy the shape test.
    words.every((word) => /^[A-Z][a-z][A-Za-z'.-]*$/.test(word))
  );
}

function shouldReplaceWholeText(fieldId: SvgDynamicTextFieldId, text: string) {
  const raw = text.trim();
  if (!raw) return false;
  if (extractPlaceholderTokens(raw).length > 0) return true;
  if (matchSvgDynamicFieldHints([raw]) === fieldId) return true;

  switch (fieldId) {
    case "recipientName":
    case "signature1Name":
    case "signature2Name":
      return looksLikeNameSample(raw);
    case "issueDate":
      return (
        /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/i.test(raw) ||
        /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b/i.test(raw)
      );
    case "certificateId":
      // Must contain at least one digit to avoid matching plain uppercase words like "CERTIFICATE"
      return /^(?=[A-Z0-9-]*\d)[A-Z0-9-]{6,}$/i.test(raw);
    case "nrcNumber":
      return /^\d{6}\/\d{2}\/\d$/i.test(raw) || /\bnrc\b/i.test(raw);
    default:
      return raw.length <= 72;
  }
}

function replaceSvgTemplateTokens(text: string, values: SvgDynamicTextValues) {
  return text.replace(/\{\{\s*([^}]+?)\s*\}\}|\[\[\s*([^\]]+?)\s*\]\]/g, (token, first, second) => {
    const fieldId = matchSvgDynamicFieldHints([first ?? second]);
    if (!fieldId) return token;
    return values[fieldId] ?? "";
  });
}

export function collectSvgBindingHints(el: Element) {
  const hints: string[] = [];
  const seen = new Set<string>();
  let current: Element | null = el;
  let depth = 0;

  while (current && depth < 3) {
    if (depth === 0) {
      const text = (current.textContent ?? "").replace(/\s+/g, " ").trim();
      if (text && !seen.has(text)) {
        hints.push(text);
        seen.add(text);
      }
    }

    for (const attrName of SVG_BINDING_ATTRS) {
      const value = current.getAttribute(attrName);
      if (!value) continue;
      const trimmed = value.trim();
      if (!trimmed || seen.has(trimmed)) continue;
      hints.push(trimmed);
      seen.add(trimmed);
    }

    current = current.parentElement;
    depth += 1;
  }

  return hints;
}

export function matchSvgDynamicFieldHints(hints: Array<string | null | undefined>) {
  // Build a flat list of candidates: the raw hint plus each colon-separated segment.
  // This handles tokens like {{NRC:nrc_number}} where the user prefixed the field name.
  const candidates: string[] = [];
  for (const hint of hints) {
    const raw = (hint ?? "").trim();
    if (!raw) continue;
    candidates.push(raw);
    if (raw.includes(":")) {
      for (const segment of raw.split(":")) {
        const s = segment.trim();
        if (s) candidates.push(s);
      }
    }
  }

  for (const raw of candidates) {
    for (const token of extractPlaceholderTokens(raw)) {
      for (const field of SVG_DYNAMIC_FIELD_DEFS) {
        if (field.aliases.some((alias) => normalizeHint(alias) === token)) {
          return field.id;
        }
      }
    }

    const normalized = normalizeHint(raw);
    for (const field of SVG_DYNAMIC_FIELD_DEFS) {
      // Exact alias match only — substring/includes causes false positives on phrases
      // like "Certificate of Competence" matching certificateId via "certificate" alias.
      if (field.aliases.some((alias) => normalizeHint(alias) === normalized)) {
        return field.id;
      }

      if (field.patterns.some((pattern) => pattern.test(raw))) {
        return field.id;
      }
    }
  }

  return null;
}

export interface EditableSvgItem {
  key: string;
  kind: "text" | "image";
  label: string;
  text?: string;
  href?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fontSize?: number;
  fill?: string;
  opacity?: number;
}

export interface SvgItemPatch {
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

export type SvgItemPatchMap = Record<string, SvgItemPatch>;

function parseSvgDocument(svgMarkup: string) {
  const doc = new DOMParser().parseFromString(svgMarkup, "image/svg+xml");
  const parseError = doc.querySelector("parsererror");
  const root = doc.documentElement;

  if (parseError || root.tagName.toLowerCase() !== "svg") {
    throw new Error("The uploaded SVG could not be parsed.");
  }

  return doc;
}

function parseNumber(value: string | null | undefined) {
  if (!value) return undefined;
  const firstToken = value.trim().split(/[\s,]+/)[0];
  const cleaned = firstToken.replace(/px$/i, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseStyleAttribute(style: string | null | undefined) {
  const entries = (style ?? "")
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [rawName, ...rawValue] = entry.split(":");
      return [rawName?.trim().toLowerCase(), rawValue.join(":").trim()] as const;
    })
    .filter(([name, value]) => !!name && !!value);

  return Object.fromEntries(entries) as Record<string, string>;
}

function writeStyleAttribute(el: Element, styles: Record<string, string>) {
  const style = Object.entries(styles)
    .filter(([, value]) => value.trim())
    .map(([name, value]) => `${name}:${value}`)
    .join(";");

  if (style) {
    el.setAttribute("style", style);
  } else {
    el.removeAttribute("style");
  }
}

function getPresentationValue(el: Element, attrName: string, styleName = attrName) {
  const attrValue = el.getAttribute(attrName);
  if (attrValue) return attrValue;
  const styles = parseStyleAttribute(el.getAttribute("style"));
  return styles[styleName.toLowerCase()] ?? null;
}

function setPresentationValue(
  el: Element,
  attrName: string,
  value: string | null,
  styleName = attrName,
) {
  if (value === null || value === "") {
    el.removeAttribute(attrName);
    const styles = parseStyleAttribute(el.getAttribute("style"));
    delete styles[styleName.toLowerCase()];
    writeStyleAttribute(el, styles);
    return;
  }

  el.setAttribute(attrName, value);
  const styles = parseStyleAttribute(el.getAttribute("style"));
  styles[styleName.toLowerCase()] = value;
  writeStyleAttribute(el, styles);
}

function normalizeSvgRoot(root: Element) {
  if (!root.getAttribute("viewBox")) {
    const width = parseNumber(root.getAttribute("width"));
    const height = parseNumber(root.getAttribute("height"));

    if (width && height) {
      root.setAttribute("viewBox", `0 0 ${width} ${height}`);
    }
  }

  const preserveAspectRatio = root.getAttribute("preserveAspectRatio")?.trim().toLowerCase();
  if (!preserveAspectRatio || preserveAspectRatio === "none") {
    root.setAttribute("preserveAspectRatio", "xMidYMid meet");
  }
}

function sanitizeSvgDocument(doc: Document) {
  const root = doc.documentElement;
  let textIndex = 0;
  let imageIndex = 0;

  root.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  root.setAttribute("xmlns:xlink", XLINK_NS);
  normalizeSvgRoot(root);

  const elements = Array.from(root.querySelectorAll("*"));
  for (const el of elements) {
    const tagName = el.tagName.toLowerCase();
    if (BLOCKED_TAGS.has(tagName)) {
      el.remove();
      continue;
    }

    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      const value = attr.value.trim();

      if (name.startsWith("on")) {
        el.removeAttribute(attr.name);
        continue;
      }

      if ((name === "href" || name.endsWith(":href")) && /^javascript:/i.test(value)) {
        el.removeAttribute(attr.name);
      }
    }

    if (tagName === "text") {
      const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
      if (!text || text.length <= 1) continue;

      textIndex += 1;
      const key = el.getAttribute("data-editor-key") ?? `text-${textIndex}`;
      el.setAttribute("data-editor-key", key);
      el.setAttribute("data-svg-editable", "true");
      continue;
    }

    if (tagName === "image") {
      imageIndex += 1;
      const key = el.getAttribute("data-editor-key") ?? `image-${imageIndex}`;
      el.setAttribute("data-editor-key", key);
      el.setAttribute("data-svg-editable", "true");
    }
  }
}

function applyDynamicTextBinding(
  el: Element,
  values: SvgDynamicTextValues,
  inheritedHints: string[],
): SvgDynamicTextFieldId | null {
  const rawText = (el.textContent ?? "").replace(/\s+/g, " ").trim();
  if (!rawText) return null;

  const tokenReplacement = replaceSvgTemplateTokens(rawText, values);
  if (tokenReplacement !== rawText) {
    el.textContent = tokenReplacement;
    // Identify which field was bound — extract raw token contents and use the full
    // matchSvgDynamicFieldHints logic (handles colon-prefix formats like {{NRC:nrc_number}}).
    const rawTokenContents = Array.from(
      rawText.matchAll(/\{\{\s*([^}]+?)\s*\}\}|\[\[\s*([^\]]+?)\s*\]\]/g),
    ).map((m) => (m[1] ?? m[2] ?? "").trim()).filter(Boolean);
    return rawTokenContents.length > 0 ? (matchSvgDynamicFieldHints(rawTokenContents) ?? null) : null;
  }

  // Only match hints from the element itself — not parent group names — to avoid false positives
  // from Illustrator layer names like "certificate_details" matching unrelated text elements.
  const selfHints = [
    (el.textContent ?? "").replace(/\s+/g, " ").trim(),
    ...SVG_BINDING_ATTRS.map((a) => el.getAttribute(a)).filter(Boolean) as string[],
    ...inheritedHints,
  ];
  const fieldId = matchSvgDynamicFieldHints(selfHints);
  if (!fieldId) return null;

  const value = values[fieldId];
  if (value === undefined || value === null) return null;
  if (!shouldReplaceWholeText(fieldId, rawText)) return null;

  el.textContent = value;
  return fieldId;
}

function bindDynamicSvgText(doc: Document, values: SvgDynamicTextValues): Set<SvgDynamicTextFieldId> {
  const bound = new Set<SvgDynamicTextFieldId>();
  if (Object.keys(values).length === 0) return bound;

  for (const textEl of Array.from(doc.documentElement.querySelectorAll("text"))) {
    // Only pass element-level attributes as inherited hints, not parent group names,
    // to avoid Illustrator layer names (e.g. "certificate_details") clobbering unrelated text.
    const textHints = SVG_BINDING_ATTRS.map((a) => textEl.getAttribute(a)).filter(Boolean) as string[];
    const childTspans = Array.from(textEl.children).filter(
      (child) => child.tagName.toLowerCase() === "tspan",
    );

    let updatedChild: SvgDynamicTextFieldId | null = null;
    for (const tspan of childTspans) {
      const result = applyDynamicTextBinding(tspan, values, textHints);
      if (result) {
        bound.add(result);
        updatedChild = result;
      }
    }

    if (!updatedChild) {
      const result = applyDynamicTextBinding(textEl, values, textHints);
      if (result) bound.add(result);
    }
  }

  return bound;
}

function buildItemLabel(el: Element, kind: EditableSvgItem["kind"], index: number, text?: string) {
  const explicitName =
    el.getAttribute("id") || el.getAttribute("inkscape:label") || el.getAttribute("data-name");

  if (explicitName) return explicitName;
  if (kind === "text" && text) {
    const preview = text.replace(/\s+/g, " ").trim().slice(0, 28);
    return `Text ${index}: ${preview}`;
  }

  return kind === "image" ? `Image ${index}` : `Text ${index}`;
}

function collectEditableItems(doc: Document): EditableSvgItem[] {
  const root = doc.documentElement;
  const items: EditableSvgItem[] = [];
  let textIndex = 0;
  let imageIndex = 0;

  for (const el of Array.from(root.querySelectorAll("[data-editor-key]"))) {
    const tagName = el.tagName.toLowerCase();

    if (tagName === "text") {
      textIndex += 1;
      const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
      if (!text || text.length <= 1) continue;

      items.push({
        key: el.getAttribute("data-editor-key") ?? `text-${textIndex}`,
        kind: "text",
        label: buildItemLabel(el, "text", textIndex, text),
        text,
        x: parseNumber(el.getAttribute("x")),
        y: parseNumber(el.getAttribute("y")),
        fontSize: parseNumber(getPresentationValue(el, "font-size", "font-size")),
        fill: getPresentationValue(el, "fill", "fill") ?? undefined,
        opacity: parseNumber(getPresentationValue(el, "opacity", "opacity")),
      });
      continue;
    }

    if (tagName === "image") {
      imageIndex += 1;
      items.push({
        key: el.getAttribute("data-editor-key") ?? `image-${imageIndex}`,
        kind: "image",
        label: buildItemLabel(el, "image", imageIndex),
        href: el.getAttribute("href") ?? el.getAttributeNS(XLINK_NS, "href") ?? undefined,
        x: parseNumber(el.getAttribute("x")),
        y: parseNumber(el.getAttribute("y")),
        width: parseNumber(el.getAttribute("width")),
        height: parseNumber(el.getAttribute("height")),
        opacity: parseNumber(getPresentationValue(el, "opacity", "opacity")),
      });
    }
  }

  return items;
}

function serializeSvg(doc: Document) {
  return new XMLSerializer().serializeToString(doc.documentElement);
}

function getEditableElement(doc: Document, key: string) {
  return doc.documentElement.querySelector(`[data-editor-key="${key}"]`);
}

function setNumericAttribute(el: Element, attrName: string, value: number | undefined) {
  if (value === undefined || Number.isNaN(value)) return;
  el.setAttribute(attrName, String(value));
}

export async function fileToDataUrl(file: File) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function applySvgItemPatch(el: Element, patch: SvgItemPatch) {
  const tagName = el.tagName.toLowerCase();

  if (tagName === "text") {
    if (patch.text !== undefined) {
      el.textContent = patch.text;
    }
    if (patch.fill !== undefined) {
      setPresentationValue(el, "fill", patch.fill, "fill");
    }
    if (patch.fontSize !== undefined && patch.fontSize > 0) {
      setPresentationValue(el, "font-size", String(patch.fontSize), "font-size");
    }
  }

  if (tagName === "image" && patch.hrefDataUrl !== undefined) {
    el.setAttribute("href", patch.hrefDataUrl);
    el.setAttributeNS(XLINK_NS, "xlink:href", patch.hrefDataUrl);
  }

  setNumericAttribute(el, "x", patch.x);
  setNumericAttribute(el, "y", patch.y);
  setNumericAttribute(el, "width", patch.width);
  setNumericAttribute(el, "height", patch.height);

  if (patch.opacity !== undefined) {
    const nextOpacity = Math.max(0, Math.min(1, patch.opacity));
    setPresentationValue(el, "opacity", String(nextOpacity), "opacity");
  }
}

function applySvgItemPatches(doc: Document, patches?: SvgItemPatchMap) {
  if (!patches) return;

  for (const [key, patch] of Object.entries(patches)) {
    const el = getEditableElement(doc, key);
    if (!el) continue;
    applySvgItemPatch(el, patch);
  }
}

export function inspectEditableSvgMarkup(svgMarkup: string, patches?: SvgItemPatchMap) {
  const doc = parseSvgDocument(svgMarkup);
  sanitizeSvgDocument(doc);
  applySvgItemPatches(doc, patches);

  return {
    markup: serializeSvg(doc),
    items: collectEditableItems(doc),
  };
}

export function updateSvgItem(svgMarkup: string, key: string, patch: SvgItemPatch) {
  const doc = parseSvgDocument(svgMarkup);
  sanitizeSvgDocument(doc);
  const el = getEditableElement(doc, key);

  if (!el) {
    return serializeSvg(doc);
  }

  applySvgItemPatch(el, patch);
  return serializeSvg(doc);
}

export async function replaceSvgImageItemFromFile(svgMarkup: string, key: string, file: File) {
  return updateSvgItem(svgMarkup, key, {
    hrefDataUrl: await fileToDataUrl(file),
  });
}

export function applyDynamicSvgTextBindings(
  svgMarkup: string,
  values: SvgDynamicTextValues,
  patches?: SvgItemPatchMap,
): { markup: string; svgBoundFieldIds: Set<SvgDynamicTextFieldId> } {
  const doc = parseSvgDocument(svgMarkup);
  sanitizeSvgDocument(doc);
  applySvgItemPatches(doc, patches);
  const svgBoundFieldIds = bindDynamicSvgText(doc, values);
  return { markup: serializeSvg(doc), svgBoundFieldIds };
}
