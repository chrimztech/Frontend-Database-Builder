import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Trash2, RefreshCw } from "lucide-react";

import { TemplateEditor } from "@/components/admin/template-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  SEAL_PATH,
  SIGNATURE_PATH,
  SIGNATURE2_PATH,
  TEMPLATE_BG_PATH,
  uploadBrandingFile,
  deleteBrandingFile,
  getBrandingSignedUrl,
  clearBrandingCache,
  loadBranding,
} from "@/lib/branding";
import {
  buildIllustratorPayload,
  downloadIllustratorPayload,
} from "@/lib/illustrator-handoff";
import {
  isPdfCompatibleIllustratorFile,
  renderPdfBlobPageToDataUrl,
} from "@/lib/pdf-like";

const SAMPLE_TEMPLATE_ASSET = "/certificate-template-sample.svg";
const BRANDING_ACCEPT =
  "image/png,image/jpeg,image/jpg,image/svg+xml,.svg,application/pdf,.pdf,.ai";

const SLOTS: {
  path: string;
  label: string;
  description: string;
  recommend: string;
  svgTarget?: [number, number];
  fillBackground?: boolean;
  sampleAsset?: string;
}[] = [
  {
    path: TEMPLATE_BG_PATH,
    label: "Certificate background (optional)",
    description:
      "Your existing certificate design used as the full-page background. Portrait A4 recommended.",
    recommend: "PNG, JPG, SVG, PDF or AI - portrait - 2480x3508 px recommended",
    svgTarget: [2480, 3508],
    fillBackground: true,
    sampleAsset: SAMPLE_TEMPLATE_ASSET,
  },
  {
    path: SEAL_PATH,
    label: "Digital seal",
    description:
      "Embossed seal or stamp centered above the signatures. Use a transparent asset where possible.",
    recommend: "PNG, SVG, PDF or AI with transparency - 600x600 px",
    svgTarget: [600, 600],
    fillBackground: false,
  },
  {
    path: SIGNATURE_PATH,
    label: "Signature #1 (left)",
    description:
      "Scanned signature for the first signatory (for example the Director).",
    recommend: "PNG, SVG, PDF or AI with transparency - 800x280 px",
    svgTarget: [800, 280],
    fillBackground: false,
  },
  {
    path: SIGNATURE2_PATH,
    label: "Signature #2 (right)",
    description:
      "Scanned signature for the second signatory (for example the Programme Lead).",
    recommend: "PNG, SVG, PDF or AI with transparency - 800x280 px",
    svgTarget: [800, 280],
    fillBackground: false,
  },
];

function isPdfLikeFile(file: File) {
  const name = file.name.toLowerCase();
  return name.endsWith(".pdf") || name.endsWith(".ai");
}

function isSvgFile(file: File) {
  const name = file.name.toLowerCase();
  return file.type === "image/svg+xml" || name.endsWith(".svg");
}

function isEpsFile(file: File) {
  return file.name.toLowerCase().endsWith(".eps");
}

function isTemplateBackground(path: string) {
  return path === TEMPLATE_BG_PATH;
}

async function canvasToPngFile(canvas: HTMLCanvasElement, fileName: string) {
  return await new Promise<File>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Canvas conversion to PNG failed"));
          return;
        }

        resolve(new File([blob], fileName, { type: "image/png" }));
      },
      "image/png",
      0.95,
    );
  });
}

async function dataUrlToPngFile(dataUrl: string, fileName: string) {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return new File([blob], fileName, { type: "image/png" });
}

async function convertSvgToPng(
  file: File,
  targetW: number,
  targetH: number,
  fillBackground: boolean,
): Promise<File> {
  const text = await file.text();
  const parser = new DOMParser();
  const svgDoc = parser.parseFromString(text, "image/svg+xml");
  const svgEl = svgDoc.documentElement;

  const vb = svgEl
    .getAttribute("viewBox")
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);
  const naturalW =
    vb?.[2] ?? (parseFloat(svgEl.getAttribute("width") ?? "595") || 595);
  const naturalH =
    vb?.[3] ?? (parseFloat(svgEl.getAttribute("height") ?? "842") || 842);

  const scale = Math.min(targetW / naturalW, targetH / naturalH);
  const canvasW = Math.round(naturalW * scale);
  const canvasH = Math.round(naturalH * scale);

  svgEl.setAttribute("width", String(naturalW));
  svgEl.setAttribute("height", String(naturalH));

  const fixedSvg = new XMLSerializer().serializeToString(svgEl);
  const blob = new Blob([fixedSvg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  return await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = canvasW;
      canvas.height = canvasH;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("Canvas could not be created for SVG conversion"));
        return;
      }

      if (fillBackground) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvasW, canvasH);
      }

      ctx.drawImage(img, 0, 0, canvasW, canvasH);
      URL.revokeObjectURL(url);
      void canvasToPngFile(canvas, file.name.replace(/\.svg$/i, ".png")).then(
        resolve,
        reject,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(
        new Error(
          "SVG could not be rendered. It may contain unsupported features or external links.",
        ),
      );
    };
    img.src = url;
  });
}

async function convertPdfLikeToPng(
  file: File,
  targetW: number,
  targetH: number,
): Promise<File> {
  try {
    const dataUrl = await renderPdfBlobPageToDataUrl(file, {
      targetWidth: targetW,
      targetHeight: targetH,
    });
    return await dataUrlToPngFile(
      dataUrl,
      file.name.replace(/\.(ai|pdf)$/i, ".png"),
    );
  } catch {
    throw new Error(
      `${file.name} could not be rendered from page 1. ` +
        "If it came from Illustrator, save it with Create PDF-compatible file turned on.",
    );
  }
}

export function BrandingTab() {
  const [exportingIllustratorPayload, setExportingIllustratorPayload] =
    useState(false);

  async function onDownloadIllustratorPayload() {
    setExportingIllustratorPayload(true);
    try {
      const branding = await loadBranding();
      const payload = buildIllustratorPayload(branding.settings);
      downloadIllustratorPayload(payload);
      toast.success("Illustrator payload downloaded");
    } catch (error: any) {
      toast.error(error.message ?? "Could not build Illustrator payload");
    } finally {
      setExportingIllustratorPayload(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="kicker">Certificate branding</p>
        <p className="text-sm text-muted-foreground">
          Upload your certificate background, digital seal, and two signature images.
          PDF-compatible Illustrator backgrounds are stored as-is and rendered from
          page 1 when the app needs a preview or certificate export. Edit the
          signatory names and titles from the{" "}
          <span className="font-medium">Settings</span> tab.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {SLOTS.map((slot) => (
          <BrandingSlot key={slot.path} {...slot} />
        ))}
      </div>

      <div className="surface-panel rounded-xl p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <Label className="text-base">Illustrator-native editing</Label>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              If you want to keep editing the uploaded certificate in Adobe
              Illustrator, use the handoff workflow instead of the browser
              template editor. Download the payload JSON here, then run the
              script in{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                illustrator/apply-certificate-payload.jsx
              </code>{" "}
              to push your current branding and signatory values into named
              objects inside the open <code className="text-xs">.ai</code> file.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={onDownloadIllustratorPayload}
            disabled={exportingIllustratorPayload}
          >
            {exportingIllustratorPayload
              ? "Preparing payload..."
              : "Download Illustrator payload"}
          </Button>
        </div>
      </div>

      <div className="border-t pt-6">
        <TemplateEditor />
      </div>
    </div>
  );
}

function BrandingSlot({
  path,
  label,
  description,
  recommend,
  svgTarget,
  fillBackground = false,
  sampleAsset,
}: {
  path: string;
  label: string;
  description: string;
  recommend: string;
  svgTarget?: [number, number];
  fillBackground?: boolean;
  sampleAsset?: string;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [stamp, setStamp] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        if (isTemplateBackground(path)) {
          const branding = await loadBranding();
          let nextPreview = branding.templateBgDataUrl;

          if (!nextPreview && branding.templateBgBlob) {
            nextPreview = await renderPdfBlobPageToDataUrl(branding.templateBgBlob, {
              targetWidth: 1240,
              targetHeight: 1754,
            });
          }

          if (!cancelled) {
            setPreviewUrl(nextPreview);
          }
          return;
        }

        const url = await getBrandingSignedUrl(path);
        if (!cancelled) {
          setPreviewUrl(url);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [path, stamp]);

  async function uploadAsset(file: File) {
    if (isEpsFile(file)) {
      throw new Error(
        `"${file.name}" cannot be uploaded directly. ` +
          "Export it from Illustrator as SVG, PNG, or PDF first, then upload that file.",
      );
    }

    const [tw, th] = svgTarget ?? [2480, 3508];
    let uploadFile = file;

    if (isSvgFile(file)) {
      toast.message("Converting SVG to PNG...");
      uploadFile = await convertSvgToPng(file, tw, th, fillBackground);
    } else if (isPdfLikeFile(file)) {
      if (isTemplateBackground(path)) {
        if (file.name.toLowerCase().endsWith(".ai")) {
          toast.message("Checking Illustrator PDF compatibility...");
          const isCompatible = await isPdfCompatibleIllustratorFile(file);
          if (!isCompatible) {
            throw new Error(
              `${file.name} is not saved as a PDF-compatible Illustrator file. ` +
                "In Illustrator, enable Create PDF-compatible file and save again.",
            );
          }
        }

        uploadFile = new File(
          [await file.arrayBuffer()],
          file.name.replace(/\.ai$/i, ".pdf"),
          { type: "application/pdf" },
        );
      } else {
        toast.message(
          file.name.toLowerCase().endsWith(".ai")
            ? "Converting Illustrator file to PNG..."
            : "Converting PDF to PNG...",
        );
        uploadFile = await convertPdfLikeToPng(file, tw, th);
      }
    }

    if (uploadFile.size > 10 * 1024 * 1024) {
      throw new Error("File too large (max 10 MB)");
    }

    await uploadBrandingFile(path, uploadFile);
  }

  async function onPick(file: File | null) {
    if (!file) return;

    setBusy(true);
    try {
      await uploadAsset(file);
      toast.success(`${label} uploaded`);
      setStamp((value) => value + 1);
    } catch (error: any) {
      toast.error(error.message ?? "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function onUseSample() {
    if (!sampleAsset) return;
    if (
      previewUrl &&
      !window.confirm(
        "Replace the current certificate background with the built-in sample template?",
      )
    ) {
      return;
    }

    setBusy(true);
    try {
      const response = await fetch(sampleAsset);
      if (!response.ok) {
        throw new Error("Sample template could not be loaded");
      }

      const blob = await response.blob();
      const file = new File([blob], "certificate-template-sample.svg", {
        type: "image/svg+xml",
      });

      await uploadAsset(file);
      toast.success("Sample certificate template applied");
      setStamp((value) => value + 1);
    } catch (error: any) {
      toast.error(error.message ?? "Sample template could not be applied");
    } finally {
      setBusy(false);
    }
  }

  async function onRemove() {
    if (!window.confirm(`Remove ${label.toLowerCase()}?`)) return;

    setBusy(true);
    try {
      await deleteBrandingFile(path);
      setPreviewUrl(null);
      clearBrandingCache();
      toast.success("Removed");
    } catch (error: any) {
      toast.error(error.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="surface-panel space-y-3 rounded-xl p-4">
      <div>
        <Label className="text-base">{label}</Label>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        <p className="mt-1 text-xs italic text-muted-foreground">{recommend}</p>
      </div>

      <div className="flex aspect-video items-center justify-center overflow-hidden rounded-md border bg-muted/30">
        {loading ? (
          <span className="text-xs text-muted-foreground">Loading...</span>
        ) : previewUrl ? (
          <img
            src={previewUrl}
            alt={label}
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <span className="text-xs text-muted-foreground">Not uploaded</span>
        )}
      </div>

      <p className="text-[11px] leading-5 text-muted-foreground">
        Background AI and PDF files stay in storage as uploaded and are rendered
        from page 1. SVG files are still converted to PNG, and seal or signature
        PDF/AI files are rasterized because those slots behave like images.
      </p>

      <div className="flex items-center gap-2">
        <Input
          type="file"
          accept={BRANDING_ACCEPT}
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            event.currentTarget.value = "";
            void onPick(file);
          }}
          className="text-xs"
        />

        {previewUrl ? (
          <Button variant="ghost" size="sm" onClick={onRemove} disabled={busy}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        ) : null}

        {sampleAsset ? (
          <Button variant="outline" size="sm" onClick={onUseSample} disabled={busy}>
            Use sample
          </Button>
        ) : null}

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setStamp((value) => value + 1)}
          disabled={busy}
          title="Refresh preview"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
