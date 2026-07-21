import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { Download, TrendingUp, Wallet } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { apiGet } from "@/lib/api";
import { AdminPageHeader, AdminPanel, AdminStat } from "@/components/admin/admin-ui";

const ReportsCharts = lazy(() =>
  import("@/components/admin/reports-tab-charts").then((module) => ({
    default: module.ReportsCharts,
  })),
);

type StudentRow = { id: string; category: string | null; created_at: string };
type CourseRow = { id: string; name: string; code: string | null; category: string | null };
type EnrolmentRow = {
  id: string;
  status: string | null;
  payment_status: string | null;
  fee_charged: number | null;
  course: { id: string } | null;
  created_at: string;
};
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
      try {
        const [studentData, courseData, enrolmentData, certData] = await Promise.all([
          apiGet<StudentRow[]>("/students"),
          apiGet<CourseRow[]>("/courses"),
          apiGet<EnrolmentRow[]>("/enrolments"),
          apiGet<CertRow[]>("/certificates"),
        ]);
        setStudents(studentData ?? []);
        setCourses(courseData ?? []);
        setEnrolments(enrolmentData ?? []);
        setCerts(certData ?? []);
      } catch (error: any) {
        toast.error(error.message ?? "Failed to load reports");
      } finally {
        setLoading(false);
      }
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
    const map = new Map<string, { name: string; enrolments: number; certificates: number }>();

    courses.forEach((course) => {
      map.set(course.id, {
        name: course.code ?? course.name.slice(0, 20),
        enrolments: 0,
        certificates: 0,
      });
    });

    enrolments.forEach((row) => {
      if (!row.course?.id) return;
      const course = map.get(row.course.id);
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

    return [...map.values()].filter((course) => course.enrolments > 0 || course.certificates > 0);
  }, [courses, enrolments, certs]);

  const monthly = useMemo(() => {
    const map = new Map<string, { month: string; certificates: number; enrolments: number }>();

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

    return [...map.values()].sort((left, right) => left.month.localeCompare(right.month));
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
      ...byCourse.map((course) => [course.name, course.enrolments, course.certificates]),
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
        <Suspense fallback={<ChartsLoadingState />}>
          <ReportsCharts monthly={monthly} byCourse={byCourse} />
        </Suspense>

        <AdminPanel className="p-6 sm:p-7">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/8 text-primary">
              <Wallet className="h-5 w-5" />
            </div>
            <div>
              <p className="kicker">Commercial Snapshot</p>
              <h3 className="mt-2 text-3xl text-foreground">Revenue posture</h3>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                Paid revenue reflects confirmed collections, while pending revenue highlights cash
                still tied up in incomplete payment follow-up.
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
    </div>
  );
}

function ChartsLoadingState() {
  return (
    <AdminPanel className="p-6 sm:p-7">
      <div className="max-w-2xl">
        <p className="kicker">Report View</p>
        <h3 className="mt-2 text-2xl text-foreground">Loading charts</h3>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">
          We are preparing the activity and course visuals for this reporting view.
        </p>
      </div>
      <div className="mt-6 h-[320px] rounded-[1.35rem] border border-border/70 bg-muted/30" />
    </AdminPanel>
  );
}
