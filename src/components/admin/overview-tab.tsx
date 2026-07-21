import { useQuery } from "@tanstack/react-query";
import { type ComponentType } from "react";
import {
  Award,
  BookOpen,
  Clock,
  GraduationCap,
  Mail,
  ShieldCheck,
  TrendingUp,
  Users,
} from "lucide-react";

import { apiGet } from "@/lib/api";

type OverviewStats = {
  totalStudents: number;
  totalCourses: number;
  totalCertificates: number;
  enrolled: number;
  inProgress: number;
  completed: number;
  certsValid: number;
  certsSent: number;
  certsPending: number;
};

type StatCardProps = {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  hint?: string;
  accent?: boolean;
};

function StatCard({ icon: Icon, label, value, hint, accent }: StatCardProps) {
  return (
    <div className="surface-panel rounded-[1.5rem] p-5">
      <div
        className={`flex h-11 w-11 items-center justify-center rounded-2xl ${
          accent ? "bg-gold/18 text-gold" : "bg-primary/8 text-primary"
        }`}
      >
        <Icon className="h-5 w-5" />
      </div>
      <p className="mt-4 text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-3xl text-foreground">{value}</p>
      {hint && <p className="mt-2 text-sm text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Snapshot({
  label,
  value,
  note,
}: {
  label: string;
  value: number | string;
  note: string;
}) {
  return (
    <div className="rounded-[1.35rem] border border-white/14 bg-white/10 p-4 backdrop-blur-sm">
      <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/52">
        {label}
      </div>
      <div className="mt-3 text-2xl text-white">{value}</div>
      <div className="mt-1 text-sm text-white/68">{note}</div>
    </div>
  );
}

function WorkflowItem({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-[1.35rem] border border-border/70 bg-white/72 p-4 shadow-[var(--shadow-soft)]">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-2xl bg-primary/8 text-primary">
          <ShieldCheck className="h-4 w-4" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{body}</p>
        </div>
      </div>
    </div>
  );
}

export function OverviewTab() {
  const stats = useQuery({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const s = await apiGet<OverviewStats>("/reports/stats");
      return {
        students: s.totalStudents,
        courses: s.totalCourses,
        certsTotal: s.totalCertificates,
        certsValid: s.certsValid,
        certsSent: s.certsSent,
        certsPending: s.certsPending,
        inTraining: s.enrolled + s.inProgress,
        awaitingCert: s.completed,
      };
    },
  });

  const data = stats.data;
  const certsTotal = data?.certsTotal ?? 0;
  const deliveryRate =
    certsTotal > 0 ? Math.round(((data?.certsSent ?? 0) / certsTotal) * 100) : 0;
  const validityRate =
    certsTotal > 0 ? Math.round(((data?.certsValid ?? 0) / certsTotal) * 100) : 0;

  return (
    <div className="space-y-8">
      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <section
          className="relative overflow-hidden rounded-[1.9rem] px-6 py-6 text-white shadow-[var(--shadow-elegant)] sm:px-8 sm:py-8"
          style={{ background: "var(--gradient-hero)" }}
        >
          <div className="mesh-overlay absolute inset-0 opacity-35" />
          <div className="absolute -right-10 top-6 h-36 w-36 rounded-full bg-gold/14 blur-3xl" />

          <div className="relative flex h-full flex-col gap-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/52">
                  Dashboard Snapshot
                </p>
                <h2 className="mt-3 text-4xl text-white">Certificate operations at a glance</h2>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-white/70">
                  Keep an eye on student progress, certificate output, and delivery
                  performance so the pipeline stays predictable.
                </p>
              </div>
              <TrendingUp className="hidden h-16 w-16 text-white/16 sm:block" />
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <Snapshot
                label="Issued"
                value={stats.isLoading ? "--" : data?.certsTotal ?? 0}
                note="Certificates recorded in the registry"
              />
              <Snapshot
                label="Email delivery"
                value={stats.isLoading ? "--" : `${deliveryRate}%`}
                note="Certificates already sent to recipients"
              />
              <Snapshot
                label="Validity"
                value={stats.isLoading ? "--" : `${validityRate}%`}
                note="Currently active certificates in circulation"
              />
            </div>
          </div>
        </section>

        <section className="surface-panel rounded-[1.9rem] p-6 sm:p-8">
          <p className="kicker">Operator Focus</p>
          <h3 className="mt-3 text-3xl text-foreground">Keep the workflow moving</h3>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            The cleanest handoff happens when enrolments, certificate generation, and
            email delivery are reviewed together instead of one screen at a time.
          </p>

          <div className="mt-6 space-y-3">
            <WorkflowItem
              title="Review completed enrolments"
              body="Completed training should be checked promptly so eligible students do not wait for issuance."
            />
            <WorkflowItem
              title="Clear the email queue"
              body="Pending delivery can create support load even when certificates have already been generated."
            />
            <WorkflowItem
              title="Watch for mismatched branding or template changes"
              body="Template edits should be verified before large certificate batches are produced."
            />
          </div>
        </section>
      </div>

      <section>
        <div className="mb-4">
          <p className="kicker">At A Glance</p>
          <h3 className="mt-2 text-3xl text-foreground">Core registry volume</h3>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            icon={Users}
            label="Students"
            value={stats.isLoading ? "--" : data?.students ?? 0}
          />
          <StatCard
            icon={BookOpen}
            label="Courses"
            value={stats.isLoading ? "--" : data?.courses ?? 0}
          />
          <StatCard
            icon={GraduationCap}
            label="In training"
            value={stats.isLoading ? "--" : data?.inTraining ?? 0}
            hint="Enrolled and actively progressing"
          />
          <StatCard
            icon={Clock}
            label="Awaiting certificate"
            value={stats.isLoading ? "--" : data?.awaitingCert ?? 0}
            hint="Completed training, not yet certified"
          />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <section className="surface-panel rounded-[1.7rem] p-6 sm:p-8">
          <p className="kicker">Certificate Delivery</p>
          <h3 className="mt-3 text-3xl text-foreground">Registry and email status</h3>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <StatCard
              icon={Award}
              label="Issued"
              value={stats.isLoading ? "--" : data?.certsTotal ?? 0}
              accent
            />
            <StatCard
              icon={Award}
              label="Valid"
              value={stats.isLoading ? "--" : data?.certsValid ?? 0}
              accent
            />
            <StatCard
              icon={Mail}
              label="Emails sent"
              value={stats.isLoading ? "--" : data?.certsSent ?? 0}
            />
            <StatCard
              icon={Mail}
              label="Pending email"
              value={stats.isLoading ? "--" : data?.certsPending ?? 0}
              hint="Certificates generated but not yet delivered"
            />
          </div>
        </section>

        <section className="surface-panel rounded-[1.7rem] p-6 sm:p-8">
          <p className="kicker">Quick Guide</p>
          <h3 className="mt-3 text-3xl text-foreground">A clean operating rhythm</h3>
          <p className="mt-4 text-sm leading-7 text-muted-foreground">
            Use the sidebar to move from student administration to certificate delivery
            without losing context. When a student completes training, mark the enrolment
            as completed, generate the certificate, then confirm it appears correctly in
            the email queue for delivery.
          </p>
          <div className="mt-6 rounded-[1.35rem] border border-border/70 bg-white/72 p-5 shadow-[var(--shadow-soft)]">
            <p className="text-sm font-semibold text-foreground">Recommended sequence</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Students and enrolments first, certificates second, outbound email last.
              That sequence reduces rework and keeps the registry aligned with what was
              actually delivered.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
