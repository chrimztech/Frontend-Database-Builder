import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Download, RefreshCw } from "lucide-react";

type Row = {
  id: string;
  action: string;
  actor_id: string | null;
  actor_email: string | null;
  detail: string | null;
  created_at: string;
  student_id: string | null;
  students?: { full_name: string | null; email: string | null } | null;
};

export function AuditLogTab() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("student_access_log")
      .select("id, action, actor_id, actor_email, detail, created_at, student_id, students(full_name, email)")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) toast.error(error.message);
    setRows((data as any) ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const filtered = rows.filter((r) => {
    if (!q.trim()) return true;
    const s = q.toLowerCase();
    return (
      r.action.toLowerCase().includes(s) ||
      (r.detail ?? "").toLowerCase().includes(s) ||
      (r.students?.full_name ?? "").toLowerCase().includes(s) ||
      (r.students?.email ?? "").toLowerCase().includes(s)
    );
  });

  function exportCsv() {
    const header = ["timestamp", "action", "actor", "student_name", "student_email", "detail"];
    const lines = [header.join(",")].concat(
      filtered.map((r) =>
        [
          r.created_at,
          r.action,
          r.actor_email ?? r.actor_id ?? "",
          r.students?.full_name ?? "",
          r.students?.email ?? "",
          (r.detail ?? "").replace(/"/g, '""'),
        ]
          .map((v) => `"${String(v)}"`)
          .join(",")
      )
    );
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="kicker">Audit log</p>
          <p className="text-sm text-muted-foreground">
            Every admin action on student records - view, create, update, delete. Read-only and append-only.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search..." className="w-56" />
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="h-4 w-4 mr-1" /> Export CSV
          </Button>
        </div>
      </div>

      <div className="surface-panel rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase">
            <tr>
              <th className="text-left p-2">When</th>
              <th className="text-left p-2">Action</th>
              <th className="text-left p-2">Student</th>
              <th className="text-left p-2">Detail</th>
              <th className="text-left p-2">Actor</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Loading...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No entries yet.</td></tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="p-2 whitespace-nowrap text-xs">{new Date(r.created_at).toLocaleString()}</td>
                  <td className="p-2"><span className="rounded bg-muted px-1.5 py-0.5 text-xs">{r.action}</span></td>
                  <td className="p-2">{r.students?.full_name ?? <span className="text-muted-foreground">-</span>}</td>
                  <td className="p-2 text-xs text-muted-foreground max-w-md truncate">{r.detail}</td>
                  <td className="p-2 text-xs text-muted-foreground">
                    {r.actor_email ?? (r.actor_id ? r.actor_id.slice(0, 8) : "-")}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

