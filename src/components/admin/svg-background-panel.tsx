import { Image as ImageIcon, Type } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import type { EditableSvgItem, SvgItemPatch } from "@/lib/svg-template";

interface SvgBackgroundPanelProps {
  dirty: boolean;
  items: EditableSvgItem[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  onUpdate: (key: string, patch: SvgItemPatch) => void;
  onReplaceImage: (key: string, file: File | null) => void;
}

export function SvgBackgroundPanel({
  dirty,
  items,
  selectedKey,
  onSelect,
  onUpdate,
  onReplaceImage,
}: SvgBackgroundPanelProps) {
  if (items.length === 0) {
    return (
      <div className="border rounded-md p-3 text-xs text-muted-foreground">
        This SVG background does not expose any editable text or image layers yet.
      </div>
    );
  }

  const selectedItem = items.find((item) => item.key === selectedKey) ?? items[0] ?? null;

  return (
    <div className="border rounded-md p-3 space-y-3">
      <div>
        <div className="flex items-center justify-between gap-3">
          <Label className="text-xs font-semibold">Editable SVG background</Label>
          {dirty ? (
            <span className="text-[11px] font-medium text-amber-600">Unsaved SVG changes</span>
          ) : null}
        </div>
        <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
          Click text or image layers on the canvas, or pick them here. These SVG edits save together
          with the main template save button without replacing the original uploaded artwork.
        </p>
      </div>

      <div>
        <Label className="text-xs uppercase text-muted-foreground">Editable layers</Label>
        <div className="mt-2 space-y-1">
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => onSelect(item.key)}
              className={`w-full rounded border px-2 py-1.5 text-left text-xs ${
                selectedItem?.key === item.key
                  ? "border-accent bg-accent/10 text-foreground"
                  : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <span className="inline-flex items-center gap-2">
                {item.kind === "text" ? (
                  <Type className="h-3.5 w-3.5" />
                ) : (
                  <ImageIcon className="h-3.5 w-3.5" />
                )}
                {item.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {selectedItem ? (
        <SvgItemEditor
          item={selectedItem}
          onUpdate={(patch) => onUpdate(selectedItem.key, patch)}
          onReplaceImage={(file) => onReplaceImage(selectedItem.key, file)}
        />
      ) : null}
    </div>
  );
}

function SvgItemEditor({
  item,
  onUpdate,
  onReplaceImage,
}: {
  item: EditableSvgItem;
  onUpdate: (patch: SvgItemPatch) => void;
  onReplaceImage: (file: File | null) => void;
}) {
  const colorValue =
    item.fill && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(item.fill) ? item.fill : "#174734";

  return (
    <div className="space-y-3 border-t pt-3">
      <Label className="text-xs uppercase text-muted-foreground font-semibold truncate">
        {item.label}
      </Label>

      {item.kind === "text" ? (
        <>
          <div>
            <Label className="text-xs">Text content</Label>
            <Textarea
              value={item.text ?? ""}
              onChange={(event) => onUpdate({ text: event.target.value })}
              className="mt-1 min-h-20 text-xs"
              placeholder="Enter the text shown on the certificate background"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <NumField label="X" value={item.x} onChange={(value) => onUpdate({ x: value })} />
            <NumField label="Y" value={item.y} onChange={(value) => onUpdate({ y: value })} />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <NumField
              label="Font size"
              value={item.fontSize}
              min={1}
              onChange={(value) => onUpdate({ fontSize: value })}
            />
            <div>
              <Label className="text-xs">Fill color</Label>
              <div className="mt-1 flex items-center gap-2">
                <Input
                  type="color"
                  value={colorValue}
                  onChange={(event) => onUpdate({ fill: event.target.value })}
                  className="h-8 w-12 p-1 cursor-pointer"
                />
                <Input
                  value={item.fill ?? "#174734"}
                  onChange={(event) => onUpdate({ fill: event.target.value })}
                  className="h-8 text-xs font-mono"
                  placeholder="#174734"
                />
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          <div>
            <Label className="text-xs">Replace embedded image</Label>
            <Input
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/svg+xml,.svg"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                event.currentTarget.value = "";
                onReplaceImage(file);
              }}
              className="mt-1 text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <NumField label="X" value={item.x} onChange={(value) => onUpdate({ x: value })} />
            <NumField label="Y" value={item.y} onChange={(value) => onUpdate({ y: value })} />
            <NumField
              label="Width"
              value={item.width}
              min={1}
              onChange={(value) => onUpdate({ width: value })}
            />
            <NumField
              label="Height"
              value={item.height}
              min={1}
              onChange={(value) => onUpdate({ height: value })}
            />
          </div>
        </>
      )}

      <div>
        <div className="flex justify-between">
          <Label className="text-xs">Opacity</Label>
          <span className="text-xs text-muted-foreground">
            {Math.round((item.opacity ?? 1) * 100)}%
          </span>
        </div>
        <Slider
          min={0}
          max={1}
          step={0.05}
          value={[item.opacity ?? 1]}
          onValueChange={([value]) => onUpdate({ opacity: value })}
          className="mt-1"
        />
      </div>
    </div>
  );
}

function NumField({
  label,
  value,
  min,
  onChange,
}: {
  label: string;
  value: number | undefined;
  min?: number;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        value={value ?? ""}
        min={min}
        step={1}
        onChange={(event) => {
          const nextValue = Number(event.target.value);
          if (!Number.isNaN(nextValue)) {
            onChange(min !== undefined ? Math.max(min, nextValue) : nextValue);
          }
        }}
        className="mt-1 h-8 text-xs"
      />
    </div>
  );
}
