import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiGet, apiPut } from "@/lib/api";

interface Settings {
  org_name: string;
  org_prefix: string;
}

const EMPTY: Settings = {
  org_name: "",
  org_prefix: "",
};

export function SettingsTab() {
  const [s, setS] = useState<Settings>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await apiGet<Settings | null>("/settings");
        if (data) setS(data);
      } catch (e: any) {
        toast.error(e.message ?? "Failed to load settings");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function save() {
    setSaving(true);
    try {
      const payload = {
        ...s,
        org_prefix: (s.org_prefix || "ORG").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10) || "ORG",
      };
      await apiPut("/settings", payload);
      toast.success("Settings saved");
      setS(payload);
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    } finally { setSaving(false); }
  }

  if (loading) return <div className="text-sm text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <p className="kicker">Organization settings</p>
        <p className="text-sm text-muted-foreground">
          Used across every certificate PDF and the public verification page. Signatory names and
          per-type certificate templates now live in the{" "}
          <span className="font-medium">Branding</span> tab, since each certificate type
          (Competence, Advanced Certificate, Honours Diploma, Advanced Diploma, Professional
          Diploma) has its own independent signatories and layout.
        </p>
      </div>

      <div className="surface-panel rounded-xl p-5 space-y-4">
        <Field label="Organization name" value={s.org_name} onChange={(v) => setS({ ...s, org_name: v })} />
        <Field
          label="Default certificate ID prefix"
          hint="Used when a course has no prefix. Uppercase letters/numbers, max 10 chars."
          value={s.org_prefix}
          onChange={(v) => setS({ ...s, org_prefix: v })}
        />
      </div>

      <Button onClick={save} disabled={saving}>
        <Save className="h-4 w-4 mr-1" /> {saving ? "Saving..." : "Save settings"}
      </Button>
    </div>
  );
}

function Field({ label, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
