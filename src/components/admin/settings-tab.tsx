import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { clearBrandingCache } from "@/lib/branding";

interface Settings {
  org_name: string;
  org_prefix: string;
  signatory1_name: string;
  signatory1_title: string;
  signatory2_name: string;
  signatory2_title: string;
}

const EMPTY: Settings = {
  org_name: "",
  org_prefix: "",
  signatory1_name: "",
  signatory1_title: "",
  signatory2_name: "",
  signatory2_title: "",
};

export function SettingsTab() {
  const [s, setS] = useState<Settings>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from("org_settings").select("*").eq("id", true).maybeSingle();
      if (error) toast.error(error.message);
      if (data) setS(data as Settings);
      setLoading(false);
    })();
  }, []);

  async function save() {
    setSaving(true);
    try {
      const payload = {
        ...s,
        org_prefix: (s.org_prefix || "ORG").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10) || "ORG",
      };
      const { error } = await supabase.from("org_settings").update(payload).eq("id", true);
      if (error) throw error;
      clearBrandingCache();
      toast.success("Settings saved");
      setS(payload);
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    } finally { setSaving(false); }
  }

  if (loading) return <div className="text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-2xl font-display">Organization settings</h2>
        <p className="text-sm text-muted-foreground">
          Used across every certificate PDF and the public verification page.
        </p>
      </div>

      <div className="rounded-lg border bg-card p-5 space-y-4">
        <Field label="Organization name" value={s.org_name} onChange={(v) => setS({ ...s, org_name: v })} />
        <Field
          label="Default certificate ID prefix"
          hint="Used when a course has no prefix. Uppercase letters/numbers, max 10 chars."
          value={s.org_prefix}
          onChange={(v) => setS({ ...s, org_prefix: v })}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-lg border bg-card p-5 space-y-4">
          <h3 className="font-medium">Signatory #1 (left)</h3>
          <Field label="Name" value={s.signatory1_name} onChange={(v) => setS({ ...s, signatory1_name: v })} />
          <Field label="Title" value={s.signatory1_title} onChange={(v) => setS({ ...s, signatory1_title: v })} />
        </div>
        <div className="rounded-lg border bg-card p-5 space-y-4">
          <h3 className="font-medium">Signatory #2 (right)</h3>
          <Field label="Name" value={s.signatory2_name} onChange={(v) => setS({ ...s, signatory2_name: v })} />
          <Field label="Title" value={s.signatory2_title} onChange={(v) => setS({ ...s, signatory2_title: v })} />
        </div>
      </div>

      <Button onClick={save} disabled={saving}>
        <Save className="h-4 w-4 mr-1" /> {saving ? "Saving…" : "Save settings"}
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
