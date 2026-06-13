import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid } from "recharts";

type StudentRow = { id: string; category: string | null; created_at: string };
type CourseRow = { id: string; name: string; code: string | null; category: string | null };
type EnrolmentRow = { id: string; status: string | null; payment_status: string | null; fee_charged: number | null; course_id: string; created_at: string };
type CertRow = { id: string; issue_date: string | null; course_id: string | null };

export function ReportsTab() {
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [enrolments, setEnrolments] = useState<EnrolmentRow[]>([]);
  const [certs, setCerts] = useState<CertRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [s, c, e, cert] = await Promise.all([
        supabase.from("students").select("id, category, created_at"),
        supabase.from("courses").select("id, name, code, category"),
        supabase.from("enrolments").select("id, status, payment_status, fee_charged, course_id, created_at"),
        supabase.from("certificates").select("id, issue_date, course_id"),
      ]);
      if (s.error || c.error || e.error || cert.error) {
        toast.error((s.error || c.error || e.error || cert.error)!.message);
      }
      setStudents((s.data as any) ?? []);
      setCourses((c.data as any) ?? []);
      setEnrolments((e.data as any) ?? []);
      setCerts((cert.data as any) ?? []);
      setLoading(false);
    })();
  }, []);

  const kpi = useMemo(() => {
    const totalRevenue = enrolments
      .filter((x) => x.payment_status === "paid")
      .reduce((sum, x) => sum + Number(x.fee_charged ?? 0), 0);
    const pendingRevenue = enrolments
      .filter((x) => x.payment_status === "pending")
      .reduce((sum, x) => sum + Number(x.fee_charged ?? 0), 0);
    return {
      students: students.length,
      unza: students.filter((s) => s.category === "unza").length,
      nonUnza: students.filter((s) => s.category !== "unza").length,
      enrolments: enrolments.length,
      completed: enrolments.filter((e) => e.status === "completed").length,
      certificates: certs.length,
      totalRevenue,
      pendingRevenue,
    };
  }, [students, enrolments, certs]);

  const byCourse = useMemo(() => {
    const map = new Map<string, { name: string; enrolments: number; certificates: number }>();
    courses.forEach((c) => map.set(c.id, { name: c.code ?? c.name.slice(0, 20), enrolments: 0, certificates: 0 }));
    enrolments.forEach((e) => { const m = map.get(e.course_id); if (m) m.enrolments++; });
    certs.forEach((c) => { if (c.course_id) { const m = map.get(c.course_id); if (m) m.certificates++; } });
    return [...map.values()].filter((m) => m.enrolments > 0 || m.certificates > 0);
  }, [courses, enrolments, certs]);

  const monthly = useMemo(() => {
    const m = new Map<string, { month: string; certificates: number; enrolments: number }>();
    function bucket(d: string | null) { return d ? d.slice(0, 7) : null; }
    enrolments.forEach((e) => {
      const k = bucket(e.created_at); if (!k) return;
      const row = m.get(k) ?? { month: k, certificates: 0, enrolments: 0 };
      row.enrolments++; m.set(k, row);
    });
    certs.forEach((c) => {
      const k = bucket(c.issue_date); if (!k) return;
      const row = m.get(k) ?? { month: k, certificates: 0, enrolments: 0 };
      row.certificates++; m.set(k, row);
    });
    return [...m.values()].sort((a, b) => a.month.localeCompare(b.month));
  }, [enrolments, certs]);

  function exportCsv() {
    const rows = [
      ["metric", "value"],
      ["students_total", kpi.students],
      ["students_unza", kpi.unza],
      ["students_non_unza", kpi.nonUnza],
      ["enrolments_total", kpi.enrolments],
      ["enrolments_completed", kpi.completed],
      ["certificates_issued", kpi.certificates],
      ["revenue_paid", kpi.totalRevenue],
      ["revenue_pending", kpi.pendingRevenue],
      [],
      ["course", "enrolments", "certificates"],
      ...byCourse.map((c) => [c.name, c.enrolments, c.certificates]),
    ];
    const csv = rows.map((r) => r.map((v) => `"${String(v ?? "")}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reports-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <div className="text-sm text-muted-foreground">Loading reports…</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-display">Reports</h2>
          <p className="text-sm text-muted-foreground">Snapshot of students, enrolments, certificates and revenue.</p>
        </div>
        <Button variant="outline" size="sm" onClick={exportCsv}>
          <Download className="h-4 w-4 mr-1" /> Export CSV
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Students" value={kpi.students} hint={`${kpi.unza} UNZA · ${kpi.nonUnza} non-UNZA`} />
        <Kpi label="Enrolments" value={kpi.enrolments} hint={`${kpi.completed} completed`} />
        <Kpi label="Certificates" value={kpi.certificates} />
        <Kpi label="Revenue (paid)" value={kpi.totalRevenue.toLocaleString()} hint={`${kpi.pendingRevenue.toLocaleString()} pending`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Enrolments & certificates per course">
          {byCourse.length === 0 ? (
            <Empty />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={byCourse}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="name" fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip />
                <Bar dataKey="enrolments" fill="hsl(var(--primary))" />
                <Bar dataKey="certificates" fill="hsl(var(--accent))" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Activity by month">
          {monthly.length === 0 ? (
            <Empty />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="month" fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip />
                <Line type="monotone" dataKey="enrolments" stroke="hsl(var(--primary))" />
                <Line type="monotone" dataKey="certificates" stroke="hsl(var(--accent))" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-display">{value}</div>
      {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
    </div>
  );
}
function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <h3 className="text-sm font-medium mb-2">{title}</h3>
      {children}
    </div>
  );
}
function Empty() {
  return <div className="h-[260px] flex items-center justify-center text-xs text-muted-foreground">No data yet</div>;
}
