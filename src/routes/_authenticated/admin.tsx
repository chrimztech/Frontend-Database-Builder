import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: `Admin — ${ORG_NAME}` }, { name: "robots", content: "noindex" }] }),
  component: AdminPage,
});

function AdminPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [user, setUser] = useState<{ email?: string } | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [tab, setTab] = useState("overview");

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

  if (isAdmin === false) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-display">Not authorized</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your account ({user?.email}) doesn't have admin access. Ask an existing admin to grant the
            <code className="mx-1 rounded bg-muted px-1">admin</code> role.
          </p>
          <Button className="mt-4" variant="outline" onClick={signOut}>Sign out</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto max-w-7xl px-6 py-3 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <img src={unzaLogo.url} alt="UNZA" className="h-14 w-14 object-contain" />
            <span className="font-display text-lg leading-tight">{ORG_NAME} · Admin</span>
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground hidden sm:inline">{user?.email}</span>
            <Button variant="ghost" size="sm" onClick={signOut}>
              <LogOut className="h-4 w-4 mr-1" /> Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="mb-6 flex-wrap h-auto">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="students">Students</TabsTrigger>
            <TabsTrigger value="profiles">Student profiles</TabsTrigger>
            <TabsTrigger value="courses">Courses</TabsTrigger>
            <TabsTrigger value="enrolments">Enrolments</TabsTrigger>
            <TabsTrigger value="certificates">Certificates</TabsTrigger>
            <TabsTrigger value="pending">Pending certificates</TabsTrigger>
            <TabsTrigger value="email-queue">Certificate queue</TabsTrigger>
            <TabsTrigger value="reports">Reports</TabsTrigger>
            <TabsTrigger value="audit">Audit log</TabsTrigger>
            <TabsTrigger value="branding">Branding</TabsTrigger>
            <TabsTrigger value="template">Template editor</TabsTrigger>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="overview"><OverviewTab /></TabsContent>
          <TabsContent value="students"><StudentsTab /></TabsContent>
          <TabsContent value="profiles"><StudentProfilesTab /></TabsContent>
          <TabsContent value="courses"><CoursesTab /></TabsContent>
          <TabsContent value="enrolments"><EnrolmentsTab /></TabsContent>
          <TabsContent value="certificates"><CertificatesTab /></TabsContent>
          <TabsContent value="pending"><PendingCertificatesTab /></TabsContent>
          <TabsContent value="email-queue"><CertificateQueueTab /></TabsContent>
          <TabsContent value="reports"><ReportsTab /></TabsContent>
          <TabsContent value="audit"><AuditLogTab /></TabsContent>
          <TabsContent value="branding"><BrandingTab /></TabsContent>
          <TabsContent value="template"><TemplateEditor /></TabsContent>
          <TabsContent value="users"><UsersTab /></TabsContent>
          <TabsContent value="settings"><SettingsTab /></TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
