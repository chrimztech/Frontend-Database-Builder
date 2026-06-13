import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Trash2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  SEAL_PATH, SIGNATURE_PATH, SIGNATURE2_PATH, TEMPLATE_BG_PATH,
  uploadBrandingFile, deleteBrandingFile, getBrandingSignedUrl, clearBrandingCache,
} from "@/lib/branding";
import { TemplateEditor } from "@/components/admin/template-editor";

const SLOTS: { path: string; label: string; description: string; recommend: string }[] = [
  {
    path: TEMPLATE_BG_PATH,
    label: "Certificate background (optional)",
    description: "Your existing certificate design used as the full-page background. Portrait A4 recommended.",
    recommend: "PNG/JPG · portrait · ~1191×1684 px",
  },
  {
    path: SEAL_PATH,
    label: "Digital seal",
    description: "Embossed seal or stamp centered above the signatures. Use a PNG with transparent background.",
    recommend: "PNG with transparency · ~600×600 px",
  },
  {
    path: SIGNATURE_PATH,
    label: "Signature #1 (left)",
    description: "Scanned signature for the first signatory (e.g. Director).",
    recommend: "PNG with transparency · ~800×280 px",
  },
  {
    path: SIGNATURE2_PATH,
    label: "Signature #2 (right)",
    description: "Scanned signature for the second signatory (e.g. Programme Lead).",
    recommend: "PNG with transparency · ~800×280 px",
  },
];

export function BrandingTab() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-display">Certificate branding</h2>
        <p className="text-sm text-muted-foreground">
          Upload your certificate background, digital seal, and two signature images. Edit the signatory
          names and titles from the <span className="font-medium">Settings</span> tab.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {SLOTS.map((slot) => (
          <BrandingSlot key={slot.path} {...slot} />
        ))}
      </div>

      <div className="pt-6 border-t">
        <TemplateEditor />
      </div>
    </div>
  );
}

function BrandingSlot({ path, label, description, recommend }: { path: string; label: string; description: string; recommend: string }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [stamp, setStamp] = useState(0);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    getBrandingSignedUrl(path).then((url) => {
      if (!cancel) { setPreviewUrl(url); setLoading(false); }
    });
    return () => { cancel = true; };
  }, [path, stamp]);

  async function onPick(file: File | null) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return toast.error("File too large (max 5 MB)");
    setBusy(true);
    try {
      await uploadBrandingFile(path, file);
      toast.success(`${label} uploaded`);
      setStamp((s) => s + 1);
    } catch (e: any) {
      toast.error(e.message ?? "Upload failed");
    } finally { setBusy(false); }
  }

  async function onRemove() {
    if (!window.confirm(`Remove ${label.toLowerCase()}?`)) return;
    setBusy(true);
    try {
      await deleteBrandingFile(path);
      setPreviewUrl(null);
      clearBrandingCache();
      toast.success("Removed");
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    } finally { setBusy(false); }
  }

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div>
        <Label className="text-base">{label}</Label>
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
        <p className="text-xs text-muted-foreground mt-1 italic">{recommend}</p>
      </div>

      <div className="aspect-video rounded-md border bg-muted/30 flex items-center justify-center overflow-hidden">
        {loading ? (
          <span className="text-xs text-muted-foreground">Loading…</span>
        ) : previewUrl ? (
          <img src={previewUrl} alt={label} className="max-h-full max-w-full object-contain" />
        ) : (
          <span className="text-xs text-muted-foreground">Not uploaded</span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Input
          type="file"
          accept="image/png,image/jpeg,image/jpg"
          disabled={busy}
          onChange={(e) => onPick(e.target.files?.[0] ?? null)}
          className="text-xs"
        />
        {previewUrl && (
          <Button variant="ghost" size="sm" onClick={onRemove} disabled={busy}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={() => setStamp((s) => s + 1)} disabled={busy} title="Refresh preview">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
