import { createLazyFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Suspense, lazy, useState, type ComponentType } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Award,
  BarChart2,
  BookOpen,
  ChevronRight,
  ClipboardList,
  Clock,
  FileEdit,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  Palette,
  Settings,
  ShieldCheck,
  UserCircle,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { ORG_NAME } from "@/lib/cert";
import unzaLogo from "@/assets/unza-logo.png.asset.json";
import type { SectionId } from "./admin";

const OverviewTab = lazy(() =>
  import("@/components/admin/overview-tab").then((module) => ({
    default: module.OverviewTab,
  })),
);
const StudentsTab = lazy(() =>
  import("@/components/admin/students-tab").then((module) => ({
    default: module.StudentsTab,
  })),
);
const StudentProfilesTab = lazy(() =>
  import("@/components/admin/student-profiles-tab").then((module) => ({
    default: module.StudentProfilesTab,
  })),
);
const UsersTab = lazy(() =>
  import("@/components/admin/users-tab").then((module) => ({
    default: module.UsersTab,
  })),
);
const CoursesTab = lazy(() =>
  import("@/components/admin/courses-tab").then((module) => ({
    default: module.CoursesTab,
  })),
);
const EnrolmentsTab = lazy(() =>
  import("@/components/admin/enrolments-tab").then((module) => ({
    default: module.EnrolmentsTab,
  })),
);
const CertificatesTab = lazy(() =>
  import("@/components/admin/certificates-tab").then((module) => ({
    default: module.CertificatesTab,
  })),
);
const PendingCertificatesTab = lazy(() =>
  import("@/components/admin/pending-certificates-tab").then((module) => ({
    default: module.PendingCertificatesTab,
  })),
);
const CertificateQueueTab = lazy(() =>
  import("@/components/admin/certificate-queue-tab").then((module) => ({
    default: module.CertificateQueueTab,
  })),
);
const ReportsTab = lazy(() =>
  import("@/components/admin/reports-tab").then((module) => ({
    default: module.ReportsTab,
  })),
);
const AuditLogTab = lazy(() =>
  import("@/components/admin/audit-log-tab").then((module) => ({
    default: module.AuditLogTab,
  })),
);
const BrandingTab = lazy(() =>
  import("@/components/admin/branding-tab").then((module) => ({
    default: module.BrandingTab,
  })),
);
const TemplateEditor = lazy(() =>
  import("@/components/admin/template-editor").then((module) => ({
    default: module.TemplateEditor,
  })),
);
const SettingsTab = lazy(() =>
  import("@/components/admin/settings-tab").then((module) => ({
    default: module.SettingsTab,
  })),
);

type NavItem = {
  id: SectionId;
  icon: ComponentType<{ className?: string }>;
  label: string;
};

type NavGroup = {
  label: string | null;
  items: NavItem[];
};

type SessionUser = {
  id: string;
  email?: string;
};

const NAV: NavGroup[] = [
  {
    label: null,
    items: [{ id: "overview", icon: LayoutDashboard, label: "Overview" }],
  },
  {
    label: "People",
    items: [
      { id: "students", icon: Users, label: "Students" },
      { id: "profiles", icon: UserCircle, label: "Student profiles" },
      { id: "users", icon: ShieldCheck, label: "Admin users" },
    ],
  },
  {
    label: "Training",
    items: [
      { id: "courses", icon: BookOpen, label: "Courses" },
      { id: "enrolments", icon: ClipboardList, label: "Enrolments" },
    ],
  },
  {
    label: "Certificates",
    items: [
      { id: "certificates", icon: Award, label: "Certificates" },
      { id: "pending", icon: Clock, label: "Pending" },
      { id: "email-queue", icon: Mail, label: "Email queue" },
    ],
  },
  {
    label: "Insights",
    items: [
      { id: "reports", icon: BarChart2, label: "Reports" },
      { id: "audit", icon: Activity, label: "Audit log" },
    ],
  },
  {
    label: "Configuration",
    items: [
      { id: "branding", icon: Palette, label: "Branding" },
      { id: "template", icon: FileEdit, label: "Template editor" },
      { id: "settings", icon: Settings, label: "Settings" },
    ],
  },
];

const SECTION_META: Record<SectionId, { eyebrow: string; description: string }> = {
  overview: {
    eyebrow: "Dashboard",
    description:
      "Track students, enrolments, certificate output, and delivery activity from one place.",
  },
  students: {
    eyebrow: "People",
    description: "Manage student records, identity data, and enrolment readiness.",
  },
  profiles: {
    eyebrow: "People",
    description: "Review fuller student profiles and supporting registration details.",
  },
  users: {
    eyebrow: "Security",
    description: "Control which staff members can access and operate the admin portal.",
  },
  courses: {
    eyebrow: "Training",
    description: "Define the training catalogue and certificate-ready course metadata.",
  },
  enrolments: {
    eyebrow: "Training",
    description: "Monitor enrolment progress and prepare completions for certification.",
  },
  certificates: {
    eyebrow: "Certificates",
    description: "Review issued records, certificate status, and generated outputs.",
  },
  pending: {
    eyebrow: "Certificates",
    description: "Process certificate work that still needs review or generation.",
  },
  "email-queue": {
    eyebrow: "Certificates",
    description: "Manage outbound certificate delivery and follow up on pending messages.",
  },
  reports: {
    eyebrow: "Insights",
    description: "Inspect operational summaries and reporting across the certificate workflow.",
  },
  audit: {
    eyebrow: "Insights",
    description: "Trace administrative activity and system events for accountability.",
  },
  branding: {
    eyebrow: "Configuration",
    description: "Adjust brand assets, appearance, and organisation-facing presentation.",
  },
  template: {
    eyebrow: "Configuration",
    description: "Edit the certificate template experience used for document output.",
  },
  settings: {
    eyebrow: "Configuration",
    description: "Maintain system-level defaults, behaviours, and supporting options.",
  },
};

const ALL_ITEMS = NAV.flatMap((group) => group.items);

let supabaseModulePromise: Promise<typeof import("@/integrations/supabase/client")> | null = null;

function getSupabaseClient() {
  supabaseModulePromise ??= import("@/integrations/supabase/client");
  return supabaseModulePromise;
}

export const Route = createLazyFileRoute("/_authenticated/admin")({
  component: AdminPage,
});

function getLabel(id: string) {
  return ALL_ITEMS.find((item) => item.id === id)?.label ?? id;
}

function SectionLoading({ section }: { section: SectionId }) {
  return (
    <div className="surface-panel max-w-3xl rounded-[1.5rem] px-6 py-7">
      <p className="kicker">{SECTION_META[section].eyebrow}</p>
      <h2 className="mt-3 text-xl text-foreground">Loading {getLabel(section)}</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
        {SECTION_META[section].description}
      </p>
    </div>
  );
}

function renderSection(section: SectionId) {
  switch (section) {
    case "overview":
      return <OverviewTab />;
    case "students":
      return <StudentsTab />;
    case "profiles":
      return <StudentProfilesTab />;
    case "users":
      return <UsersTab />;
    case "courses":
      return <CoursesTab />;
    case "enrolments":
      return <EnrolmentsTab />;
    case "certificates":
      return <CertificatesTab />;
    case "pending":
      return <PendingCertificatesTab />;
    case "email-queue":
      return <CertificateQueueTab />;
    case "reports":
      return <ReportsTab />;
    case "audit":
      return <AuditLogTab />;
    case "branding":
      return <BrandingTab />;
    case "template":
      return <TemplateEditor />;
    case "settings":
      return <SettingsTab />;
    default:
      return null;
  }
}

function AdminPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { section } = Route.useSearch();
  const routeContext = Route.useRouteContext() as { user?: SessionUser };
  const sessionUser = routeContext.user;
  const user: SessionUser | null = sessionUser ?? null;
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { data: isAdmin = null } = useQuery({
    queryKey: ["admin-role", sessionUser?.id],
    queryFn: async () => {
      if (!sessionUser?.id) return false;
      const { supabase } = await getSupabaseClient();
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", sessionUser.id)
        .eq("role", "admin")
        .maybeSingle();
      return Boolean(data);
    },
    enabled: !!sessionUser,
    staleTime: 5 * 60_000,
  });

  async function signOut() {
    const { supabase } = await getSupabaseClient();
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  function go(id: SectionId) {
    void navigate({
      from: "/admin",
      search: (current) => ({ ...current, section: id }),
    });
    setDrawerOpen(false);
  }

  if (isAdmin === null) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="surface-panel max-w-md rounded-[1.75rem] px-8 py-10 text-center">
          <p className="kicker">Loading Admin</p>
          <h1 className="mt-3 text-2xl text-foreground">Preparing your workspace</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            We are checking your access level and loading the certificate operations environment.
          </p>
        </div>
      </div>
    );
  }

  if (isAdmin === false) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="surface-panel max-w-md rounded-[1.75rem] px-8 py-10 text-center">
          <p className="kicker">Access Restricted</p>
          <h1 className="mt-3 text-2xl text-foreground">Not authorised</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Your account ({user?.email}) does not currently have admin access. Ask an existing
            administrator to grant the <code className="rounded bg-muted px-1">admin</code> role.
          </p>
          <Button className="mt-6" variant="outline" onClick={signOut}>
            <LogOut className="mr-1 h-4 w-4" />
            Sign out
          </Button>
        </div>
      </div>
    );
  }

  const currentMeta = SECTION_META[section];
  const userInitial = (user?.email?.[0] ?? "A").toUpperCase();
  const templateMode = section === "template";

  const sidebarContent = (
    <div className="surface-panel-strong relative flex h-full flex-col overflow-hidden text-navy-foreground">
      <div className="mesh-overlay absolute inset-0 opacity-25" />
      <div className="absolute -right-16 top-10 h-40 w-40 rounded-full bg-gold/16 blur-3xl" />

      <div className="relative flex h-full flex-col">
        <Link to="/" className="flex items-center gap-3 border-b border-white/10 px-5 py-5">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/14 bg-white/10 backdrop-blur-sm">
            <img src={unzaLogo.url} alt="UNZA" className="h-9 w-9 object-contain" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/52">
              Certificate Operations
            </p>
            <p className="truncate font-display text-lg text-white">{ORG_NAME}</p>
          </div>
        </Link>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {NAV.map((group) => (
            <div key={group.label ?? "overview"} className="mb-5 last:mb-0">
              {group.label && (
                <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-white/40">
                  {group.label}
                </p>
              )}
              <ul className="space-y-1">
                {group.items.map((item) => {
                  const active = section === item.id;

                  return (
                    <li key={item.id}>
                      <button
                        onClick={() => go(item.id)}
                        className={`group flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-sm font-medium transition-all ${
                          active
                            ? "bg-white text-foreground shadow-[var(--shadow-soft)]"
                            : "text-white/72 hover:bg-white/10 hover:text-white"
                        }`}
                      >
                        <div
                          className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                            active
                              ? "bg-primary/8 text-primary"
                              : "bg-white/8 text-white/60 group-hover:text-white"
                          }`}
                        >
                          <item.icon className="h-4 w-4" />
                        </div>
                        <span className="flex-1 text-left">{item.label}</span>
                        {active && <ChevronRight className="h-4 w-4 text-primary/65" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-white/10 px-4 py-4">
          <div className="flex items-center gap-3 rounded-[1.35rem] border border-white/10 bg-white/7 px-3 py-3 backdrop-blur-sm">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gold/20 text-sm font-bold text-gold">
              {userInitial}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/40">
                Signed in
              </p>
              <p className="truncate text-sm text-white/75">{user?.email}</p>
            </div>
            <button
              onClick={signOut}
              title="Sign out"
              className="rounded-xl p-2 text-white/55 hover:bg-white/10 hover:text-white"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="relative flex min-h-screen">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_right,rgba(15,80,54,0.09),transparent_26rem)]" />

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 md:flex">{sidebarContent}</aside>

      {drawerOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <div
            className="absolute inset-0 bg-black/45 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="relative z-10 h-full w-72">{sidebarContent}</aside>
        </div>
      )}

      <div className="flex min-h-screen flex-1 flex-col md:ml-72">
        <header className="sticky top-0 z-20 border-b border-white/60 bg-background/82 backdrop-blur-xl">
          <div className="flex items-center justify-between gap-4 px-4 py-4 sm:px-6">
            <div className="flex items-center gap-3">
              <button
                className="rounded-xl border border-border/70 bg-white/70 p-2 shadow-[var(--shadow-soft)] backdrop-blur-sm md:hidden"
                onClick={() => setDrawerOpen(true)}
                aria-label="Open menu"
              >
                <Menu className="h-5 w-5" />
              </button>

              <div>
                <p className="kicker">{currentMeta.eyebrow}</p>
                <h1 className="mt-1 text-2xl text-foreground">{getLabel(section)}</h1>
                <p className="mt-1 hidden max-w-3xl text-sm text-muted-foreground sm:block">
                  {currentMeta.description}
                </p>
              </div>
            </div>

            <div className="hidden items-center gap-3 lg:flex">
              <Link
                to="/"
                className="text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                Public verification
              </Link>
              <div className="rounded-full border border-border/80 bg-white/74 px-4 py-2 shadow-[var(--shadow-soft)]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  Active user
                </p>
                <p className="text-sm font-semibold text-foreground">{user?.email}</p>
              </div>
              <Button variant="outline" size="sm" onClick={signOut}>
                <LogOut className="mr-1 h-4 w-4" />
                Sign out
              </Button>
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 py-5 sm:px-6 sm:py-6">
          <div className={templateMode ? "" : "mx-auto max-w-7xl"}>
            <Suspense fallback={<SectionLoading section={section} />}>
              {renderSection(section)}
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  );
}
