import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Save, RotateCcw, Eye, EyeOff, Download, Undo2, Redo2,
  ZoomIn, ZoomOut, AlignCenter, AlignCenterHorizontal, Trash2, Plus, Image as ImageIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";

import {
  A4_MM, DEFAULT_LAYOUT, DEFAULT_LOGO_OVERLAY, FIELD_KINDS, FIELD_LABELS,
  getFieldLabel, isPredefined,
  type FieldId, type LayoutField, type LogoOverlay, type TemplateLayout,
} from "@/lib/template-layout";
import { loadBranding, saveTemplateLayout, clearBrandingCache } from "@/lib/branding";
import { downloadCertificatePdf } from "@/lib/pdf";
import { getCssFontFamily } from "@/lib/font-loader";
import unzaLogo from "@/assets/unza-logo.png.asset.json";

const SAMPLE = {
  certificateId: "202606130000001",
  recipientName: "Jane Doe",
  programme: "Web Development Fundamentals",
  issueDate: "2026-06-13",
  nrcNumber: "123456/78/9",
};

const FONTS: { value: NonNullable<LayoutField["fontFamily"]>; label: string }[] = [
  { value: "helvetica", label: "Helvetica — sans-serif" },
  { value: "times",     label: "Times — serif" },
  { value: "courier",   label: "Courier — monospace" },
  { value: "cormorant", label: "Cormorant Garamond — elegant serif" },
  { value: "playfair",  label: "Playfair Display — formal serif" },
  { value: "manrope",   label: "Manrope — modern sans" },
  { value: "lato",      label: "Lato — clean sans" },
  { value: "cinzel",    label: "Cinzel — Roman caps" },
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
function nextCustomId() { return `custom_${++customCounter}`; }

export function TemplateEditor() {
  const [layout, setLayout] = useState<TemplateLayout>(DEFAULT_LAYOUT);
  const [bgUrl, setBgUrl] = useState<string | null>(null);
  const [sealUrl, setSealUrl] = useState<string | null>(null);
  const [sig1Url, setSig1Url] = useState<string | null>(null);
  const [sig2Url, setSig2Url] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [snapGrid, setSnapGrid] = useState(false);
  const [zoomIdx, setZoomIdx] = useState(2);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const historyRef = useRef<TemplateLayout[]>([DEFAULT_LAYOUT]);
  const histIdxRef = useRef(0);
  const layoutRef = useRef<TemplateLayout>(DEFAULT_LAYOUT);
  useEffect(() => { layoutRef.current = layout; }, [layout]);

  const canvasRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(2.1);

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

  const snap = useCallback((v: number) => snapGrid ? Math.round(v) : Math.round(v * 10) / 10, [snapGrid]);

  useEffect(() => {
    (async () => {
      try {
        const b = await loadBranding();
        const loaded = b.layout;
        historyRef.current = [loaded];
        histIdxRef.current = 0;
        layoutRef.current = loaded;
        setLayout(loaded);
        setBgUrl(b.templateBgDataUrl);
        setSealUrl(b.sealDataUrl);
        setSig1Url(b.signatureDataUrl);
        setSig2Url(b.signature2DataUrl);
        setCanUndo(false);
        setCanRedo(false);
      } catch (e: any) {
        toast.error(e.message ?? "Failed to load branding");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

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
    const newLayout = { ...current, fields: current.fields.map((f) => (f.id === id ? { ...f, ...patch } : f)) };
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
      id, label: "Custom text", kind: "text", visible: true,
      x: 20, y: 50, w: 170, h: 8,
      fontFamily: "helvetica", fontStyle: "normal", fontSize: 11,
      color: "#282828", align: "center",
      staticText: "Your custom text here",
    };
    const current = layoutRef.current;
    pushLayout({ ...current, fields: [...current.fields, newField] });
    setSelected(id);
  }

  function addCustomImage() {
    const id = nextCustomId();
    const newField: LayoutField = {
      id, label: "Custom image", kind: "image", visible: true,
      x: 80, y: 50, w: 50, h: 50,
    };
    const current = layoutRef.current;
    pushLayout({ ...current, fields: [...current.fields, newField] });
    setSelected(id);
  }

  // Logo overlay
  const logoOverlay: LogoOverlay = layout.logoOverlay ?? DEFAULT_LOGO_OVERLAY;

  function updateLogoOverlay(patch: Partial<LogoOverlay>) {
    const current = layoutRef.current;
    pushLayout({ ...current, logoOverlay: { ...(current.logoOverlay ?? DEFAULT_LOGO_OVERLAY), ...patch } });
  }

  function liveUpdateLogoOverlay(patch: Partial<LogoOverlay>) {
    setLayout((l) => {
      const n = { ...l, logoOverlay: { ...(l.logoOverlay ?? DEFAULT_LOGO_OVERLAY), ...patch } };
      layoutRef.current = n;
      return n;
    });
  }

  const selectedField = useMemo(
    () => (selected ? layout.fields.find((f) => f.id === selected) ?? null : null),
    [selected, layout]
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
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && !e.shiftKey && e.key === "z") { e.preventDefault(); undo(); return; }
      if (mod && (e.key === "y" || (e.shiftKey && e.key === "z"))) { e.preventDefault(); redo(); return; }
      if (e.key === "Escape") { setSelected(null); return; }
      if (!selected) return;
      const step = e.shiftKey ? 5 : 0.5;
      const f = layoutRef.current.fields.find((f) => f.id === selected);
      if (!f) return;
      const moves: Record<string, Partial<LayoutField>> = {
        ArrowLeft:  { x: Math.max(0, f.x - step) },
        ArrowRight: { x: Math.min(A4_MM.w - f.w, f.x + step) },
        ArrowUp:    { y: Math.max(0, f.y - step) },
        ArrowDown:  { y: Math.min(A4_MM.h - f.h, f.y + step) },
      };
      if (e.key in moves) { e.preventDefault(); updateField(selected, moves[e.key]); }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selected]);

  // Save / Reset / Preview
  async function onSave() {
    setSaving(true);
    try {
      await saveTemplateLayout(layout);
      clearBrandingCache();
      toast.success("Template layout saved");
    } catch (e: any) {
      toast.error(e.message ?? "Failed to save");
    } finally { setSaving(false); }
  }

  function onReset() {
    if (!window.confirm("Reset to the default layout? All custom fields and changes will be lost.")) return;
    pushLayout(DEFAULT_LAYOUT);
    setSelected(null);
  }

  async function onPreviewPdf() {
    toast.message("Generating preview PDF...");
    try {
      await saveTemplateLayout(layout);
      clearBrandingCache();
      await downloadCertificatePdf(SAMPLE);
    } catch (e: any) {
      toast.error(e.message ?? "Preview failed");
    }
  }

  if (loading) return <div className="text-sm text-muted-foreground">Loading template editor...</div>;

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="kicker">Template editor</p>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Drag fields on the canvas. Add or delete fields in the panel. Arrow keys nudge selected fields (Shift = 5mm).
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <Button variant="outline" size="sm" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Y)">
            <Redo2 className="h-4 w-4" />
          </Button>
          <div className="w-px h-5 bg-border mx-1" />
          <Button variant="outline" size="sm" onClick={onReset}>
            <RotateCcw className="h-4 w-4 mr-1" /> Reset
          </Button>
          <Button variant="outline" size="sm" onClick={onPreviewPdf}>
            <Download className="h-4 w-4 mr-1" /> Save & proof PDF
          </Button>
          <Button size="sm" onClick={onSave} disabled={saving}>
            <Save className="h-4 w-4 mr-1" /> {saving ? "Saving..." : "Save layout"}
          </Button>
        </div>
      </div>

      {!bgUrl && (
        <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground bg-muted/30">
          No certificate background uploaded yet - upload in the <span className="font-medium">Branding</span> tab.
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
              <Button variant="ghost" size="icon" className="h-6 w-6"
                disabled={zoomIdx === 0} onClick={() => setZoomIdx((i) => Math.max(0, i - 1))}>
                <ZoomOut className="h-3.5 w-3.5" />
              </Button>
              <span className="w-12 text-center font-mono">{Math.round(zoom * 100)}%</span>
              <Button variant="ghost" size="icon" className="h-6 w-6"
                disabled={zoomIdx === ZOOM_STEPS.length - 1}
                onClick={() => setZoomIdx((i) => Math.min(ZOOM_STEPS.length - 1, i + 1))}>
                <ZoomIn className="h-3.5 w-3.5" />
              </Button>
            </div>
            {selected && selectedField && (
              <span className="text-muted-foreground ml-2 font-mono">
                x:{selectedField.x.toFixed(1)} y:{selectedField.y.toFixed(1)} - {selectedField.w.toFixed(1)}x{selectedField.h.toFixed(1)} mm
              </span>
            )}
          </div>

          <div className="p-3 overflow-auto">
            <div className="flex justify-center">
              <div
                ref={canvasRef}
                className="relative shadow-lg bg-white"
                style={{ width: canvasW, height: canvasH }}
                onMouseDown={(e) => { if (e.target === e.currentTarget) setSelected(null); }}
              >
                {bgUrl && (
                  <img src={bgUrl} alt="Template"
                    className="absolute inset-0 w-full h-full object-fill pointer-events-none select-none"
                    draggable={false} />
                )}

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
                      {f.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
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
                <Label className="text-xs uppercase text-muted-foreground">Add predefined fields</Label>
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
            <div className="flex gap-1.5">
              <Button variant="outline" size="sm" className="flex-1 h-7 text-xs" onClick={addCustomText}>
                <Plus className="h-3 w-3 mr-1" /> Custom text
              </Button>
              <Button variant="outline" size="sm" className="flex-1 h-7 text-xs" onClick={addCustomImage}>
                <ImageIcon className="h-3 w-3 mr-1" /> Image slot
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
                      <span className="text-xs text-muted-foreground">{Math.round(logoOverlay.opacity * 100)}%</span>
                    </div>
                    <Slider
                      min={0.01} max={1} step={0.01}
                      value={[logoOverlay.opacity]}
                      onValueChange={([v]) => liveUpdateLogoOverlay({ opacity: v })}
                      onPointerUp={() => updateLogoOverlay({ opacity: logoOverlay.opacity })}
                      className="mt-1"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <NumField label="X (mm)" value={logoOverlay.x} min={0} max={A4_MM.w} onChange={(v) => updateLogoOverlay({ x: v })} />
                    <NumField label="Y (mm)" value={logoOverlay.y} min={0} max={A4_MM.h} onChange={(v) => updateLogoOverlay({ y: v })} />
                    <NumField label="W (mm)" value={logoOverlay.w} min={10} max={A4_MM.w} onChange={(v) => updateLogoOverlay({ w: v })} />
                    <NumField label="H (mm)" value={logoOverlay.h} min={10} max={A4_MM.h} onChange={(v) => updateLogoOverlay({ h: v })} />
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
                <br /><br />
                <kbd className="px-1 rounded border text-[10px]">arrow keys</kbd> Nudge 0.5mm &nbsp;
                <kbd className="px-1 rounded border text-[10px]">Shift+arrow</kbd> 5mm &nbsp;
                <kbd className="px-1 rounded border text-[10px]">Esc</kbd> Deselect
              </p>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

// Draggable / resizable field box
const PREVIEW_TEXT: Partial<Record<string, string>> = {
  recipientName:   "Jane Doe",
  programme:       "Web Development Fundamentals",
  issueDate:       "June 13, 2026",
  certificateId:   "ID: 202606130000001",
  nrcNumber:       "NRC: 123456/78/9",
  qr:              "QR",
  seal:            "SEAL",
  signature1Image: "SIG 1",
  signature1Name:  "Authorized Signatory",
  signature1Title: "Director",
  signature2Image: "SIG 2",
  signature2Name:  "Authorized Signatory",
  signature2Title: "Programme Lead",
};

function FieldBox({
  field, scale, selected, onSelect, onLiveMove, onLiveResize, onDragEnd, sealUrl, sig1Url, sig2Url,
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
    startX: number; startY: number;
    origX: number; origY: number; origW: number; origH: number;
  } | null>(null);

  function onMouseDown(e: React.MouseEvent, kind: "move" | "resize") {
    e.stopPropagation();
    e.preventDefault();
    onSelect();
    dragState.current = {
      kind, startX: e.clientX, startY: e.clientY,
      origX: field.x, origY: field.y, origW: field.w, origH: field.h,
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
  const top  = field.y * scale;
  const w    = field.w * scale;
  const h    = field.h * scale;

  const isImage = field.kind === "image";
  const imgSrc =
    field.id === "seal"            ? sealUrl :
    field.id === "signature1Image" ? sig1Url :
    field.id === "signature2Image" ? sig2Url : null;

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
        selected ? "ring-2 ring-accent z-10" : "ring-1 ring-dashed ring-foreground/20 hover:ring-foreground/50"
      }`}
      style={{ left, top, width: w, height: h, opacity: field.visible ? (field.opacity ?? 1) : 0.25 }}
      title={previewLabel}
    >
      {isImage ? (
        imgSrc ? (
          <img src={imgSrc} alt="" className="w-full h-full object-contain pointer-events-none select-none" draggable={false} />
        ) : (
          <div className="w-full h-full bg-accent/10 border border-accent/40 flex items-center justify-center text-[9px] text-accent font-medium uppercase pointer-events-none">
            {PREVIEW_TEXT[field.id] ?? field.label ?? "Image"}
          </div>
        )
      ) : (
        <div
          className="w-full h-full flex items-center pointer-events-none overflow-hidden"
          style={{
            color: field.color ?? "#282828",
            fontFamily: getCssFontFamily(field.fontFamily ?? "helvetica"),
            fontWeight: field.fontStyle === "bold" || field.fontStyle === "bolditalic" ? 700 : 400,
            fontStyle: field.fontStyle === "italic" || field.fontStyle === "bolditalic" ? "italic" : "normal",
            fontSize: Math.max(8, (field.fontSize ?? 11) * ptToPx(scale)),
            letterSpacing: field.letterSpacing ? `${field.letterSpacing * 0.1}em` : undefined,
            textTransform: (field.textTransform && field.textTransform !== "none") ? field.textTransform : undefined,
            justifyContent: field.align === "center" ? "center" : field.align === "right" ? "flex-end" : "flex-start",
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
function ptToPx(scalePxPerMm: number) { return scalePxPerMm * 0.353; }

// Right-panel field editor
function FieldEditor({
  field, onChange, onDelete, onCenterH, onCenterV,
}: {
  field: LayoutField;
  onChange: (patch: Partial<LayoutField>) => void;
  onDelete: () => void;
  onCenterH: () => void;
  onCenterV: () => void;
}) {
  const isText = field.kind === "text";
  const isCustom = !isPredefined(field.id);

  return (
    <div className="space-y-3 border-t pt-3">
      <div className="flex items-center justify-between">
        <Label className="text-xs uppercase text-muted-foreground font-semibold truncate pr-2">
          {getFieldLabel(field)}
        </Label>
        <div className="flex items-center gap-2 shrink-0">
          <Label htmlFor={`vis-${field.id}`} className="text-xs">Visible</Label>
          <Switch id={`vis-${field.id}`} checked={field.visible} onCheckedChange={(v) => onChange({ visible: v })} />
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
        <NumField label="X (mm)" value={field.x} min={0} max={A4_MM.w} onChange={(v) => onChange({ x: v })} />
        <NumField label="Y (mm)" value={field.y} min={0} max={A4_MM.h} onChange={(v) => onChange({ y: v })} />
        <NumField label="W (mm)" value={field.w} min={5} max={A4_MM.w} onChange={(v) => onChange({ w: v })} />
        <NumField label="H (mm)" value={field.h} min={3} max={A4_MM.h} onChange={(v) => onChange({ h: v })} />
      </div>

      {/* Opacity */}
      <div>
        <div className="flex justify-between">
          <Label className="text-xs">Opacity</Label>
          <span className="text-xs text-muted-foreground">{Math.round((field.opacity ?? 1) * 100)}%</span>
        </div>
        <Slider
          min={0} max={1} step={0.05}
          value={[field.opacity ?? 1]}
          onValueChange={([v]) => onChange({ opacity: v })}
          className="mt-1"
        />
      </div>

      {/* Text-only properties */}
      {isText && (
        <>
          <div>
            <Label className="text-xs">Font family</Label>
            <Select value={field.fontFamily ?? "helvetica"} onValueChange={(v) => onChange({ fontFamily: v as any })}>
              <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>{FONTS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Style</Label>
              <Select value={field.fontStyle ?? "normal"} onValueChange={(v) => onChange({ fontStyle: v as any })}>
                <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{STYLES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Alignment</Label>
              <Select value={field.align ?? "left"} onValueChange={(v) => onChange({ align: v as any })}>
                <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{ALIGNS.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-xs">Text transform</Label>
            <Select value={field.textTransform ?? "none"} onValueChange={(v) => onChange({ textTransform: v as any })}>
              <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>{TRANSFORMS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          <div>
            <div className="flex justify-between">
              <Label className="text-xs">Font size</Label>
              <span className="text-xs text-muted-foreground">{field.fontSize ?? 11}pt</span>
            </div>
            <Slider min={6} max={72} step={1}
              value={[field.fontSize ?? 11]}
              onValueChange={([v]) => onChange({ fontSize: v })}
              className="mt-1" />
          </div>

          <div>
            <div className="flex justify-between">
              <Label className="text-xs">Letter spacing</Label>
              <span className="text-xs text-muted-foreground">{(field.letterSpacing ?? 0).toFixed(1)}pt</span>
            </div>
            <Slider min={-2} max={20} step={0.5}
              value={[field.letterSpacing ?? 0]}
              onValueChange={([v]) => onChange({ letterSpacing: v })}
              className="mt-1" />
          </div>

          <div>
            <Label className="text-xs">Color</Label>
            <div className="flex items-center gap-2 mt-1">
              <Input type="color"
                value={field.color ?? "#282828"}
                onChange={(e) => onChange({ color: e.target.value })}
                className="h-8 w-12 p-1 cursor-pointer" />
              <Input
                value={field.color ?? "#282828"}
                onChange={(e) => onChange({ color: e.target.value })}
                className="h-8 text-xs font-mono"
                placeholder="#000000" />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function NumField({ label, value, min, max, onChange }: {
  label: string; value: number; min: number; max: number; onChange: (v: number) => void;
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input
        type="number" min={min} max={max} step={0.5}
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
