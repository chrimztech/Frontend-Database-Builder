import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Download, TrendingUp, Wallet } from "lucide-react";
import { toast } from "sonner";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  AdminEmptyState,
  AdminPageHeader,
  AdminPanel,
  AdminStat,
} from "@/components/admin/admin-ui";

type StudentRow = { id: string; category: string | null; created_at: string };
type CourseRow = { id: string; name: string; code: string | null; category: string | null };
type EnrolmentRow = {
  id: string;
  status: string | null;
  payment_status: string | null;
  fee_charged: number | null;
  course_id: string;
  created_at: string;
};
type CertRow = { id: string; issue_date: string | null; course_id: string | null };

const CHART_GRID = "color-mix(in oklab, var(--border) 68%, transparent)";
const CHART_PRIMARY = "var(--primary)";
const CHART_ACCENT = "var(--gold)";

export function ReportsTab() {
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [enrolments, setEnrolments] = useState<EnrolmentRow[]>([]);
  const [certs, setCerts] = useState<CertRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [studentResult, courseResult, enrolmentResult, certResult] =
        await Promise.all([
          supabase.from("students").select("id, category, created_at"),
          supabase.from("courses").select("id, name, code, category"),
          supabase
            .from("enrolments")
            .select("id, status, payment_status, fee_charged, course_id, created_at"),
          supabase.from("certificates").select("id, issue_date, course_id"),
        ]);

      if (
        studentResult.error ||
        courseResult.error ||
        enrolmentResult.error ||
        certResult.error
      ) {
        toast.error(
          (
            studentResult.error ||
            courseResult.error ||
            enrolmentResult.error ||
            certResult.error
          )!.message,
        );
      }

      setStudents((studentResult.data as StudentRow[]) ?? []);
      setCourses((courseResult.data as CourseRow[]) ?? []);
      setEnrolments((enrolmentResult.data as EnrolmentRow[]) ?? []);
      setCerts((certResult.data as CertRow[]) ?? []);
      setLoading(false);
    })();
  }, []);

  const kpi = useMemo(() => {
    const totalRevenue = enrolments
      .filter((row) => row.payment_status === "paid")
      .reduce((sum, row) => sum + Number(row.fee_charged ?? 0), 0);
    const pendingRevenue = enrolments
      .filter((row) => row.payment_status === "pending")
      .reduce((sum, row) => sum + Number(row.fee_charged ?? 0), 0);

    return {
      students: students.length,
      unza: students.filter((student) => student.category === "unza").length,
      nonUnza: students.filter((student) => student.category !== "unza").length,
      enrolments: enrolments.length,
      completed: enrolments.filter((row) => row.status === "completed").length,
      certificates: certs.length,
      totalRevenue,
      pendingRevenue,
    };
  }, [students, enrolments, certs]);

  const byCourse = useMemo(() => {
    const map = new Map<
      string,
      { name: string; enrolments: number; certificates: number }
    >();

    courses.forEach((course) => {
      map.set(course.id, {
        name: course.code ?? course.name.slice(0, 20),
        enrolments: 0,
        certificates: 0,
      });
    });

    enrolments.forEach((row) => {
      const course = map.get(row.course_id);
      if (course) {
        course.enrolments += 1;
      }
    });

    certs.forEach((row) => {
      if (!row.course_id) {
        return;
      }

      const course = map.get(row.course_id);
      if (course) {
        course.certificates += 1;
      }
    });

    return [...map.values()].filter(
      (course) => course.enrolments > 0 || course.certificates > 0,
    );
  }, [courses, enrolments, certs]);

  const monthly = useMemo(() => {
    const map = new Map<
      string,
      { month: string; certificates: number; enrolments: number }
    >();

    function bucket(value: string | null) {
      return value ? value.slice(0, 7) : null;
    }

    enrolments.forEach((row) => {
      const month = bucket(row.created_at);
      if (!month) {
        return;
      }

      const current = map.get(month) ?? {
        month,
        certificates: 0,
        enrolments: 0,
      };
      current.enrolments += 1;
      map.set(month, current);
    });

    certs.forEach((row) => {
      const month = bucket(row.issue_date);
      if (!month) {
        return;
      }

      const current = map.get(month) ?? {
        month,
        certificates: 0,
        enrolments: 0,
      };
      current.certificates += 1;
      map.set(month, current);
    });

    return [...map.values()].sort((left, right) =>
      left.month.localeCompare(right.month),
    );
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
      ...byCourse.map((course) => [
        course.name,
        course.enrolments,
        course.certificates,
      ]),
    ];

    const csv = rows
      .map((row) => row.map((value) => `"${String(value ?? "")}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `reports-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <AdminPanel className="p-8">
        <div className="text-sm text-muted-foreground">Loading reports...</div>
      </AdminPanel>
    );
  }

  return (
    <div className="space-y-8">
      <AdminPageHeader
        eyebrow="Insights"
        title="Operational reports"
        description="Review learner volume, course demand, certificates issued, and revenue flow across the training pipeline."
        actions={
          <Button variant="outline" onClick={exportCsv}>
            <Download className="mr-1 h-4 w-4" />
            Export CSV
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AdminStat
          label="Students"
          value={kpi.students}
          hint={`${kpi.unza} UNZA / ${kpi.nonUnza} non-UNZA`}
        />
        <AdminStat
          label="Enrolments"
          value={kpi.enrolments}
          hint={`${kpi.completed} completed and ready for next-step review`}
        />
        <AdminStat
          label="Certificates"
          value={kpi.certificates}
          hint="Issued certificate records currently in the registry"
        />
        <AdminStat
          label="Revenue"
          value={`K${kpi.totalRevenue.toLocaleString()}`}
          hint={`K${kpi.pendingRevenue.toLocaleString()} still pending`}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.06fr_0.94fr]">
        <ChartPanel
          title="Activity by month"
          description="A quick read on how enrolment intake and certificate issuance are moving over time."
        >
          {monthly.length === 0 ? (
            <AdminEmptyState
              icon={TrendingUp}
              title="No activity yet"
              description="Monthly charts will appear once enrolments and certificates start accumulating."
              className="min-h-[320px]"
            />
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={monthly} margin={{ left: 4, right: 12, top: 8 }}>
                <CartesianGrid stroke={CHART_GRID} strokeDasharray="3 3" />
                <XAxis dataKey="month" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{
                    borderRadius: "1rem",
                    border: "1px solid color-mix(in oklab, var(--border) 78%, white 22%)",
                    boxShadow: "var(--shadow-soft)",
                    background: "rgb(255 255 255 / 0.94)",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="enrolments"
                  stroke={CHART_PRIMARY}
                  strokeWidth={3}
                  dot={{ fill: CHART_PRIMARY, strokeWidth: 0, r: 3 }}
                />
                <Line
                  type="monotone"
                  dataKey="certificates"
                  stroke={CHART_ACCENT}
                  strokeWidth={3}
                  dot={{ fill: CHART_ACCENT, strokeWidth: 0, r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartPanel>

        <AdminPanel className="p-6 sm:p-7">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/8 text-primary">
              <Wallet className="h-5 w-5" />
            </div>
            <div>
              <p className="kicker">Commercial Snapshot</p>
              <h3 className="mt-2 text-3xl text-foreground">Revenue posture</h3>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                Paid revenue reflects confirmed collections, while pending revenue
                highlights cash still tied up in incomplete payment follow-up.
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <AdminStat
              label="Paid"
              value={`K${kpi.totalRevenue.toLocaleString()}`}
              hint="Revenue from enrolments marked as paid"
            />
            <AdminStat
              label="Pending"
              value={`K${kpi.pendingRevenue.toLocaleString()}`}
              hint="Potential revenue still awaiting settlement"
            />
          </div>
        </AdminPanel>
      </div>

      <ChartPanel
        title="Enrolments and certificates by course"
        description="Use this view to spot courses with strong intake, low completion flow, or high certificate output."
      >
        {byCourse.length === 0 ? (
          <AdminEmptyState
            title="No course activity yet"
            description="Course-level reporting will appear after enrolments or certificates are recorded."
            className="min-h-[320px]"
          />
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={byCourse} margin={{ left: 4, right: 12, top: 8 }}>
              <CartesianGrid stroke={CHART_GRID} strokeDasharray="3 3" />
              <XAxis dataKey="name" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{
                  borderRadius: "1rem",
                  border: "1px solid color-mix(in oklab, var(--border) 78%, white 22%)",
                  boxShadow: "var(--shadow-soft)",
                  background: "rgb(255 255 255 / 0.94)",
                }}
              />
              <Bar dataKey="enrolments" fill={CHART_PRIMARY} radius={[8, 8, 0, 0]} />
              <Bar dataKey="certificates" fill={CHART_ACCENT} radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartPanel>
    </div>
  );
}

function ChartPanel({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <AdminPanel className="p-6 sm:p-7">
      <div className="max-w-2xl">
        <p className="kicker">Report View</p>
        <h3 className="mt-2 text-2xl text-foreground">{title}</h3>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">{description}</p>
      </div>
      <div className="mt-6">{children}</div>
    </AdminPanel>
  );
}
