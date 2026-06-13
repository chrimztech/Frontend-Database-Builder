import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Save, RotateCcw, Eye, EyeOff, Download } from "lucide-react";

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
  A4_MM, DEFAULT_LAYOUT, FIELD_LABELS, type FieldId, type LayoutField, type TemplateLayout,
} from "@/lib/template-layout";
import { loadBranding, saveTemplateLayout, clearBrandingCache } from "@/lib/branding";
import { downloadCertificatePdf } from "@/lib/pdf";

// Sample values used in the preview / proof PDF.
const SAMPLE = {
  certificateId: "WEB-2026-0001",
  recipientName: "Jane Doe",
  programme: "Web Development Fundamentals",
  issueDate: "2026-06-13",
};

const FONTS: { value: NonNullable<LayoutField["fontFamily"]>; label: string }[] = [
  { value: "helvetica", label: "Helvetica (sans-serif)" },
  { value: "times", label: "Times (serif)" },
  { value: "courier", label: "Courier (monospace)" },
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

export function TemplateEditor() {
  const [layout, setLayout] = useState<TemplateLayout>(DEFAULT_LAYOUT);
  const [bgUrl, setBgUrl] = useState<string | null>(null);
  const [sealUrl, setSealUrl] = useState<string | null>(null);
  const [sig1Url, setSig1Url] = useState<string | null>(null);
  const [sig2Url, setSig2Url] = useState<string | null>(null);
  const [selected, setSelected] = useState<FieldId | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // Load current layout + branding once.
  useEffect(() => {
    (async () => {
      try {
        const b = await loadBranding();
        setLayout(b.layout);
        setBgUrl(b.templateBgDataUrl);
        setSealUrl(b.sealDataUrl);
        setSig1Url(b.signatureDataUrl);
        setSig2Url(b.signature2DataUrl);
      } catch (e: any) {
        toast.error(e.message ?? "Failed to load branding");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const canvasRef = useRef<HTMLDivElement>(null);
  // Render scale: px per mm (canvas is ~440 × 622 px on desktop)
  const [scale, setScale] = useState(2.1);

  // Recompute scale on resize so canvas fits its container.
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

  const canvasW = A4_MM.w * scale;
  const canvasH = A4_MM.h * scale;

  function updateField(id: FieldId, patch: Partial<LayoutField>) {
    setLayout((l) => ({
      ...l,
      fields: l.fields.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    }));
  }

  const selectedField = useMemo(
    () => (selected ? layout.fields.find((f) => f.id === selected) ?? null : null),
    [selected, layout]
  );

  async function onSave() {
    setSaving(true);
    try {
      await saveTemplateLayout(layout);
      clearBrandingCache();
      toast.success("Template layout saved");
    } catch (e: any) {
      toast.error(e.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  function onReset() {
    if (!window.confirm("Reset to the default layout? This won't be saved until you click Save.")) return;
    setLayout(DEFAULT_LAYOUT);
  }

  async function onPreviewPdf() {
    // Use the in-memory layout for preview by temporarily saving — but we don't want to persist.
    // Instead, write to org_settings only on Save; here we render with whatever's currently saved
    // PLUS we feed jsPDF a temporary override by stuffing layout into the cache.
    toast.message("Generating preview PDF…");
    // Quickest approach: persist a "preview" by saving, but that mutates state. Just save then download.
    try {
      await saveTemplateLayout(layout);
      clearBrandingCache();
      await downloadCertificatePdf(SAMPLE);
    } catch (e: any) {
      toast.error(e.message ?? "Preview failed");
    }
  }

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading template editor…</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-display">Template editor</h2>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Drag each field onto your uploaded certificate template. Click a field to adjust font, size,
            color, and alignment in the right panel. Saved positions are used for every generated certificate.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onReset}>
            <RotateCcw className="h-4 w-4 mr-1" /> Reset
          </Button>
          <Button variant="outline" size="sm" onClick={onPreviewPdf}>
            <Download className="h-4 w-4 mr-1" /> Save & download proof
          </Button>
          <Button size="sm" onClick={onSave} disabled={saving}>
            <Save className="h-4 w-4 mr-1" /> {saving ? "Saving…" : "Save layout"}
          </Button>
        </div>
      </div>

      {!bgUrl && (
        <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground bg-muted/30">
          No certificate background uploaded yet — fields show on a blank page.
          Upload your template image in the <span className="font-medium">Branding</span> section above.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr,320px] gap-4">
        {/* Canvas */}
        <div className="rounded-lg border bg-muted/20 p-3 overflow-auto">
          <div className="flex justify-center">
            <div
              ref={canvasRef}
              className="relative shadow-lg bg-white"
              style={{ width: canvasW, height: canvasH }}
              onMouseDown={(e) => { if (e.target === e.currentTarget) setSelected(null); }}
            >
              {bgUrl && (
                <img
                  src={bgUrl}
                  alt="Template"
                  className="absolute inset-0 w-full h-full object-fill pointer-events-none select-none"
                  draggable={false}
                />
              )}
              {layout.fields.map((f) => (
                <FieldBox
                  key={f.id}
                  field={f}
                  scale={scale}
                  selected={selected === f.id}
                  onSelect={() => setSelected(f.id)}
                  onMove={(x, y) => updateField(f.id, { x, y })}
                  onResize={(w, h) => updateField(f.id, { w, h })}
                  sealUrl={sealUrl}
                  sig1Url={sig1Url}
                  sig2Url={sig2Url}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Side panel */}
        <ScrollArea className="rounded-lg border bg-card max-h-[80vh]">
          <div className="p-4 space-y-4">
            <div>
              <Label className="text-xs uppercase text-muted-foreground">Fields</Label>
              <div className="mt-2 space-y-1">
                {layout.fields.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setSelected(f.id)}
                    className={`w-full text-left text-xs px-2 py-1.5 rounded flex items-center justify-between gap-2 ${
                      selected === f.id ? "bg-accent text-accent-foreground" : "hover:bg-muted"
                    }`}
                  >
                    <span className="truncate">{FIELD_LABELS[f.id]}</span>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); updateField(f.id, { visible: !f.visible }); }}
                      className="text-muted-foreground hover:text-foreground"
                      title={f.visible ? "Hide on certificate" : "Show on certificate"}
                    >
                      {f.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {selectedField ? (
              <FieldEditor
                field={selectedField}
                onChange={(patch) => updateField(selectedField.id, patch)}
              />
            ) : (
              <p className="text-xs text-muted-foreground">Click a field on the canvas or in the list to edit it.</p>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

// =========================================================================
// Draggable / resizable field on canvas
// =========================================================================
function FieldBox({
  field, scale, selected, onSelect, onMove, onResize, sealUrl, sig1Url, sig2Url,
}: {
  field: LayoutField;
  scale: number;
  selected: boolean;
  onSelect: () => void;
  onMove: (x: number, y: number) => void;
  onResize: (w: number, h: number) => void;
  sealUrl: string | null;
  sig1Url: string | null;
  sig2Url: string | null;
}) {
  const dragState = useRef<{ kind: "move" | "resize"; startX: number; startY: number; origX: number; origY: number; origW: number; origH: number } | null>(null);

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
    function onMove(ev: MouseEvent) {
      const s = dragState.current;
      if (!s) return;
      const dxMm = (ev.clientX - s.startX) / scale;
      const dyMm = (ev.clientY - s.startY) / scale;
      if (s.kind === "move") {
        const nx = Math.max(0, Math.min(A4_MM.w - field.w, s.origX + dxMm));
        const ny = Math.max(0, Math.min(A4_MM.h - field.h, s.origY + dyMm));
        onMoveCommit(nx, ny);
      } else {
        const nw = Math.max(8, Math.min(A4_MM.w - field.x, s.origW + dxMm));
        const nh = Math.max(4, Math.min(A4_MM.h - field.y, s.origH + dyMm));
        onResizeCommit(nw, nh);
      }
    }
    function onUp() {
      dragState.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }
  function onMoveCommit(x: number, y: number) { onMove(x, y); }
  function onResizeCommit(w: number, h: number) { onResize(w, h); }

  const left = field.x * scale;
  const top = field.y * scale;
  const w = field.w * scale;
  const h = field.h * scale;

  const isImage = field.kind === "image";
  const imgSrc =
    field.id === "seal" ? sealUrl :
    field.id === "signature1Image" ? sig1Url :
    field.id === "signature2Image" ? sig2Url : null;

  const previewText: Record<FieldId, string> = {
    recipientName: "Jane Doe",
    programme: "Web Development Fundamentals",
    issueDate: "June 13, 2026",
    certificateId: "ID: WEB-2026-0001",
    qr: "QR",
    seal: "SEAL",
    signature1Image: "SIG 1",
    signature1Name: "Authorized Signatory",
    signature1Title: "Director",
    signature2Image: "SIG 2",
    signature2Name: "Authorized Signatory",
    signature2Title: "Programme Lead",
  };

  return (
    <div
      onMouseDown={(e) => onMouseDown(e, "move")}
      className={`absolute cursor-move group ${
        selected ? "ring-2 ring-accent" : "ring-1 ring-dashed ring-foreground/20 hover:ring-foreground/50"
      } ${field.visible ? "" : "opacity-30"}`}
      style={{ left, top, width: w, height: h }}
      title={FIELD_LABELS[field.id]}
    >
      {isImage ? (
        imgSrc ? (
          <img src={imgSrc} alt="" className="w-full h-full object-contain pointer-events-none select-none" draggable={false} />
        ) : (
          <div className="w-full h-full bg-accent/10 border border-accent/40 flex items-center justify-center text-[9px] text-accent font-medium uppercase pointer-events-none">
            {previewText[field.id]}
          </div>
        )
      ) : (
        <div
          className="w-full h-full flex items-center pointer-events-none overflow-hidden"
          style={{
            color: field.color ?? "#282828",
            fontFamily: field.fontFamily === "times" ? "Georgia, serif" : field.fontFamily === "courier" ? "ui-monospace, monospace" : "system-ui, sans-serif",
            fontWeight: field.fontStyle === "bold" || field.fontStyle === "bolditalic" ? 700 : 400,
            fontStyle: field.fontStyle === "italic" || field.fontStyle === "bolditalic" ? "italic" : "normal",
            fontSize: Math.max(8, (field.fontSize ?? 11) * scale * 0.34),
            justifyContent: field.align === "center" ? "center" : field.align === "right" ? "flex-end" : "flex-start",
            lineHeight: 1,
            whiteSpace: "nowrap",
          }}
        >
          <span className="truncate">{previewText[field.id]}</span>
        </div>
      )}
      {selected && (
        <div
          onMouseDown={(e) => onMouseDown(e, "resize")}
          className="absolute -right-1.5 -bottom-1.5 w-3 h-3 bg-accent border border-background rounded-sm cursor-nwse-resize"
        />
      )}
    </div>
  );
}

// =========================================================================
// Right-panel field editor
// =========================================================================
function FieldEditor({ field, onChange }: { field: LayoutField; onChange: (patch: Partial<LayoutField>) => void }) {
  const isText = field.kind === "text";
  return (
    <div className="space-y-3 border-t pt-3">
      <div className="flex items-center justify-between">
        <Label className="text-xs uppercase text-muted-foreground">{FIELD_LABELS[field.id]}</Label>
        <div className="flex items-center gap-2">
          <Label htmlFor={`vis-${field.id}`} className="text-xs">Visible</Label>
          <Switch
            id={`vis-${field.id}`}
            checked={field.visible}
            onCheckedChange={(v) => onChange({ visible: v })}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <NumField label="X (mm)" value={field.x} min={0} max={A4_MM.w} onChange={(v) => onChange({ x: v })} />
        <NumField label="Y (mm)" value={field.y} min={0} max={A4_MM.h} onChange={(v) => onChange({ y: v })} />
        <NumField label="W (mm)" value={field.w} min={5} max={A4_MM.w} onChange={(v) => onChange({ w: v })} />
        <NumField label="H (mm)" value={field.h} min={3} max={A4_MM.h} onChange={(v) => onChange({ h: v })} />
      </div>

      {isText && (
        <>
          <div>
            <Label className="text-xs">Font family</Label>
            <Select value={field.fontFamily ?? "helvetica"} onValueChange={(v) => onChange({ fontFamily: v as any })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {FONTS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Style</Label>
            <Select value={field.fontStyle ?? "normal"} onValueChange={(v) => onChange({ fontStyle: v as any })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STYLES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Alignment</Label>
            <Select value={field.align ?? "left"} onValueChange={(v) => onChange({ align: v as any })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ALIGNS.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <Label className="text-xs">Font size: {field.fontSize ?? 11}pt</Label>
            </div>
            <Slider
              min={6} max={64} step={1}
              value={[field.fontSize ?? 11]}
              onValueChange={([v]) => onChange({ fontSize: v })}
            />
          </div>
          <div>
            <Label className="text-xs">Color</Label>
            <div className="flex items-center gap-2">
              <Input
                type="color"
                value={field.color ?? "#282828"}
                onChange={(e) => onChange({ color: e.target.value })}
                className="h-8 w-14 p-1"
              />
              <Input
                value={field.color ?? "#282828"}
                onChange={(e) => onChange({ color: e.target.value })}
                className="h-8 text-xs font-mono"
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function NumField({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
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
        className="h-8 text-xs"
      />
    </div>
  );
}
