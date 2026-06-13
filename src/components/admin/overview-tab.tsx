import { useQuery } from "@tanstack/react-query";
import { Users, GraduationCap, Award, Mail, Clock, BookOpen, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type StatCardProps = {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  hint?: string;
  accent?: boolean;
};

function StatCard({ icon: Icon, label, value, hint, accent }: StatCardProps) {
  return (
    <div className={`rounded-xl border bg-card p-5 flex flex-col gap-3 shadow-sm ${accent ? "border-gold/40" : ""}`}>
      <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${accent ? "bg-gold/15 text-gold" : "bg-muted text-muted-foreground"}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-3xl font-display mt-0.5">{value}</p>
        {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
      </div>
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
    <div className="space-y-8">
      {/* Welcome banner */}
      <div
        className="rounded-xl p-6 text-white relative overflow-hidden"
        style={{ background: "var(--navy)" }}
      >
        <div className="absolute inset-0 opacity-[0.04]" style={{
          backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
          backgroundSize: "24px 24px",
        }} />
        <div className="relative">
          <p className="text-xs font-semibold uppercase tracking-widest text-white/50 mb-1">Dashboard</p>
          <h2 className="font-display text-2xl text-white mb-1">Welcome back</h2>
          <p className="text-sm text-white/60">
            University of Zambia · Technology e-Learning Services
          </p>
        </div>
        <div className="absolute right-6 top-1/2 -translate-y-1/2 opacity-10">
          <TrendingUp className="h-20 w-20" />
        </div>
      </div>

      {/* Primary stats */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">At a glance</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={Users}        label="Students"              value={d?.students ?? "—"} />
          <StatCard icon={BookOpen}     label="Courses"               value={d?.courses ?? "—"} />
          <StatCard icon={GraduationCap} label="In training"          value={d?.inTraining ?? "—"} hint="enrolled + in progress" />
          <StatCard icon={Clock}        label="Awaiting certificate"  value={d?.awaitingCert ?? "—"} hint="completed, not yet certified" />
        </div>
      </div>

      {/* Certificate stats */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Certificates</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={Award} label="Issued"        value={d?.certsTotal ?? "—"} accent />
          <StatCard icon={Award} label="Valid"          value={d?.certsValid ?? "—"} accent />
          <StatCard icon={Mail}  label="Emails sent"   value={d?.certsSent ?? "—"} />
          <StatCard icon={Mail}  label="Pending email" value={d?.certsPending ?? "—"} />
        </div>
      </div>

      {/* Quick guide */}
      <div className="rounded-xl border bg-card p-5">
        <p className="text-sm font-semibold mb-2">Quick guide</p>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Use the sidebar to manage students, courses, enrolments, and certificates. Once a student
          completes training, mark their enrolment as <strong className="text-foreground">Completed</strong> then
          click <strong className="text-foreground">Generate certificate</strong> — it creates a unique
          code using the course prefix, saves the PDF to storage, and lets you email it directly
          from the <strong className="text-foreground">Email queue</strong> section.
        </p>
      </div>
    </div>
  );
}
