export function isPdfMimeType(mimeType: string | null | undefined) {
  return (mimeType ?? "").toLowerCase().includes("pdf");
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
