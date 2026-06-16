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

function getPresentationValue(
  el: Element,
  attrName: string,
  styleName = attrName,
) {
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

function sanitizeSvgDocument(doc: Document) {
  const root = doc.documentElement;
  let textIndex = 0;
  let imageIndex = 0;

  root.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  root.setAttribute("xmlns:xlink", XLINK_NS);

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

function buildItemLabel(
  el: Element,
  kind: EditableSvgItem["kind"],
  index: number,
  text?: string,
) {
  const explicitName =
    el.getAttribute("id") ||
    el.getAttribute("inkscape:label") ||
    el.getAttribute("data-name");

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
        href:
          el.getAttribute("href") ??
          el.getAttributeNS(XLINK_NS, "href") ??
          undefined,
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
  return doc.documentElement.querySelector(
    `[data-editor-key="${key}"]`,
  );
}

function setNumericAttribute(el: Element, attrName: string, value: number | undefined) {
  if (value === undefined || Number.isNaN(value)) return;
  el.setAttribute(attrName, String(value));
}

async function fileToDataUrl(file: File) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function inspectEditableSvgMarkup(svgMarkup: string) {
  const doc = parseSvgDocument(svgMarkup);
  sanitizeSvgDocument(doc);

  return {
    markup: serializeSvg(doc),
    items: collectEditableItems(doc),
  };
}

export function updateSvgItem(
  svgMarkup: string,
  key: string,
  patch: SvgItemPatch,
) {
  const doc = parseSvgDocument(svgMarkup);
  sanitizeSvgDocument(doc);
  const el = getEditableElement(doc, key);

  if (!el) {
    return serializeSvg(doc);
  }

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

  return serializeSvg(doc);
}

export async function replaceSvgImageItemFromFile(
  svgMarkup: string,
  key: string,
  file: File,
) {
  return updateSvgItem(svgMarkup, key, {
    hrefDataUrl: await fileToDataUrl(file),
  });
}
