import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Save,
  RotateCcw,
  Eye,
  EyeOff,
  Download,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  AlignCenter,
  AlignCenterHorizontal,
  Trash2,
  Plus,
  Image as ImageIcon,
  Square,
  Sparkles,
} from "lucide-react";

import { SvgBackgroundPanel } from "@/components/admin/svg-background-panel";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import {
  A4_MM,
  DEFAULT_LAYOUT,
  DEFAULT_LOGO_OVERLAY,
  FIELD_KINDS,
  FIELD_LABELS,
  getFieldLabel,
  isQrOnlyLayout,
  isPredefined,
  toQrOnlyLayout,
  type FieldId,
  type LayoutField,
  type LogoOverlay,
  type TemplateLayout,
} from "@/lib/template-layout";
import { clearBrandingCache, loadBranding, saveTemplateLayout } from "@/lib/branding";
import { renderPdfBlobPageToDataUrl, renderSvgMarkupToDataUrl } from "@/lib/pdf-like";
import { getCssFontFamily } from "@/lib/font-loader";
import { fileToDataUrl, inspectEditableSvgMarkup, type SvgItemPatch } from "@/lib/svg-template";
import {
  detectTemplateFieldsFromPdfBlob,
  detectTemplateFieldsFromSvgMarkup,
  type TemplateFieldDetectionResult,
} from "@/lib/template-field-detection";
import { detectFieldsFromSvg, type DetectedField } from "@/lib/svg-field-detect";
import unzaLogo from "@/assets/unza-logo.png.asset.json";

const SAMPLE = {
  certificateId: "ME20260113331",
  recipientName: "Faith Mutinta Kanunka",
  programme: "Monitoring and Evaluation",
  issueDate: "2026-01-13",
  nrcNumber: "661529/10/1",
};

const FONTS: { value: NonNullable<LayoutField["fontFamily"]>; label: string }[] = [
  { value: "helvetica", label: "Helvetica — sans-serif" },
  { value: "times", label: "Times — serif" },
  { value: "courier", label: "Courier — monospace" },
  { value: "cormorant", label: "Cormorant Garamond — elegant serif" },
  { value: "playfair", label: "Playfair Display — formal serif" },
  { value: "manrope", label: "Manrope — modern sans" },
  { value: "lato", label: "Lato — clean sans" },
  { value: "cinzel", label: "Cinzel — Roman caps" },
];
const STYLES: { value: NonNullable<LayoutField["fontStyle"]>; label: string }[] = [
  { value: "normal", label: "Normal" },
  { value: "bold", label: "Bold" },
  { value: "italic", label: "Italic" },
  { value: "bolditalic", label: "Bold italic" },
];
const ALIGNS: { value: NonNullable<LayoutField["align"]>; label: string }[] = [
  { value: "left", label: "Left" },
  { value: "center", label: "Center" },
  { value: "right", label: "Right" },
];
const TRANSFORMS: { value: NonNullable<LayoutField["textTransform"]>; label: string }[] = [
  { value: "none", label: "None (as typed)" },
  { value: "uppercase", label: "UPPERCASE" },
  { value: "lowercase", label: "lowercase" },
];

const MAX_HISTORY = 50;
const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2];

let customCounter = 0;
function nextCustomId() {
  return `custom_${++customCounter}`;
}
function serializeSvgOverrides(overrides: TemplateLayout["svgBackgroundOverrides"]) {
  return JSON.stringify(overrides ?? {});
}

function makeDefaultFieldMask(field: LayoutField): LayoutField {
  return {
    id: `mask_${field.id}`,
    label: `Cover baked ${getFieldLabel(field)}`,
    kind: "shape",
    visible: true,
    x: Math.max(0, field.x - 1),
    y: Math.max(0, field.y - 0.6),
    w: Math.min(A4_MM.w, field.w + 2),
    h: Math.min(A4_MM.h, field.h + 1.2),
    fillColor: "#ffffff",
    opacity: 1,
  };
}

function buildDefaultOverlayLayout(currentLayout: TemplateLayout): TemplateLayout {
  const baseFields = DEFAULT_LAYOUT.fields.map((field) => {
    const existing = currentLayout.fields.find((candidate) => candidate.id === field.id);
    return { ...field, ...existing, visible: true };
  });
  const masks = baseFields.filter((field) => field.kind === "text").map(makeDefaultFieldMask);

  return {
    version: 1,
    fields: [...masks, ...baseFields],
    logoOverlay: { ...(currentLayout.logoOverlay ?? DEFAULT_LOGO_OVERLAY), enabled: false },
    svgBackgroundOverrides: {},
  };
}

export function TemplateEditor({
  refreshToken = 0,
  refreshIncludesLayout = false,
}: {
  refreshToken?: number;
  refreshIncludesLayout?: boolean;
}) {
  const [layout, setLayout] = useState<TemplateLayout>(DEFAULT_LAYOUT);
  const [bgUrl, setBgUrl] = useState<string | null>(null);
  const [bgBlob, setBgBlob] = useState<Blob | null>(null);
  const [bgSvgMarkup, setBgSvgMarkup] = useState<string | null>(null);
  const [bgSvgOverrides, setBgSvgOverrides] = useState<
    NonNullable<TemplateLayout["svgBackgroundOverrides"]>
  >({});
  const [sealUrl, setSealUrl] = useState<string | null>(null);
  const [sig1Url, setSig1Url] = useState<string | null>(null);
  const [sig2Url, setSig2Url] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedSvgKey, setSelectedSvgKey] = useState<string | null>(null);
  const [selectedSvgBox, setSelectedSvgBox] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [detectingFields, setDetectingFields] = useState(false);
  const [pendingDetection, setPendingDetection] = useState<{
    heuristic: TemplateFieldDetectionResult;
    patterns: DetectedField[];
  } | null>(null);
  const [snapGrid, setSnapGrid] = useState(false);
  const [zoomIdx, setZoomIdx] = useState(2);
  const [inspectSvgLayers, setInspectSvgLayers] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const historyRef = useRef<TemplateLayout[]>([DEFAULT_LAYOUT]);
  const histIdxRef = useRef(0);
  const layoutRef = useRef<TemplateLayout>(DEFAULT_LAYOUT);
  useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

  useEffect(() => {
    if (document.querySelector("[data-gf-cert-editor]")) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.dataset.gfCertEditor = "1";
    link.href =
      "https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700&family=Cormorant+Garamond:ital,wght@0,400;0,600;0,700;1,400&family=Lato:ital,wght@0,400;0,700;1,400&family=Manrope:wght@400;500;600;700;800&family=Playfair+Display:ital,wght@0,400;0,700;1,400&display=swap";
    document.head.appendChild(link);
  }, []);

  const canvasRef = useRef<HTMLDivElement>(null);
  const svgPreviewRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(2.1);
  const originalBgSvgOverridesRef = useRef("{}");
  const lastLoadedBgSvgRef = useRef<string | null>(null);

  useEffect(() => {
    function recompute() {
      const el = canvasRef.current?.parentElement;
      if (!el) return;
      const max = Math.min(el.clientWidth - 4, 540);
      setScale(max / A4_MM.w);
    }
    recompute();
    window.addEventListener("resize", recompute);
    return () => window.removeEventListener("resize", recompute);
  }, []);

  const zoom = ZOOM_STEPS[zoomIdx];
  const effectiveScale = scale * zoom;
  const canvasW = A4_MM.w * effectiveScale;
  const canvasH = A4_MM.h * effectiveScale;
  const qrOnlyMode = isQrOnlyLayout(layout);
  // Quick complexity check via regex — avoids creating a full DOM for a count.
  // SVGs exported letter-by-letter can have 30,000+ <text> nodes; inserting them
  // inline freezes the browser. Fall back to the flat bgUrl preview for those.
  const svgIsComplex = useMemo(() => {
    if (!bgSvgMarkup) return false;
    return (bgSvgMarkup.match(/<text[\s>]/gi) ?? []).length > 500;
  }, [bgSvgMarkup]);

  const editableBgSvg = useMemo(() => {
    if (!bgSvgMarkup || qrOnlyMode || !inspectSvgLayers || svgIsComplex) return null;
    try {
      return inspectEditableSvgMarkup(bgSvgMarkup, bgSvgOverrides);
    } catch {
      return null;
    }
  }, [bgSvgMarkup, bgSvgOverrides, inspectSvgLayers, qrOnlyMode, svgIsComplex]);
  const bgSvgDirty = serializeSvgOverrides(bgSvgOverrides) !== originalBgSvgOverridesRef.current;
  const svgEditableCount = editableBgSvg?.items.length ?? 0;
  const svgPreviewLabels = editableBgSvg?.items.slice(0, 4).map((item) => item.label) ?? [];
  const showFlatBackground = Boolean(bgUrl && (qrOnlyMode || !inspectSvgLayers));

  const snap = useCallback(
    (v: number) => (snapGrid ? Math.round(v) : Math.round(v * 10) / 10),
    [snapGrid],
  );

  const loadTemplateEditorState = useCallback(async (includeLayout: boolean) => {
    const b = await loadBranding();
    setBgBlob(b.templateBgBlob);

    if (includeLayout) {
      const loaded = b.layout;
      historyRef.current = [loaded];
      histIdxRef.current = 0;
      layoutRef.current = loaded;
      setLayout(loaded);
      setBgSvgOverrides(loaded.svgBackgroundOverrides ?? {});
      originalBgSvgOverridesRef.current = serializeSvgOverrides(loaded.svgBackgroundOverrides);
      setCanUndo(false);
      setCanRedo(false);
    }

    // Only reset bgSvgMarkup when the background file itself changed in Supabase.
    // This preserves in-browser SVG image edits (replaceBackgroundSvgImage) when
    // the user uploads only a seal or signature rather than a new template background.
    const newSvg = b.templateBgSvgMarkup ?? null;
    const svgChangedInSupabase = newSvg !== lastLoadedBgSvgRef.current;
    if (includeLayout || svgChangedInSupabase) {
      setBgSvgMarkup(newSvg);
      lastLoadedBgSvgRef.current = newSvg;
      setInspectSvgLayers(false);
      // Background changed on a non-initial refresh — clear stale item overrides
      // that reference elements from the old SVG.
      if (!includeLayout) {
        setBgSvgOverrides({});
        originalBgSvgOverridesRef.current = "{}";
      }
    }

    if (b.templateBgDataUrl) {
      setBgUrl(b.templateBgDataUrl);
    } else if (b.templateBgSvgMarkup) {
      const renderedBg = await renderSvgMarkupToDataUrl(b.templateBgSvgMarkup, {
        targetWidth: 1240,
        targetHeight: 1754,
      });
      setBgUrl(renderedBg);
    } else if (b.templateBgBlob) {
      const renderedBg = await renderPdfBlobPageToDataUrl(b.templateBgBlob, {
        targetWidth: 1240,
        targetHeight: 1754,
      });
      setBgUrl(renderedBg);
    } else {
      setBgUrl(null);
    }

    setSealUrl(b.sealDataUrl);
    setSig1Url(b.signatureDataUrl);
    setSig2Url(b.signature2DataUrl);
    setSelectedSvgKey(null);
    setSelectedSvgBox(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        await loadTemplateEditorState(true);
      } catch (e: any) {
        if (!cancelled) {
          toast.error(e.message ?? "Failed to load branding");
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
  }, [loadTemplateEditorState]);

  useEffect(() => {
    if (refreshToken === 0) return;

    let cancelled = false;

    (async () => {
      try {
        await loadTemplateEditorState(refreshIncludesLayout);
        if (!cancelled) {
          toast.success("Template editor refreshed with the latest uploaded background");
        }
      } catch (e: any) {
        if (!cancelled) {
          toast.error(e.message ?? "Failed to refresh the template editor");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loadTemplateEditorState, refreshIncludesLayout, refreshToken]);

  useEffect(() => {
    if (!editableBgSvg?.items.length) {
      setSelectedSvgKey(null);
      setSelectedSvgBox(null);
      return;
    }

    if (!selectedSvgKey || !editableBgSvg.items.some((item) => item.key === selectedSvgKey)) {
      setSelectedSvgKey(editableBgSvg.items[0]?.key ?? null);
    }
  }, [editableBgSvg, selectedSvgKey]);

  useEffect(() => {
    const host = svgPreviewRef.current;
    const svgEl = host?.querySelector("svg") as SVGSVGElement | null;
    if (!host || !svgEl) {
      setSelectedSvgBox(null);
      return;
    }

    svgEl.style.width = "100%";
    svgEl.style.height = "100%";
    svgEl.style.display = "block";

    for (const editableEl of Array.from(svgEl.querySelectorAll("[data-svg-editable='true']"))) {
      (editableEl as HTMLElement).style.cursor = "pointer";
    }

    if (!selectedSvgKey) {
      setSelectedSvgBox(null);
      return;
    }

    const selectedSvgEl = svgEl.querySelector(
      `[data-editor-key="${selectedSvgKey}"]`,
    ) as SVGGraphicsElement | null;

    if (!selectedSvgEl) {
      setSelectedSvgBox(null);
      return;
    }

    try {
      const bbox = selectedSvgEl.getBBox();
      const viewBox = svgEl.viewBox.baseVal;
      const vbX = viewBox?.x ?? 0;
      const vbY = viewBox?.y ?? 0;
      const vbWidth = viewBox?.width || svgEl.clientWidth || 1;
      const vbHeight = viewBox?.height || svgEl.clientHeight || 1;
      const scaleX = svgEl.clientWidth / vbWidth;
      const scaleY = svgEl.clientHeight / vbHeight;
      const preserveAspectRatio = svgEl.getAttribute("preserveAspectRatio") ?? "";
      const usesUniformScale = !/\bnone\b/i.test(preserveAspectRatio);

      if (usesUniformScale) {
        const scaleMode = /\bslice\b/i.test(preserveAspectRatio) ? Math.max : Math.min;
        const uniformScale = scaleMode(scaleX, scaleY);
        const renderedWidth = vbWidth * uniformScale;
        const renderedHeight = vbHeight * uniformScale;
        const offsetX = /\bxmax/i.test(preserveAspectRatio)
          ? svgEl.clientWidth - renderedWidth
          : /\bxmin/i.test(preserveAspectRatio)
            ? 0
            : (svgEl.clientWidth - renderedWidth) / 2;
        const offsetY = /\bymax/i.test(preserveAspectRatio)
          ? svgEl.clientHeight - renderedHeight
          : /\bymin/i.test(preserveAspectRatio)
            ? 0
            : (svgEl.clientHeight - renderedHeight) / 2;

        setSelectedSvgBox({
          left: offsetX + (bbox.x - vbX) * uniformScale,
          top: offsetY + (bbox.y - vbY) * uniformScale,
          width: Math.max(bbox.width * uniformScale, 12),
          height: Math.max(bbox.height * uniformScale, 12),
        });
        return;
      }

      setSelectedSvgBox({
        left: (bbox.x - vbX) * scaleX,
        top: (bbox.y - vbY) * scaleY,
        width: Math.max(bbox.width * scaleX, 12),
        height: Math.max(bbox.height * scaleY, 12),
      });
    } catch {
      setSelectedSvgBox(null);
    }
  }, [editableBgSvg?.markup, selectedSvgKey, canvasW, canvasH]);

  // History
  function syncUndoRedo() {
    setCanUndo(histIdxRef.current > 0);
    setCanRedo(histIdxRef.current < historyRef.current.length - 1);
  }

  function pushLayout(newLayout: TemplateLayout) {
    const h = historyRef.current.slice(0, histIdxRef.current + 1);
    h.push(newLayout);
    if (h.length > MAX_HISTORY) h.shift();
    historyRef.current = h;
    histIdxRef.current = h.length - 1;
    layoutRef.current = newLayout;
    setLayout(newLayout);
    syncUndoRedo();
  }

  function undo() {
    const idx = histIdxRef.current;
    if (idx <= 0) return;
    histIdxRef.current = idx - 1;
    const l = historyRef.current[idx - 1];
    layoutRef.current = l;
    setLayout(l);
    syncUndoRedo();
  }

  function redo() {
    const idx = histIdxRef.current;
    if (idx >= historyRef.current.length - 1) return;
    histIdxRef.current = idx + 1;
    const l = historyRef.current[idx + 1];
    layoutRef.current = l;
    setLayout(l);
    syncUndoRedo();
  }

  function liveUpdateField(id: string, patch: Partial<LayoutField>) {
    setLayout((l) => {
      const n = { ...l, fields: l.fields.map((f) => (f.id === id ? { ...f, ...patch } : f)) };
      layoutRef.current = n;
      return n;
    });
  }

  function updateField(id: string, patch: Partial<LayoutField>) {
    const current = layoutRef.current;
    const newLayout = {
      ...current,
      fields: current.fields.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    };
    pushLayout(newLayout);
  }

  function onFieldDragEnd() {
    const current = layoutRef.current;
    const last = historyRef.current[histIdxRef.current];
    if (JSON.stringify(last) !== JSON.stringify(current)) {
      const h = historyRef.current.slice(0, histIdxRef.current + 1);
      h.push(current);
      if (h.length > MAX_HISTORY) h.shift();
      historyRef.current = h;
      histIdxRef.current = h.length - 1;
      syncUndoRedo();
    }
  }

  // Field add / delete
  function deleteField(id: string) {
    const current = layoutRef.current;
    pushLayout({ ...current, fields: current.fields.filter((f) => f.id !== id) });
    if (selected === id) setSelected(null);
  }

  function addPredefinedField(id: FieldId) {
    const defaults = DEFAULT_LAYOUT.fields.find((f) => f.id === id);
    if (!defaults) return;
    const current = layoutRef.current;
    if (current.fields.some((f) => f.id === id)) return;
    pushLayout({ ...current, fields: [...current.fields, { ...defaults }] });
    setSelected(id);
  }

  function addCustomText() {
    const id = nextCustomId();
    const newField: LayoutField = {
      id,
      label: "Custom text",
      kind: "text",
      visible: true,
      x: 20,
      y: 50,
      w: 170,
      h: 8,
      fontFamily: "helvetica",
      fontStyle: "normal",
      fontSize: 11,
      color: "#282828",
      align: "center",
      staticText: "Your custom text here",
    };
    const current = layoutRef.current;
    pushLayout({ ...current, fields: [...current.fields, newField] });
    setSelected(id);
  }

  function addCustomImage() {
    const id = nextCustomId();
    const newField: LayoutField = {
      id,
      label: "Custom image",
      kind: "image",
      visible: true,
      x: 80,
      y: 50,
      w: 50,
      h: 50,
    };
    const current = layoutRef.current;
    pushLayout({ ...current, fields: [...current.fields, newField] });
    setSelected(id);
  }

  function addCustomShape() {
    const id = nextCustomId();
    const newField: LayoutField = {
      id,
      label: "Mask box",
      kind: "shape",
      visible: true,
      x: 20,
      y: 20,
      w: 45,
      h: 12,
      fillColor: "#ffffff",
      opacity: 1,
    };
    const current = layoutRef.current;
    pushLayout({ ...current, fields: [...current.fields, newField] });
    setSelected(id);
  }

  function updateBackgroundSvgItem(key: string, patch: SvgItemPatch) {
    if (!bgSvgMarkup) return;

    setBgSvgOverrides((current) => ({
      ...current,
      [key]: {
        ...current[key],
        ...patch,
      },
    }));
  }

  async function replaceBackgroundSvgImage(key: string, file: File | null) {
    if (!bgSvgMarkup || !file) return;

    try {
      updateBackgroundSvgItem(key, {
        hrefDataUrl: await fileToDataUrl(file),
      });
      toast.success("SVG image layer updated");
    } catch (error: any) {
      toast.error(error.message ?? "Could not replace the SVG image layer");
    }
  }

  // Logo overlay
  const logoOverlay: LogoOverlay = layout.logoOverlay ?? DEFAULT_LOGO_OVERLAY;

  function updateLogoOverlay(patch: Partial<LogoOverlay>) {
    const current = layoutRef.current;
    pushLayout({
      ...current,
      logoOverlay: { ...(current.logoOverlay ?? DEFAULT_LOGO_OVERLAY), ...patch },
    });
  }

  function liveUpdateLogoOverlay(patch: Partial<LogoOverlay>) {
    setLayout((l) => {
      const n = { ...l, logoOverlay: { ...(l.logoOverlay ?? DEFAULT_LOGO_OVERLAY), ...patch } };
      layoutRef.current = n;
      return n;
    });
  }

  const selectedField = useMemo(
    () => (selected ? (layout.fields.find((f) => f.id === selected) ?? null) : null),
    [selected, layout],
  );

  // Predefined fields NOT currently in the layout
  const missingPredefined = useMemo(() => {
    const activeIds = new Set(layout.fields.map((f) => f.id));
    return (Object.keys(FIELD_LABELS) as FieldId[]).filter((id) => !activeIds.has(id));
  }, [layout.fields]);

  // Quick alignment
  function centerH() {
    if (!selectedField) return;
    updateField(selectedField.id, { x: (A4_MM.w - selectedField.w) / 2 });
  }
  function centerV() {
    if (!selectedField) return;
    updateField(selectedField.id, { y: (A4_MM.h - selectedField.h) / 2 });
  }

  // Keyboard shortcuts
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLSelectElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && !e.shiftKey && e.key === "z") {
        e.preventDefault();
        undo();
        return;
      }
      if (mod && (e.key === "y" || (e.shiftKey && e.key === "z"))) {
        e.preventDefault();
        redo();
        return;
      }
      if (e.key === "Escape") {
        setSelected(null);
        setSelectedSvgKey(null);
        return;
      }

      if (selected) {
        const step = e.shiftKey ? 5 : 0.5;
        const f = layoutRef.current.fields.find((f) => f.id === selected);
        if (!f) return;
        const moves: Record<string, Partial<LayoutField>> = {
          ArrowLeft: { x: Math.max(0, f.x - step) },
          ArrowRight: { x: Math.min(A4_MM.w - f.w, f.x + step) },
          ArrowUp: { y: Math.max(0, f.y - step) },
          ArrowDown: { y: Math.min(A4_MM.h - f.h, f.y + step) },
        };
        if (e.key in moves) {
          e.preventDefault();
          updateField(selected, moves[e.key]);
        }
        return;
      }

      if (!selectedSvgKey || !bgSvgMarkup) return;
      const svgItem = editableBgSvg?.items.find((item) => item.key === selectedSvgKey);
      if (!svgItem) return;

      const step = e.shiftKey ? 10 : 1;
      const nextMoves: Record<string, { x?: number; y?: number }> = {
        ArrowLeft: { x: (svgItem.x ?? 0) - step },
        ArrowRight: { x: (svgItem.x ?? 0) + step },
        ArrowUp: { y: (svgItem.y ?? 0) - step },
        ArrowDown: { y: (svgItem.y ?? 0) + step },
      };

      if (e.key in nextMoves) {
        e.preventDefault();
        updateBackgroundSvgItem(selectedSvgKey, nextMoves[e.key]);
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [bgSvgMarkup, editableBgSvg, selected, selectedSvgKey]);

  // Save / Reset / Preview
  async function onSave() {
    setSaving(true);
    try {
      await saveTemplateLayout({
        ...layoutRef.current,
        svgBackgroundOverrides: bgSvgOverrides,
      });
      originalBgSvgOverridesRef.current = serializeSvgOverrides(bgSvgOverrides);
      clearBrandingCache();
      toast.success(
        bgSvgDirty ? "Template layout and SVG background edits saved" : "Template layout saved",
      );
    } catch (e: any) {
      toast.error(e.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  function onReset() {
    if (!window.confirm("Reset to the default layout? All custom fields and changes will be lost."))
      return;
    pushLayout(DEFAULT_LAYOUT);
    setBgSvgOverrides({});
    setSelected(null);
  }

  async function onUseQrOnlyLayout() {
    const nextLayout = toQrOnlyLayout(layoutRef.current);
    pushLayout(nextLayout);
    setBgSvgOverrides({});
    setInspectSvgLayers(false);
    originalBgSvgOverridesRef.current = "{}";
    setSelected("qr");
    setSelectedSvgKey(null);

    try {
      await saveTemplateLayout(nextLayout);
      clearBrandingCache();
      toast.success("Only the QR code overlay is active now");
    } catch (error: any) {
      toast.error(error.message ?? "Could not save QR-only layout");
    }
  }

  function applyOverlayLayout(nextLayout: TemplateLayout, message: string, preferredSelected = "recipientName") {
    pushLayout(nextLayout);
    setBgSvgOverrides({});
    setInspectSvgLayers(false);
    originalBgSvgOverridesRef.current = "{}";
    setSelected(nextLayout.fields.some((field) => field.id === preferredSelected) ? preferredSelected : "qr");
    setSelectedSvgKey(null);
    setPendingDetection(null);
    toast.success(message);
    return nextLayout;
  }

  function buildSelectedDetectionIds(
    heuristic: TemplateFieldDetectionResult,
    patterns: DetectedField[],
  ) {
    if (heuristic.usedFallback) {
      const selectedIds = new Set<string>(
        heuristic.layout.fields
          .filter((field) => !field.id.startsWith("mask_"))
          .map((field) => field.id),
      );
      for (const pattern of patterns) {
        selectedIds.add(pattern.fieldId);
      }
      return selectedIds;
    }

    const selectedIds = new Set<string>(heuristic.detectedIds);
    for (const pattern of patterns) {
      selectedIds.add(pattern.fieldId);
    }
    return selectedIds.size > 0
      ? selectedIds
      : new Set(DEFAULT_LAYOUT.fields.map((field) => field.id));
  }

  function buildDetectionLayout(
    heuristic: TemplateFieldDetectionResult,
    patterns: DetectedField[],
    selectedIds: Set<string>,
  ): TemplateLayout {
    // Start from the heuristic layout (which has masks + text fields correctly positioned).
    // For any field that was detected ONLY by the pattern scanner (explicit placeholder text),
    // use the pattern position instead — it is more precise.
    const fields = heuristic.layout.fields.filter((f) => {
      if (f.id.startsWith("mask_")) {
        const textId = f.id.replace("mask_", "");
        return selectedIds.has(textId);
      }
      return selectedIds.has(f.id);
    });

    for (const d of patterns) {
      if (!selectedIds.has(d.fieldId)) continue;
      if (d.confidence !== "high") continue;
      const idx = fields.findIndex((f) => f.id === d.fieldId);
      if (idx >= 0) {
        fields[idx] = {
          ...fields[idx],
          x: d.x,
          y: d.y,
          w: d.w,
          h: d.h,
          ...(d.fontSize ? { fontSize: d.fontSize } : {}),
          ...(d.align ? { align: d.align } : {}),
        };

        const maskIdx = fields.findIndex((f) => f.id === `mask_${d.fieldId}`);
        if (maskIdx >= 0) {
          fields[maskIdx] = {
            ...fields[maskIdx],
            x: Math.max(0, d.x - 1),
            y: Math.max(0, d.y - 0.5),
            w: d.w + 2,
            h: d.h + 1,
          };
        }
      } else {
        const baseField =
          heuristic.layout.fields.find((f) => f.id === d.fieldId) ??
          layoutRef.current.fields.find((f) => f.id === d.fieldId) ??
          DEFAULT_LAYOUT.fields.find((f) => f.id === d.fieldId);

        fields.push({
          ...(baseField ?? {
            id: d.fieldId,
            kind: FIELD_KINDS[d.fieldId],
            visible: true,
            x: d.x,
            y: d.y,
            w: d.w,
            h: d.h,
          }),
          id: d.fieldId,
          kind: FIELD_KINDS[d.fieldId],
          visible: true,
          x: d.x,
          y: d.y,
          w: d.w,
          h: d.h,
          ...(d.fontSize ? { fontSize: d.fontSize } : {}),
          ...(d.align ? { align: d.align } : {}),
        });
      }

      if (FIELD_KINDS[d.fieldId] === "text") {
        const maskId = `mask_${d.fieldId}`;
        const maskIdx = fields.findIndex((f) => f.id === maskId);
        const nextMask = {
          id: maskId,
          label: `Cover baked ${DETECT_FIELD_LABELS[d.fieldId] ?? d.fieldId}`,
          kind: "shape" as const,
          visible: true,
          x: Math.max(0, d.x - 1),
          y: Math.max(0, d.y - 0.5),
          w: d.w + 2,
          h: d.h + 1,
          fillColor: "#ffffff",
          opacity: 1,
        };

        if (maskIdx >= 0) {
          fields[maskIdx] = {
            ...fields[maskIdx],
            ...nextMask,
          };
        } else {
          fields.unshift(nextMask);
        }
      }
    }

    return {
      ...heuristic.layout,
      fields,
    };
  }

  function applyDetectionResult(
    heuristic: TemplateFieldDetectionResult,
    patterns: DetectedField[],
    selectedIds: Set<string>,
    message = `Applied ${selectedIds.size} field${selectedIds.size === 1 ? "" : "s"} from template scan`,
  ) {
    const nextLayout = buildDetectionLayout(heuristic, patterns, selectedIds);
    const firstSelected = heuristic.detectedIds.find((id) => selectedIds.has(id));
    return applyOverlayLayout(nextLayout, message, firstSelected ?? "recipientName");
  }

  function applyDefaultFieldOverlays(message = "Editable field overlays are active now") {
    return applyOverlayLayout(buildDefaultOverlayLayout(layoutRef.current), message);
  }

  async function saveAppliedLayout(nextLayout: TemplateLayout) {
    await saveTemplateLayout(nextLayout);
    clearBrandingCache();
  }

  async function onUseStandardOverlays() {
    setDetectingFields(true);
    try {
      const nextLayout = applyDefaultFieldOverlays(
        "Standard editable overlays were added. Move them to match your uploaded template.",
      );
      await saveAppliedLayout(nextLayout);
    } catch (error: any) {
      toast.error(error.message ?? "Could not save standard overlays");
    } finally {
      setDetectingFields(false);
    }
  }

  async function onDetectExistingTemplateFields() {
    setDetectingFields(true);
    try {
      const mime = bgBlob?.type.toLowerCase() ?? "";
      const isRaster = mime.startsWith("image/") && !mime.includes("svg");

      if (!bgSvgMarkup && (!bgBlob || isRaster)) {
        // PNG/JPEG has no text data — fall back to standard overlay positions automatically
        const nextLayout = applyDefaultFieldOverlays(
          "Standard field overlays added — drag each box to match your certificate design, then Save layout.",
        );
        await saveAppliedLayout(nextLayout);
        return;
      }

      const [heuristic, patterns] = await Promise.all([
        bgSvgMarkup
          ? Promise.resolve(detectTemplateFieldsFromSvgMarkup(bgSvgMarkup, layoutRef.current))
          : detectTemplateFieldsFromPdfBlob(bgBlob!, layoutRef.current),
        bgSvgMarkup ? detectFieldsFromSvg(bgSvgMarkup) : Promise.resolve([]),
      ]);
      const detectionMessage = heuristic.usedFallback
        ? "Standard editable learner fields were added. Move them to match the uploaded certificate, then Save layout."
        : `Detected ${heuristic.detectedIds.length + patterns.length} field position${heuristic.detectedIds.length + patterns.length === 1 ? "" : "s"} from the template`;

      if (heuristic.usedFallback && patterns.length === 0) {
        // Text could not be read (outlines, empty SVG, etc.) — apply standard positions
        const nextLayout = applyDefaultFieldOverlays(
          "Could not read text from this file — standard field overlays added. Drag each box to match your design, then Save layout.",
        );
        await saveAppliedLayout(nextLayout);
        return;
      }

      const nextLayout = applyDetectionResult(
        heuristic,
        patterns,
        buildSelectedDetectionIds(heuristic, patterns),
        detectionMessage,
      );
      await saveAppliedLayout(nextLayout);
    } catch (error: any) {
      // Even on error, apply standard overlays so the user always gets something
      try {
        const nextLayout = applyDefaultFieldOverlays(
          "Standard field overlays added — drag each box to match your certificate, then Save layout.",
        );
        await saveAppliedLayout(nextLayout);
      } catch {
        toast.error(
          error.message ?? "Could not add field overlays. Try refreshing the page.",
          { duration: 7000 },
        );
      }
    } finally {
      setDetectingFields(false);
    }
  }

  async function onDetectTemplateFields() {
    if (!bgSvgMarkup && !bgBlob) {
      toast.error("Upload a certificate template first, then run field detection.");
      return;
    }

    // Raster images (PNG/JPEG) have no embedded text — pdf.js cannot extract positions from them.
    if (!bgSvgMarkup && bgBlob) {
      const mime = bgBlob.type.toLowerCase();
      const isRaster = mime.startsWith("image/") && !mime.includes("svg");
      if (isRaster) {
        toast.error(
          "PNG/JPEG has no text data. Upload SVG/PDF with live text to detect existing fields, or use Standard overlays manually.",
          { duration: 7000 },
        );
        return;
      }
    }

    setDetectingFields(true);
    try {
      // Run heuristic content analysis + (for SVG) explicit placeholder scan in parallel.
      const [heuristic, patterns] = await Promise.all([
        bgSvgMarkup
          ? Promise.resolve(detectTemplateFieldsFromSvgMarkup(bgSvgMarkup, layoutRef.current))
          : detectTemplateFieldsFromPdfBlob(bgBlob!, layoutRef.current),
        bgSvgMarkup ? detectFieldsFromSvg(bgSvgMarkup) : Promise.resolve([]),
      ]);
      const detectionMessage = heuristic.usedFallback
        ? "Standard editable learner fields were prepared. Apply them, align them to the certificate, then Save layout."
        : "Editable fields were added on top of the uploaded template";

      if (heuristic.usedFallback && patterns.length === 0) {
        setPendingDetection({ heuristic, patterns });
        toast.message(
          "Live SVG text could not be read, so standard learner fields are ready to place on top of the uploaded certificate.",
          { duration: 7000 },
        );
        return;
      }

      if (qrOnlyMode) {
        const nextLayout = applyDetectionResult(
          heuristic,
          patterns,
          buildSelectedDetectionIds(heuristic, patterns),
          detectionMessage,
        );
        await saveAppliedLayout(nextLayout);
        return;
      }

      setPendingDetection({ heuristic, patterns });
    } catch (error: any) {
      toast.error(error.message ?? "Could not detect fields from this template");
    } finally {
      setDetectingFields(false);
    }
  }

  function onApplyDetection(selectedIds: Set<string>) {
    if (!pendingDetection) return;

    const { heuristic, patterns } = pendingDetection;
    applyDetectionResult(heuristic, patterns, selectedIds);
  }

  async function onPreviewPdf() {
    toast.message("Generating preview PDF...");
    try {
      await saveTemplateLayout({
        ...layoutRef.current,
        svgBackgroundOverrides: bgSvgOverrides,
      });
      originalBgSvgOverridesRef.current = serializeSvgOverrides(bgSvgOverrides);
      clearBrandingCache();
      const { downloadCertificatePdf } = await import("@/lib/pdf");
      await downloadCertificatePdf(SAMPLE);
    } catch (e: any) {
      toast.error(e.message ?? "Preview failed");
    }
  }

  function onSvgCanvasClick(e: React.MouseEvent<HTMLDivElement>) {
    const target = e.target as Element | null;
    const svgItemEl = target?.closest?.("[data-editor-key]") as Element | null;
    if (!svgItemEl) {
      setSelected(null);
      setSelectedSvgKey(null);
      return;
    }

    const key = svgItemEl.getAttribute("data-editor-key");
    if (!key) return;
    setSelected(null);
    setSelectedSvgKey(key);
    e.stopPropagation();
  }

  if (loading)
    return <div className="text-sm text-muted-foreground">Loading template editor...</div>;

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="kicker">Template editor</p>
          <p className="text-sm text-muted-foreground max-w-2xl">
            {qrOnlyMode
              ? "Your uploaded certificate is used as the finished background. Drag or resize the QR code area only."
              : "Drag fields on the canvas. Add or delete fields in the panel. If the background is an SVG, you can also click its text and image layers to edit them here. Arrow keys nudge the selected item."}
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={undo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
          >
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={redo}
            disabled={!canRedo}
            title="Redo (Ctrl+Y)"
          >
            <Redo2 className="h-4 w-4" />
          </Button>
          <div className="w-px h-5 bg-border mx-1" />
          <Button variant="outline" size="sm" onClick={onReset}>
            <RotateCcw className="h-4 w-4 mr-1" /> Reset
          </Button>
          <Button variant="outline" size="sm" onClick={onUseQrOnlyLayout}>
            <ImageIcon className="h-4 w-4 mr-1" /> Background + QR only
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onDetectTemplateFields}
            disabled={detectingFields || (!bgSvgMarkup && !bgBlob)}
          >
            <Sparkles className="h-4 w-4 mr-1" />{" "}
            {detectingFields ? "Detecting..." : "Detect fields"}
          </Button>
          <Button variant="outline" size="sm" onClick={onPreviewPdf}>
            <Download className="h-4 w-4 mr-1" /> Save & proof PDF
          </Button>
          <Button size="sm" onClick={onSave} disabled={saving}>
            <Save className="h-4 w-4 mr-1" /> {saving ? "Saving..." : "Save layout"}
          </Button>
        </div>
      </div>

      {!bgUrl && !editableBgSvg?.markup && (
        <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground bg-muted/30">
          No certificate background uploaded yet - upload in the{" "}
          <span className="font-medium">Branding</span> tab.
        </div>
      )}

      {qrOnlyMode && bgUrl && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 text-sm text-muted-foreground bg-muted/20">
          <p>
            The uploaded template is being kept as finished artwork. The generated certificate will
            add only the QR code on top.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={onDetectExistingTemplateFields}
            disabled={detectingFields}
          >
            {detectingFields ? "Adding overlays..." : "Add field overlays"}
          </Button>
        </div>
      )}

      {!qrOnlyMode && bgUrl && !bgSvgMarkup && (
        <div className="rounded-md border p-3 text-sm text-muted-foreground bg-muted/20">
          This uploaded background is being shown as a flat preview. Click{" "}
          <span className="font-medium">Detect fields</span> to scan AI/PDF text positions and add
          editable overlays, or use <span className="font-medium">Mask box</span> plus
          <span className="font-medium"> Custom text</span> for any fields the scan misses.
        </div>
      )}

      {!qrOnlyMode && bgSvgMarkup && svgIsComplex && (
        <div className="rounded-md border border-amber-200 bg-amber-50/60 p-3 text-sm text-amber-900 space-y-1">
          <p className="font-medium">This SVG was exported with individual characters — automatic field detection cannot reassemble them.</p>
          <p>
            Use the <span className="font-medium">+ buttons</span> in the panel below to manually add each field (Recipient name, Programme, Issue date, etc.), then drag each box to sit over the matching text in your certificate artwork. Click{" "}
            <span className="font-medium">Save layout</span> when done. The system will stamp each student's real data onto those positions when generating certificates.
          </p>
        </div>
      )}

      {!qrOnlyMode && bgSvgMarkup && !svgIsComplex && !inspectSvgLayers && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground">
          <p>
            SVG background is loaded as finished artwork. This keeps large Illustrator exports
            responsive.
          </p>
          <Button variant="outline" size="sm" onClick={() => setInspectSvgLayers(true)}>
            Inspect SVG layers
          </Button>
        </div>
      )}

      {!qrOnlyMode && bgSvgMarkup && !svgIsComplex && inspectSvgLayers && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50/60 p-3 text-sm text-emerald-950">
          <p className="font-medium">
            SVG layer editing enabled. Editable layers detected: {svgEditableCount}
          </p>
          {svgEditableCount > 0 ? (
            <p className="mt-1 text-xs text-emerald-900/80">{svgPreviewLabels.join(" • ")}</p>
          ) : (
            <p className="mt-1 text-xs text-emerald-900/80">
              No editable text or image layers were detected.
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr,300px] gap-4">
        {/* Canvas */}
        <div className="rounded-lg border bg-muted/20 overflow-hidden">
          <div className="flex items-center gap-3 px-3 py-2 border-b bg-card text-xs">
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <Switch checked={snapGrid} onCheckedChange={setSnapGrid} className="scale-75" />
              <span>Snap to grid (1mm)</span>
            </label>
            <div className="flex-1" />
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                disabled={zoomIdx === 0}
                onClick={() => setZoomIdx((i) => Math.max(0, i - 1))}
              >
                <ZoomOut className="h-3.5 w-3.5" />
              </Button>
              <span className="w-12 text-center font-mono">{Math.round(zoom * 100)}%</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                disabled={zoomIdx === ZOOM_STEPS.length - 1}
                onClick={() => setZoomIdx((i) => Math.min(ZOOM_STEPS.length - 1, i + 1))}
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </Button>
            </div>
            {selected && selectedField && (
              <span className="text-muted-foreground ml-2 font-mono">
                x:{selectedField.x.toFixed(1)} y:{selectedField.y.toFixed(1)} -{" "}
                {selectedField.w.toFixed(1)}x{selectedField.h.toFixed(1)} mm
              </span>
            )}
          </div>

          <div className="p-3 overflow-auto">
            <div className="flex justify-center">
              <div
                ref={canvasRef}
                className="relative shadow-lg bg-white"
                style={{ width: canvasW, height: canvasH }}
                onMouseDown={(e) => {
                  if (e.target === e.currentTarget) {
                    setSelected(null);
                    setSelectedSvgKey(null);
                  }
                }}
              >
                {!showFlatBackground && editableBgSvg?.markup ? (
                  <div
                    ref={svgPreviewRef}
                    className="absolute inset-0 select-none"
                    onClick={onSvgCanvasClick}
                    dangerouslySetInnerHTML={{ __html: editableBgSvg.markup }}
                  />
                ) : bgUrl ? (
                  <img
                    src={bgUrl}
                    alt="Template"
                    className="absolute inset-0 h-full w-full bg-white object-contain pointer-events-none select-none"
                    draggable={false}
                  />
                ) : null}

                {selectedSvgBox ? (
                  <div
                    className="pointer-events-none absolute rounded border-2 border-sky-500 shadow-[0_0_0_9999px_rgba(14,165,233,0.05)]"
                    style={{
                      left: selectedSvgBox.left,
                      top: selectedSvgBox.top,
                      width: selectedSvgBox.width,
                      height: selectedSvgBox.height,
                    }}
                  />
                ) : null}

                {/* UNZA logo overlay (watermark) */}
                {logoOverlay.enabled && (
                  <img
                    src={unzaLogo.url}
                    alt=""
                    className="absolute pointer-events-none select-none"
                    draggable={false}
                    style={{
                      left: logoOverlay.x * effectiveScale,
                      top: logoOverlay.y * effectiveScale,
                      width: logoOverlay.w * effectiveScale,
                      height: logoOverlay.h * effectiveScale,
                      opacity: logoOverlay.opacity,
                      objectFit: "contain",
                    }}
                  />
                )}

                {layout.fields.map((f) => (
                  <FieldBox
                    key={f.id}
                    field={f}
                    scale={effectiveScale}
                    selected={selected === f.id}
                    onSelect={() => setSelected(f.id)}
                    onLiveMove={(x, y) => liveUpdateField(f.id, { x: snap(x), y: snap(y) })}
                    onLiveResize={(w, h) => liveUpdateField(f.id, { w: snap(w), h: snap(h) })}
                    onDragEnd={onFieldDragEnd}
                    sealUrl={sealUrl}
                    sig1Url={sig1Url}
                    sig2Url={sig2Url}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Side panel */}
        <ScrollArea className="rounded-lg border bg-card max-h-[82vh]">
          <div className="p-4 space-y-4">
            {!qrOnlyMode && editableBgSvg ? (
              <SvgBackgroundPanel
                dirty={bgSvgDirty}
                items={editableBgSvg.items}
                selectedKey={selectedSvgKey}
                onSelect={(key) => {
                  setSelected(null);
                  setSelectedSvgKey(key);
                }}
                onUpdate={updateBackgroundSvgItem}
                onReplaceImage={replaceBackgroundSvgImage}
              />
            ) : !qrOnlyMode && bgSvgMarkup && inspectSvgLayers ? (
              <div className="border rounded-md p-3 text-xs text-muted-foreground">
                This SVG background loaded, but no editable text or image layers were detected yet.
                That usually means the artwork was exported as outlines or unsupported SVG shapes.
              </div>
            ) : null}

            {/* Active fields */}
            <div>
              <Label className="text-xs uppercase text-muted-foreground">Active fields</Label>
              <div className="mt-2 space-y-0.5">
                {layout.fields.map((f) => (
                  <div
                    key={f.id}
                    className={`flex items-center gap-1 rounded text-xs ${
                      selected === f.id ? "bg-accent text-accent-foreground" : "hover:bg-muted"
                    }`}
                  >
                    <button
                      type="button"
                      className="flex-1 text-left px-2 py-1.5 truncate"
                      onClick={() => setSelected(f.id)}
                    >
                      {getFieldLabel(f)}
                    </button>
                    <button
                      type="button"
                      className="p-1 text-muted-foreground hover:text-foreground shrink-0"
                      title={f.visible ? "Hide" : "Show"}
                      onClick={() => updateField(f.id, { visible: !f.visible })}
                    >
                      {f.visible ? (
                        <Eye className="h-3.5 w-3.5" />
                      ) : (
                        <EyeOff className="h-3.5 w-3.5" />
                      )}
                    </button>
                    <button
                      type="button"
                      className="p-1 text-muted-foreground hover:text-destructive shrink-0"
                      title="Delete field"
                      onClick={() => deleteField(f.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Add back removed predefined fields */}
            {missingPredefined.length > 0 && (
              <div>
                <Label className="text-xs uppercase text-muted-foreground">
                  Add predefined fields
                </Label>
                <div className="mt-2 space-y-0.5">
                  {missingPredefined.map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => addPredefinedField(id)}
                      className="w-full text-left text-xs px-2 py-1.5 rounded flex items-center gap-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <Plus className="h-3 w-3 shrink-0" />
                      {FIELD_LABELS[id]}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Add custom blocks */}
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 h-7 text-xs"
                onClick={addCustomText}
              >
                <Plus className="h-3 w-3 mr-1" /> Custom text
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1 h-7 text-xs"
                onClick={addCustomImage}
              >
                <ImageIcon className="h-3 w-3 mr-1" /> Image slot
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1 h-7 text-xs"
                onClick={addCustomShape}
              >
                <Square className="h-3 w-3 mr-1" /> Mask box
              </Button>
            </div>

            {/* Logo overlay */}
            <div className="border rounded-md p-3 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">UNZA logo watermark</Label>
                <Switch
                  checked={logoOverlay.enabled}
                  onCheckedChange={(v) => updateLogoOverlay({ enabled: v })}
                />
              </div>
              {logoOverlay.enabled && (
                <>
                  <div>
                    <div className="flex justify-between">
                      <Label className="text-xs text-muted-foreground">Opacity</Label>
                      <span className="text-xs text-muted-foreground">
                        {Math.round(logoOverlay.opacity * 100)}%
                      </span>
                    </div>
                    <Slider
                      min={0.01}
                      max={1}
                      step={0.01}
                      value={[logoOverlay.opacity]}
                      onValueChange={([v]) => liveUpdateLogoOverlay({ opacity: v })}
                      onPointerUp={() => updateLogoOverlay({ opacity: logoOverlay.opacity })}
                      className="mt-1"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <NumField
                      label="X (mm)"
                      value={logoOverlay.x}
                      min={0}
                      max={A4_MM.w}
                      onChange={(v) => updateLogoOverlay({ x: v })}
                    />
                    <NumField
                      label="Y (mm)"
                      value={logoOverlay.y}
                      min={0}
                      max={A4_MM.h}
                      onChange={(v) => updateLogoOverlay({ y: v })}
                    />
                    <NumField
                      label="W (mm)"
                      value={logoOverlay.w}
                      min={10}
                      max={A4_MM.w}
                      onChange={(v) => updateLogoOverlay({ w: v })}
                    />
                    <NumField
                      label="H (mm)"
                      value={logoOverlay.h}
                      min={10}
                      max={A4_MM.h}
                      onChange={(v) => updateLogoOverlay({ h: v })}
                    />
                  </div>
                </>
              )}
            </div>

            {/* Field editor */}
            {selectedField ? (
              <FieldEditor
                field={selectedField}
                onChange={(patch) => updateField(selectedField.id, patch)}
                onDelete={() => deleteField(selectedField.id)}
                onCenterH={centerH}
                onCenterV={centerV}
              />
            ) : (
              <p className="text-xs text-muted-foreground border-t pt-3">
                Click a field on the canvas to edit it.
                <br />
                <br />
                <kbd className="px-1 rounded border text-[10px]">arrow keys</kbd> Nudge 0.5mm &nbsp;
                <kbd className="px-1 rounded border text-[10px]">Shift+arrow</kbd> 5mm &nbsp;
                <kbd className="px-1 rounded border text-[10px]">Esc</kbd> Deselect
              </p>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* ── Detection results dialog ─────────────────────────────────────── */}
      {pendingDetection && (
        <DetectFieldsDialog
          heuristic={pendingDetection.heuristic}
          patterns={pendingDetection.patterns}
          onApply={onApplyDetection}
          onCancel={() => setPendingDetection(null)}
        />
      )}
    </div>
  );
}

// ── Detection results dialog ─────────────────────────────────────────────────

const DETECT_FIELD_LABELS: Partial<Record<string, string>> = {
  recipientName:   "Recipient name",
  programme:       "Programme / course",
  issueDate:       "Issue date",
  certificateId:   "Certificate ID",
  nrcNumber:       "NRC / national ID",
  qr:              "QR code",
  seal:            "Digital seal",
  signature1Image: "Signature 1 (image)",
  signature1Name:  "Signature 1 name",
  signature1Title: "Signature 1 title",
  signature2Image: "Signature 2 (image)",
  signature2Name:  "Signature 2 name",
  signature2Title: "Signature 2 title",
};

function DetectFieldsDialog({
  heuristic,
  patterns,
  onApply,
  onCancel,
}: {
  heuristic: TemplateFieldDetectionResult;
  patterns: DetectedField[];
  onApply: (selected: Set<string>) => void;
  onCancel: () => void;
}) {
  // Build a unified list of detected field IDs with their source & confidence.
  const entries = useMemo(() => {
    const map = new Map<
      string,
      {
        label: string;
        source: "content" | "placeholder" | "standard";
        confidence: string;
        note?: string;
      }
    >();

    // 1. Heuristic content analysis (lower confidence, but broader coverage)
    if (heuristic.usedFallback) {
      for (const field of heuristic.layout.fields) {
        if (field.id.startsWith("mask_")) continue;
        map.set(field.id, {
          label: DETECT_FIELD_LABELS[field.id] ?? field.id,
          source: "standard",
          confidence: "fallback",
          note: "Standard editable overlay. The final PDF will populate this field from learner or certificate data.",
        });
      }
    } else {
      for (const id of heuristic.detectedIds) {
        if (id.startsWith("mask_")) continue;
        map.set(id, {
          label: DETECT_FIELD_LABELS[id] ?? id,
          source: "content",
          confidence: "medium",
        });
      }
    }

    // 2. Pattern-based placeholder scan (higher confidence when found)
    for (const d of patterns) {
      const existing = map.get(d.fieldId);
      if (!existing || d.confidence === "high") {
        map.set(d.fieldId, {
          label: DETECT_FIELD_LABELS[d.fieldId] ?? d.fieldId,
          source: "placeholder",
          confidence: d.confidence,
          note: `"${d.matchedText}" at x:${d.x} y:${d.y} mm`,
        });
      }
    }

    return Array.from(map.entries()).map(([id, meta]) => ({ id, ...meta }));
  }, [heuristic, patterns]);

  const [selected, setSelected] = useState<Set<string>>(() => new Set(entries.map((e) => e.id)));

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const allOn = selected.size === entries.length;
  const toggleAll = () =>
    setSelected(allOn ? new Set() : new Set(entries.map((e) => e.id)));

  const sourceLabel = heuristic.source === "svg" ? "SVG" : "PDF";

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Detected certificate fields</DialogTitle>
          <DialogDescription>
            {entries.length > 0
              ? `The ${sourceLabel} template was scanned using content analysis${patterns.length > 0 ? " and placeholder matching" : ""}. Select the fields to add as editable overlays.`
              : `No readable certificate fields were found in this ${sourceLabel} template.`}
          </DialogDescription>
        </DialogHeader>

        {entries.length > 0 ? (
          <>
            <div className="flex items-center gap-2 pb-1 border-b">
              <Checkbox
                id="detect-all"
                checked={allOn}
                onCheckedChange={toggleAll}
              />
              <label htmlFor="detect-all" className="text-xs text-muted-foreground cursor-pointer select-none">
                {allOn ? "Deselect all" : "Select all"} ({entries.length})
              </label>
            </div>

            <ScrollArea className="max-h-72">
              <div className="space-y-1 pr-2">
                {entries.map((entry) => (
                  <label
                    key={entry.id}
                    className="flex items-start gap-3 rounded-md p-2 cursor-pointer hover:bg-muted/50"
                  >
                    <Checkbox
                      checked={selected.has(entry.id)}
                      onCheckedChange={() => toggle(entry.id)}
                      className="mt-0.5 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">{entry.label}</span>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                            entry.source === "placeholder"
                              ? "bg-emerald-100 text-emerald-800"
                              : entry.source === "standard"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-sky-100 text-sky-800"
                          }`}
                        >
                          {entry.source === "placeholder"
                            ? "placeholder"
                            : entry.source === "standard"
                              ? "standard"
                              : "content"}
                        </span>
                      </div>
                      {entry.note && (
                        <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                          {entry.note}
                        </p>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            </ScrollArea>

            {heuristic.notes.length > 0 && (
              <div className="text-xs text-muted-foreground bg-muted/40 rounded-md p-2 space-y-0.5">
                {heuristic.notes.map((note, i) => (
                  <p key={i}>{note}</p>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="text-sm text-muted-foreground py-2 space-y-2">
            {heuristic.notes.length > 0 && (
              <div className="rounded-md bg-muted/40 p-2 text-xs space-y-1">
                {heuristic.notes.map((note, i) => (
                  <p key={i}>{note}</p>
                ))}
              </div>
            )}
            <p className="text-xs">
              SVG templates detect best when the editable text stays live and uses either visible
              placeholders such as <span className="font-mono">{"{{recipient_name}}"}</span> or
              layer/object names like <span className="font-mono">recipient_name</span>,
              <span className="font-mono"> programme_name</span>, and
              <span className="font-mono"> certificate_id</span>.
            </p>
            <p>For better detection, add placeholder text to your template such as:</p>
            <ul className="list-disc list-inside space-y-0.5 text-xs">
              <li><span className="font-mono">"Full Name"</span> or <span className="font-mono">"Recipient Name"</span> for the recipient</li>
              <li><span className="font-mono">"Programme"</span> or <span className="font-mono">"Course Name"</span></li>
              <li><span className="font-mono">"Issue Date"</span> or <span className="font-mono">"DD/MM/YYYY"</span></li>
              <li><span className="font-mono">"Certificate No."</span> for the certificate ID</li>
            </ul>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          {entries.length > 0 && (
            <Button onClick={() => onApply(selected)} disabled={selected.size === 0}>
              Apply {selected.size} field{selected.size === 1 ? "" : "s"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Draggable / resizable field box
const PREVIEW_TEXT: Partial<Record<string, string>> = {
  recipientName: "Jane Doe",
  programme: "Web Development Fundamentals",
  issueDate: "June 13, 2026",
  certificateId: "ID: SCM20260000001",
  nrcNumber: "NRC: 123456/78/9",
  qr: "QR",
  seal: "SEAL",
  signature1Image: "SIG 1",
  signature1Name: "Authorized Signatory",
  signature1Title: "Director",
  signature2Image: "SIG 2",
  signature2Name: "Authorized Signatory",
  signature2Title: "Programme Lead",
};

function FieldBox({
  field,
  scale,
  selected,
  onSelect,
  onLiveMove,
  onLiveResize,
  onDragEnd,
  sealUrl,
  sig1Url,
  sig2Url,
}: {
  field: LayoutField;
  scale: number;
  selected: boolean;
  onSelect: () => void;
  onLiveMove: (x: number, y: number) => void;
  onLiveResize: (w: number, h: number) => void;
  onDragEnd: () => void;
  sealUrl: string | null;
  sig1Url: string | null;
  sig2Url: string | null;
}) {
  const dragState = useRef<{
    kind: "move" | "resize";
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    origW: number;
    origH: number;
  } | null>(null);

  function onMouseDown(e: React.MouseEvent, kind: "move" | "resize") {
    e.stopPropagation();
    e.preventDefault();
    onSelect();
    dragState.current = {
      kind,
      startX: e.clientX,
      startY: e.clientY,
      origX: field.x,
      origY: field.y,
      origW: field.w,
      origH: field.h,
    };
    function onMouseMove(ev: MouseEvent) {
      const s = dragState.current;
      if (!s) return;
      const dxMm = (ev.clientX - s.startX) / scale;
      const dyMm = (ev.clientY - s.startY) / scale;
      if (s.kind === "move") {
        onLiveMove(
          Math.max(0, Math.min(A4_MM.w - field.w, s.origX + dxMm)),
          Math.max(0, Math.min(A4_MM.h - field.h, s.origY + dyMm)),
        );
      } else {
        onLiveResize(
          Math.max(5, Math.min(A4_MM.w - field.x, s.origW + dxMm)),
          Math.max(3, Math.min(A4_MM.h - field.y, s.origH + dyMm)),
        );
      }
    }
    function onMouseUp() {
      dragState.current = null;
      onDragEnd();
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  const left = field.x * scale;
  const top = field.y * scale;
  const w = field.w * scale;
  const h = field.h * scale;

  const isImage = field.kind === "image";
  const isShape = field.kind === "shape";
  const imgSrc =
    field.id === "seal"
      ? sealUrl
      : field.id === "signature1Image"
        ? sig1Url
        : field.id === "signature2Image"
          ? sig2Url
          : null;

  const previewLabel = getFieldLabel(field);
  const rawPreview = field.staticText ?? PREVIEW_TEXT[field.id] ?? previewLabel;

  function applyTransform(text: string) {
    if (field.textTransform === "uppercase") return text.toUpperCase();
    if (field.textTransform === "lowercase") return text.toLowerCase();
    return text;
  }

  return (
    <div
      onMouseDown={(e) => onMouseDown(e, "move")}
      className={`absolute cursor-move ${
        selected
          ? "ring-2 ring-accent z-10"
          : "ring-1 ring-dashed ring-foreground/20 hover:ring-foreground/50"
      }`}
      style={{
        left,
        top,
        width: w,
        height: h,
        opacity: field.visible ? (field.opacity ?? 1) : 0.25,
      }}
      title={previewLabel}
    >
      {isImage ? (
        imgSrc ? (
          <img
            src={imgSrc}
            alt=""
            className="w-full h-full object-contain pointer-events-none select-none"
            draggable={false}
          />
        ) : (
          <div className="w-full h-full bg-accent/10 border border-accent/40 flex items-center justify-center text-[9px] text-accent font-medium uppercase pointer-events-none">
            {PREVIEW_TEXT[field.id] ?? field.label ?? "Image"}
          </div>
        )
      ) : isShape ? (
        <div
          className="w-full h-full pointer-events-none border border-foreground/10"
          style={{ backgroundColor: field.fillColor ?? "#ffffff" }}
        />
      ) : (
        <div
          className="w-full h-full flex items-center pointer-events-none overflow-hidden"
          style={{
            color: field.color ?? "#282828",
            fontFamily: getCssFontFamily(field.fontFamily ?? "helvetica"),
            fontWeight: field.fontStyle === "bold" || field.fontStyle === "bolditalic" ? 700 : 400,
            fontStyle:
              field.fontStyle === "italic" || field.fontStyle === "bolditalic"
                ? "italic"
                : "normal",
            fontSize: Math.max(8, (field.fontSize ?? 11) * ptToPx(scale)),
            letterSpacing: field.letterSpacing ? `${field.letterSpacing * 0.1}em` : undefined,
            textTransform:
              field.textTransform && field.textTransform !== "none"
                ? field.textTransform
                : undefined,
            justifyContent:
              field.align === "center"
                ? "center"
                : field.align === "right"
                  ? "flex-end"
                  : "flex-start",
            lineHeight: 1.1,
            whiteSpace: "nowrap",
          }}
        >
          <span className="truncate">{applyTransform(rawPreview)}</span>
        </div>
      )}
      {selected && (
        <div
          onMouseDown={(e) => onMouseDown(e, "resize")}
          className="absolute -right-1.5 -bottom-1.5 w-3.5 h-3.5 bg-accent border-2 border-background rounded-sm cursor-nwse-resize z-10"
        />
      )}
    </div>
  );
}

// 1pt ~= 0.353mm; scale is px/mm -> multiply to get px/pt
function ptToPx(scalePxPerMm: number) {
  return scalePxPerMm * 0.353;
}

// Right-panel field editor
function FieldEditor({
  field,
  onChange,
  onDelete,
  onCenterH,
  onCenterV,
}: {
  field: LayoutField;
  onChange: (patch: Partial<LayoutField>) => void;
  onDelete: () => void;
  onCenterH: () => void;
  onCenterV: () => void;
}) {
  const isText = field.kind === "text";
  const isShape = field.kind === "shape";
  const isCustom = !isPredefined(field.id);

  return (
    <div className="space-y-3 border-t pt-3">
      <div className="flex items-center justify-between">
        <Label className="text-xs uppercase text-muted-foreground font-semibold truncate pr-2">
          {getFieldLabel(field)}
        </Label>
        <div className="flex items-center gap-2 shrink-0">
          <Label htmlFor={`vis-${field.id}`} className="text-xs">
            Visible
          </Label>
          <Switch
            id={`vis-${field.id}`}
            checked={field.visible}
            onCheckedChange={(v) => onChange({ visible: v })}
          />
          <button
            type="button"
            onClick={onDelete}
            className="p-1 text-muted-foreground hover:text-destructive"
            title="Delete field"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Editable label for custom fields */}
      {isCustom && (
        <div>
          <Label className="text-xs">Label</Label>
          <Input
            value={field.label ?? ""}
            onChange={(e) => onChange({ label: e.target.value || undefined })}
            placeholder="Field name"
            className="h-8 text-xs mt-1"
          />
        </div>
      )}

      {/* Static text for custom text blocks */}
      {isCustom && isText && (
        <div>
          <Label className="text-xs">Static text</Label>
          <Input
            value={field.staticText ?? ""}
            onChange={(e) => onChange({ staticText: e.target.value })}
            placeholder="Text to render on certificate"
            className="h-8 text-xs mt-1"
          />
        </div>
      )}

      {/* Quick align */}
      <div>
        <Label className="text-xs text-muted-foreground">Quick align</Label>
        <div className="mt-1 flex gap-1.5">
          <Button variant="outline" size="sm" className="flex-1 h-7 text-xs" onClick={onCenterH}>
            <AlignCenter className="h-3 w-3 mr-1" /> Center H
          </Button>
          <Button variant="outline" size="sm" className="flex-1 h-7 text-xs" onClick={onCenterV}>
            <AlignCenterHorizontal className="h-3 w-3 mr-1" /> Center V
          </Button>
        </div>
      </div>

      {/* Position & size */}
      <div className="grid grid-cols-2 gap-2">
        <NumField
          label="X (mm)"
          value={field.x}
          min={0}
          max={A4_MM.w}
          onChange={(v) => onChange({ x: v })}
        />
        <NumField
          label="Y (mm)"
          value={field.y}
          min={0}
          max={A4_MM.h}
          onChange={(v) => onChange({ y: v })}
        />
        <NumField
          label="W (mm)"
          value={field.w}
          min={5}
          max={A4_MM.w}
          onChange={(v) => onChange({ w: v })}
        />
        <NumField
          label="H (mm)"
          value={field.h}
          min={3}
          max={A4_MM.h}
          onChange={(v) => onChange({ h: v })}
        />
      </div>

      {/* Opacity */}
      <div>
        <div className="flex justify-between">
          <Label className="text-xs">Opacity</Label>
          <span className="text-xs text-muted-foreground">
            {Math.round((field.opacity ?? 1) * 100)}%
          </span>
        </div>
        <Slider
          min={0}
          max={1}
          step={0.05}
          value={[field.opacity ?? 1]}
          onValueChange={([v]) => onChange({ opacity: v })}
          className="mt-1"
        />
      </div>

      {isShape && (
        <div>
          <Label className="text-xs">Fill color</Label>
          <div className="flex items-center gap-2 mt-1">
            <Input
              type="color"
              value={field.fillColor ?? "#ffffff"}
              onChange={(e) => onChange({ fillColor: e.target.value })}
              className="h-8 w-12 p-1 cursor-pointer"
            />
            <Input
              value={field.fillColor ?? "#ffffff"}
              onChange={(e) => onChange({ fillColor: e.target.value })}
              className="h-8 text-xs font-mono"
              placeholder="#ffffff"
            />
          </div>
          <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
            Use this to cover text or logos baked into a flat AI/PDF background, then add
            replacement text above it.
          </p>
        </div>
      )}

      {/* Text-only properties */}
      {isText && (
        <>
          <div>
            <Label className="text-xs">Font family</Label>
            <Select
              value={field.fontFamily ?? "helvetica"}
              onValueChange={(v) => onChange({ fontFamily: v as any })}
            >
              <SelectTrigger className="h-8 text-xs mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FONTS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Style</Label>
              <Select
                value={field.fontStyle ?? "normal"}
                onValueChange={(v) => onChange({ fontStyle: v as any })}
              >
                <SelectTrigger className="h-8 text-xs mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STYLES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Alignment</Label>
              <Select
                value={field.align ?? "left"}
                onValueChange={(v) => onChange({ align: v as any })}
              >
                <SelectTrigger className="h-8 text-xs mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALIGNS.map((a) => (
                    <SelectItem key={a.value} value={a.value}>
                      {a.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-xs">Text transform</Label>
            <Select
              value={field.textTransform ?? "none"}
              onValueChange={(v) => onChange({ textTransform: v as any })}
            >
              <SelectTrigger className="h-8 text-xs mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRANSFORMS.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <div className="flex justify-between">
              <Label className="text-xs">Font size</Label>
              <span className="text-xs text-muted-foreground">{field.fontSize ?? 11}pt</span>
            </div>
            <Slider
              min={6}
              max={72}
              step={1}
              value={[field.fontSize ?? 11]}
              onValueChange={([v]) => onChange({ fontSize: v })}
              className="mt-1"
            />
          </div>

          <div>
            <div className="flex justify-between">
              <Label className="text-xs">Letter spacing</Label>
              <span className="text-xs text-muted-foreground">
                {(field.letterSpacing ?? 0).toFixed(1)}pt
              </span>
            </div>
            <Slider
              min={-2}
              max={20}
              step={0.5}
              value={[field.letterSpacing ?? 0]}
              onValueChange={([v]) => onChange({ letterSpacing: v })}
              className="mt-1"
            />
          </div>

          <div>
            <Label className="text-xs">Color</Label>
            <div className="flex items-center gap-2 mt-1">
              <Input
                type="color"
                value={field.color ?? "#282828"}
                onChange={(e) => onChange({ color: e.target.value })}
                className="h-8 w-12 p-1 cursor-pointer"
              />
              <Input
                value={field.color ?? "#282828"}
                onChange={(e) => onChange({ color: e.target.value })}
                className="h-8 text-xs font-mono"
                placeholder="#000000"
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function NumField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        min={min}
        max={max}
        step={0.5}
        value={Number(value.toFixed(1))}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (!Number.isNaN(n)) onChange(Math.max(min, Math.min(max, n)));
        }}
        className="h-8 text-xs mt-1"
      />
    </div>
  );
}
