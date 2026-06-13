import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  LogOut, LayoutDashboard, Users, UserCircle, BookOpen,
  ClipboardList, Award, Clock, Mail, BarChart2, Activity,
  Palette, FileEdit, Settings, ShieldCheck, ChevronRight, Menu,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { ORG_NAME } from "@/lib/cert";
import unzaLogo from "@/assets/unza-logo.png.asset.json";

import { OverviewTab } from "@/components/admin/overview-tab";
import { StudentsTab } from "@/components/admin/students-tab";
import { CoursesTab } from "@/components/admin/courses-tab";
import { EnrolmentsTab } from "@/components/admin/enrolments-tab";
import { CertificatesTab } from "@/components/admin/certificates-tab";
import { BrandingTab } from "@/components/admin/branding-tab";
import { SettingsTab } from "@/components/admin/settings-tab";
import { TemplateEditor } from "@/components/admin/template-editor";
import { ReportsTab } from "@/components/admin/reports-tab";
import { AuditLogTab } from "@/components/admin/audit-log-tab";
import { PendingCertificatesTab } from "@/components/admin/pending-certificates-tab";
import { CertificateQueueTab } from "@/components/admin/certificate-queue-tab";
import { StudentProfilesTab } from "@/components/admin/student-profiles-tab";
import { UsersTab } from "@/components/admin/users-tab";

type SectionId =
  | "overview" | "students" | "profiles" | "users"
  | "courses" | "enrolments"
  | "certificates" | "pending" | "email-queue"
  | "reports" | "audit"
  | "branding" | "template" | "settings";

type NavItem = { id: SectionId; icon: React.ComponentType<{ className?: string }>; label: string };
type NavGroup = { label: string | null; items: NavItem[] };

const NAV: NavGroup[] = [
  {
    label: null,
    items: [{ id: "overview", icon: LayoutDashboard, label: "Overview" }],
  },
  {
    label: "People",
    items: [
      { id: "students",  icon: Users,        label: "Students" },
      { id: "profiles",  icon: UserCircle,   label: "Student profiles" },
      { id: "users",     icon: ShieldCheck,  label: "Admin users" },
    ],
  },
  {
    label: "Training",
    items: [
      { id: "courses",     icon: BookOpen,      label: "Courses" },
      { id: "enrolments",  icon: ClipboardList, label: "Enrolments" },
    ],
  },
  {
    label: "Certificates",
    items: [
      { id: "certificates", icon: Award, label: "Certificates" },
      { id: "pending",      icon: Clock, label: "Pending" },
      { id: "email-queue",  icon: Mail,  label: "Email queue" },
    ],
  },
  {
    label: "Insights",
    items: [
      { id: "reports", icon: BarChart2, label: "Reports" },
      { id: "audit",   icon: Activity,  label: "Audit log" },
    ],
  },
  {
    label: "Configuration",
    items: [
      { id: "branding",  icon: Palette,   label: "Branding" },
      { id: "template",  icon: FileEdit,  label: "Template editor" },
      { id: "settings",  icon: Settings,  label: "Settings" },
    ],
  },
];

const ALL_ITEMS = NAV.flatMap((g) => g.items);
function getLabel(id: string) {
  return ALL_ITEMS.find((i) => i.id === id)?.label ?? id;
}

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [{ title: `Admin — ${ORG_NAME}` }, { name: "robots", content: "noindex" }],
  }),
  component: AdminPage,
});

function AdminPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [user, setUser] = useState<{ email?: string } | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [section, setSection] = useState<SectionId>("overview");
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      if (!user) return;
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();
      setIsAdmin(!!data);
    })();
  }, []);

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  function go(id: SectionId) {
    setSection(id);
    setDrawerOpen(false);
  }

  if (isAdmin === false) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-display">Not authorised</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your account ({user?.email}) doesn't have admin access. Ask an existing admin to grant
            you the <code className="mx-1 rounded bg-muted px-1">admin</code> role.
          </p>
          <button
            onClick={signOut}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg border text-sm hover:bg-muted transition-colors"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </div>
    );
  }

  const sidebarContent = (
    <div className="flex flex-col h-full" style={{ background: "var(--navy)", color: "var(--navy-foreground)" }}>
      {/* Brand */}
      <Link
        to="/"
        className="flex items-center gap-3 px-5 py-5 shrink-0"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}
      >
        <img src={unzaLogo.url} alt="UNZA" className="h-9 w-9 object-contain" />
        <div className="leading-tight">
          <p className="text-xs font-semibold tracking-widest uppercase opacity-50">UNZA</p>
          <p className="font-display text-sm font-semibold">TeLS Admin</p>
        </div>
      </Link>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-5">
        {NAV.map((group, gi) => (
          <div key={gi}>
            {group.label && (
              <p className="px-2 mb-1.5 text-xs font-semibold uppercase tracking-widest opacity-40">
                {group.label}
              </p>
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = section === item.id;
                return (
                  <li key={item.id}>
                    <button
                      onClick={() => go(item.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                        active
                          ? "bg-gold text-gold-foreground font-semibold"
                          : "text-white/60 hover:bg-white/10 hover:text-white"
                      }`}
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span className="flex-1 text-left">{item.label}</span>
                      {active && <ChevronRight className="h-3.5 w-3.5 opacity-60" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* User footer */}
      <div className="shrink-0 px-4 py-4" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
        <div className="flex items-center gap-3">
          <div
            className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold uppercase shrink-0"
            style={{ background: "rgba(201,164,76,0.2)", color: "var(--gold)" }}
          >
            {user?.email?.[0] ?? "A"}
          </div>
          <p className="flex-1 min-w-0 text-xs text-white/50 truncate">{user?.email}</p>
          <button
            onClick={signOut}
            title="Sign out"
            className="p-1.5 rounded text-white/40 hover:bg-white/10 hover:text-white transition-colors"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-muted/40">
      {/* Desktop sidebar — fixed */}
      <aside className="hidden md:flex flex-col fixed inset-y-0 left-0 w-64 z-30 shadow-lg">
        {sidebarContent}
      </aside>

      {/* Mobile drawer overlay */}
      {drawerOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="relative flex flex-col w-64 z-50 shadow-2xl">
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Main area */}
      <div className="flex flex-col flex-1 md:ml-64 min-h-screen">
        {/* Sticky topbar */}
        <header className="sticky top-0 z-20 flex items-center gap-3 px-6 py-4 bg-background/90 backdrop-blur border-b">
          <button
            className="md:hidden p-1.5 -ml-1 rounded-lg hover:bg-muted transition-colors"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <h1 className="font-display text-xl tracking-tight">{getLabel(section)}</h1>
        </header>

        {/* Page content */}
        <main className={`flex-1 ${section === "template" ? "px-4 py-4" : "px-6 py-8"}`}>
          {section === "overview"    && <OverviewTab />}
          {section === "students"    && <StudentsTab />}
          {section === "profiles"    && <StudentProfilesTab />}
          {section === "courses"     && <CoursesTab />}
          {section === "enrolments"  && <EnrolmentsTab />}
          {section === "certificates"&& <CertificatesTab />}
          {section === "pending"     && <PendingCertificatesTab />}
          {section === "email-queue" && <CertificateQueueTab />}
          {section === "reports"     && <ReportsTab />}
          {section === "audit"       && <AuditLogTab />}
          {section === "branding"    && <BrandingTab />}
          {section === "template"    && <TemplateEditor />}
          {section === "users"       && <UsersTab />}
          {section === "settings"    && <SettingsTab />}
        </main>
      </div>
    </div>
  );
}
