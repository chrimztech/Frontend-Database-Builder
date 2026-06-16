export function isPdfMimeType(mimeType: string | null | undefined) {
  return (mimeType ?? "").toLowerCase().includes("pdf");
}

export function isSvgMimeType(mimeType: string | null | undefined) {
  return (mimeType ?? "").toLowerCase().includes("svg");
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function isPdfCompatibleIllustratorFile(file: Blob) {
  const header = await file.slice(0, 5).text();
  return header === "%PDF-";
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

  const width =
    viewBox?.[2] ??
    (parseFloat(root.getAttribute("width")?.replace(/px$/i, "") ?? "595") || 595);
  const height =
    viewBox?.[3] ??
    (parseFloat(root.getAttribute("height")?.replace(/px$/i, "") ?? "842") || 842);

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

  let scale = 1;
  if (targetWidth && targetHeight) {
    scale = Math.min(targetWidth / naturalWidth, targetHeight / naturalHeight);
  } else if (targetWidth) {
    scale = targetWidth / naturalWidth;
  } else if (targetHeight) {
    scale = targetHeight / naturalHeight;
  }

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(naturalHeight * scale));

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas could not be created for SVG rendering");
  }

  if (backgroundColor) {
    context.fillStyle = backgroundColor;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }

  const url = URL.createObjectURL(
    new Blob([svgMarkup], { type: "image/svg+xml;charset=utf-8" }),
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

    context.drawImage(image, 0, 0, canvas.width, canvas.height);
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
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Canvas could not be created for PDF rendering");
    }

    if (backgroundColor) {
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    await page.render({
      canvasContext: ctx,
      viewport,
      background: backgroundColor ? "rgb(255,255,255)" : undefined,
    }).promise;

    return canvas.toDataURL("image/png", 0.95);
  } finally {
    await loadingTask.destroy().catch(() => undefined);
  }
}
