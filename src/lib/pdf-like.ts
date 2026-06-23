export function isPdfMimeType(mimeType: string | null | undefined) {
  return (mimeType ?? "").toLowerCase().includes("pdf");
}

export function isSvgMimeType(mimeType: string | null | undefined) {
  return (mimeType ?? "").toLowerCase().includes("svg");
}

export function looksLikeSvgMarkup(text: string) {
  return /<svg[\s>]/i.test(text);
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

const XLINK_NS = "http://www.w3.org/1999/xlink";

async function fetchUrlAsDataUrl(url: string) {
  const response = await fetch(url);
  if (!response.ok) return null;
  return await blobToDataUrl(await response.blob());
}

async function inlineSameOriginSvgImages(svgMarkup: string) {
  if (!/<image[\s>]/i.test(svgMarkup)) return svgMarkup;

  const doc = new DOMParser().parseFromString(svgMarkup, "image/svg+xml");
  const parseError = doc.querySelector("parsererror");
  const root = doc.documentElement;
  if (parseError || root.tagName.toLowerCase() !== "svg") return svgMarkup;

  const images = Array.from(root.querySelectorAll("image"));
  await Promise.all(
    images.map(async (image) => {
      const href = image.getAttribute("href") ?? image.getAttributeNS(XLINK_NS, "href");
      if (!href || /^(data|blob):/i.test(href)) return;

      let resolved: URL;
      try {
        resolved = new URL(href, window.location.href);
      } catch {
        return;
      }

      if (resolved.origin !== window.location.origin) return;

      const dataUrl = await fetchUrlAsDataUrl(resolved.toString()).catch(() => null);
      if (!dataUrl) return;

      image.setAttribute("href", dataUrl);
      image.setAttributeNS(XLINK_NS, "xlink:href", dataUrl);
    }),
  );

  return new XMLSerializer().serializeToString(root);
}

export async function isPdfCompatibleIllustratorFile(file: Blob) {
  const header = await file.slice(0, 5).text();
  return header === "%PDF-";
}

export async function readSvgMarkupFromBlob(blob: Blob) {
  const text = await blob.text();
  return looksLikeSvgMarkup(text) ? text : null;
}

function parseSvgLength(value: string | null | undefined) {
  if (!value) return undefined;

  const trimmed = value.trim();
  if (!trimmed || trimmed.endsWith("%")) return undefined;

  const match = trimmed.match(/^(-?\d*\.?\d+)(px|pt|mm|cm|in|pc)?$/i);
  if (!match) return undefined;

  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return undefined;

  const unit = match[2]?.toLowerCase();
  switch (unit) {
    case "pt":
      return amount * (96 / 72);
    case "mm":
      return amount * (96 / 25.4);
    case "cm":
      return amount * (96 / 2.54);
    case "in":
      return amount * 96;
    case "pc":
      return amount * 16;
    default:
      return amount;
  }
}

function readSvgDimensions(svgMarkup: string) {
  const doc = new DOMParser().parseFromString(svgMarkup, "image/svg+xml");
  const root = doc.documentElement;

  if (root.tagName.toLowerCase() !== "svg") {
    throw new Error("SVG markup could not be parsed");
  }

  const viewBox = root
    .getAttribute("viewBox")
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);

  const viewBoxWidth = viewBox?.length === 4 && Number.isFinite(viewBox[2]) ? viewBox[2] : null;
  const viewBoxHeight = viewBox?.length === 4 && Number.isFinite(viewBox[3]) ? viewBox[3] : null;

  const width = viewBoxWidth ?? parseSvgLength(root.getAttribute("width")) ?? 595;
  const height = viewBoxHeight ?? parseSvgLength(root.getAttribute("height")) ?? 842;

  return { width, height };
}

let pdfJsPromise: Promise<{
  getDocument: (src: { data: ArrayBuffer }) => {
    promise: Promise<any>;
    destroy: () => Promise<void>;
  };
  GlobalWorkerOptions: { workerSrc: string };
  workerSrc: string;
}> | null = null;

async function loadPdfJs() {
  if (!pdfJsPromise) {
    pdfJsPromise = Promise.all([
      import("pdfjs-dist/legacy/build/pdf.mjs"),
      import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
    ]).then(([pdfjs, worker]) => ({
      getDocument: pdfjs.getDocument,
      GlobalWorkerOptions: pdfjs.GlobalWorkerOptions,
      workerSrc: worker.default,
    }));
  }

  const pdfjs = await pdfJsPromise;
  pdfjs.GlobalWorkerOptions.workerSrc = pdfjs.workerSrc;
  return pdfjs;
}

export interface PdfPageTextItem {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  pageWidth: number;
  pageHeight: number;
}

export async function extractPdfPageTextItems(blob: Blob): Promise<PdfPageTextItem[]> {
  const { getDocument } = await loadPdfJs();
  const loadingTask = getDocument({ data: await blob.arrayBuffer() });

  try {
    const pdf = await loadingTask.promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 1 });
    const textContent = await page.getTextContent();
    const items = (textContent.items ?? []) as Array<{
      str?: string;
      width?: number;
      height?: number;
      transform?: number[];
    }>;

    return items
      .map((item) => {
        const text = (item.str ?? "").replace(/\s+/g, " ").trim();
        const transform = item.transform ?? [];
        const x = Number(transform[4] ?? 0);
        const baselineY = Number(transform[5] ?? 0);
        const height = Math.abs(Number(item.height ?? transform[3] ?? 0)) || 8;

        return {
          text,
          x,
          y: viewport.height - baselineY - height,
          width: Number(item.width ?? 0),
          height,
          pageWidth: viewport.width,
          pageHeight: viewport.height,
        };
      })
      .filter((item) => item.text.length > 0);
  } finally {
    await loadingTask.destroy().catch(() => undefined);
  }
}

export async function renderSvgMarkupToDataUrl(
  svgMarkup: string,
  {
    targetWidth,
    targetHeight,
    backgroundColor = "#ffffff",
  }: {
    targetWidth?: number;
    targetHeight?: number;
    backgroundColor?: string;
  } = {},
): Promise<string> {
  const { width: naturalWidth, height: naturalHeight } = readSvgDimensions(svgMarkup);

  const hasTargetBox = Boolean(targetWidth && targetHeight);
  let scale = 1;
  if (targetWidth && targetHeight) {
    scale = Math.min(targetWidth / naturalWidth, targetHeight / naturalHeight);
  } else if (targetWidth) {
    scale = targetWidth / naturalWidth;
  } else if (targetHeight) {
    scale = targetHeight / naturalHeight;
  }

  const canvas = document.createElement("canvas");
  const drawWidth = Math.max(1, Math.round(naturalWidth * scale));
  const drawHeight = Math.max(1, Math.round(naturalHeight * scale));
  canvas.width = hasTargetBox ? Math.max(1, Math.round(targetWidth!)) : drawWidth;
  canvas.height = hasTargetBox ? Math.max(1, Math.round(targetHeight!)) : drawHeight;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas could not be created for SVG rendering");
  }

  if (backgroundColor) {
    context.fillStyle = backgroundColor;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }

  const renderMarkup = await inlineSameOriginSvgImages(svgMarkup);
  const url = URL.createObjectURL(
    new Blob([renderMarkup], { type: "image/svg+xml;charset=utf-8" }),
  );

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const nextImage = new Image();
      nextImage.onload = () => resolve(nextImage);
      nextImage.onerror = () =>
        reject(
          new Error(
            "SVG could not be rendered. It may contain unsupported features or external links.",
          ),
        );
      nextImage.src = url;
    });

    const offsetX = hasTargetBox ? Math.round((canvas.width - drawWidth) / 2) : 0;
    const offsetY = hasTargetBox ? Math.round((canvas.height - drawHeight) / 2) : 0;
    context.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
    return canvas.toDataURL("image/png", 0.95);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function renderSvgBlobToDataUrl(
  blob: Blob,
  options?: {
    targetWidth?: number;
    targetHeight?: number;
    backgroundColor?: string;
  },
) {
  return await renderSvgMarkupToDataUrl(await blob.text(), options);
}

export async function renderPdfBlobPageToDataUrl(
  blob: Blob,
  {
    targetWidth,
    targetHeight,
    backgroundColor = "#ffffff",
  }: {
    targetWidth?: number;
    targetHeight?: number;
    backgroundColor?: string;
  } = {},
): Promise<string> {
  const { getDocument } = await loadPdfJs();
  const loadingTask = getDocument({ data: await blob.arrayBuffer() });

  try {
    const pdf = await loadingTask.promise;
    const page = await pdf.getPage(1);
    const baseViewport = page.getViewport({ scale: 1 });

    const hasTargetBox = Boolean(targetWidth && targetHeight);
    let scale = 1;
    if (targetWidth && targetHeight) {
      scale = Math.min(targetWidth / baseViewport.width, targetHeight / baseViewport.height);
    } else if (targetWidth) {
      scale = targetWidth / baseViewport.width;
    } else if (targetHeight) {
      scale = targetHeight / baseViewport.height;
    }

    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = hasTargetBox
      ? Math.max(1, Math.round(targetWidth!))
      : Math.max(1, Math.round(viewport.width));
    canvas.height = hasTargetBox
      ? Math.max(1, Math.round(targetHeight!))
      : Math.max(1, Math.round(viewport.height));

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Canvas could not be created for PDF rendering");
    }

    if (backgroundColor) {
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    const offsetX = hasTargetBox ? Math.round((canvas.width - viewport.width) / 2) : 0;
    const offsetY = hasTargetBox ? Math.round((canvas.height - viewport.height) / 2) : 0;

    ctx.save();
    ctx.translate(offsetX, offsetY);
    try {
      await page.render({
        canvasContext: ctx,
        viewport,
        background: backgroundColor ? "rgb(255,255,255)" : undefined,
      }).promise;
    } finally {
      ctx.restore();
    }

    return canvas.toDataURL("image/png", 0.95);
  } finally {
    await loadingTask.destroy().catch(() => undefined);
  }
}
