import { useQuery } from "@tanstack/react-query";
import { Users, GraduationCap, Award, Mail, Clock, BookOpen } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

function StatCard({ icon: Icon, label, value, hint }: { icon: any; label: string; value: number | string; hint?: string }) {
  return (
    <div className="rounded-lg border bg-card p-5">
      <div className="flex items-center gap-2 text-muted-foreground text-sm">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <div className="mt-2 text-3xl font-display">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

export function OverviewTab() {
  const stats = useQuery({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const [students, courses, certs, enrols] = await Promise.all([
        supabase.from("students").select("id", { count: "exact", head: true }),
        supabase.from("courses").select("id", { count: "exact", head: true }),
        supabase.from("certificates").select("id, status, email_status", { count: "exact" }),
        supabase.from("enrolments").select("id, status", { count: "exact" }),
      ]);
      const certData = certs.data ?? [];
      const enrolData = enrols.data ?? [];
      return {
        students: students.count ?? 0,
        courses: courses.count ?? 0,
        certsTotal: certs.count ?? 0,
        certsValid: certData.filter((c: any) => c.status === "valid").length,
        certsSent: certData.filter((c: any) => c.email_status === "sent").length,
        certsPending: certData.filter((c: any) => c.email_status === "not_sent").length,
        inTraining: enrolData.filter((e: any) => e.status === "in_progress" || e.status === "enrolled").length,
        awaitingCert: enrolData.filter((e: any) => e.status === "completed").length,
      };
    },
  });

  const d = stats.data;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Users} label="Students" value={d?.students ?? "—"} />
        <StatCard icon={BookOpen} label="Courses" value={d?.courses ?? "—"} />
        <StatCard icon={GraduationCap} label="In training" value={d?.inTraining ?? "—"} hint="enrolled + in progress" />
        <StatCard icon={Clock} label="Awaiting certificate" value={d?.awaitingCert ?? "—"} hint="completed, not yet certified" />
        <StatCard icon={Award} label="Certificates issued" value={d?.certsTotal ?? "—"} />
        <StatCard icon={Award} label="Valid" value={d?.certsValid ?? "—"} />
        <StatCard icon={Mail} label="Emails sent" value={d?.certsSent ?? "—"} />
        <StatCard icon={Mail} label="Pending email" value={d?.certsPending ?? "—"} />
      </div>
      <div className="rounded-lg border bg-card p-5 text-sm text-muted-foreground">
        Use the tabs above to manage students, courses, enrolments, and certificates. Once a student completes training, mark
        their enrolment as <strong>Completed</strong> and click <strong>Generate certificate</strong> — it will create a
        unique ID using the course prefix, save the PDF, and let you email it to the student.
      </div>
    </div>
  );
}
