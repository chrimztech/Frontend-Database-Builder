import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Ban,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Loader2,
  Mail,
  RotateCcw,
  Search,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { verificationUrl } from "@/lib/cert";
import {
  AdminEmptyState,
  AdminPageHeader,
  AdminPanel,
  AdminPanelHeader,
  AdminStat,
} from "@/components/admin/admin-ui";

type Cert = {
  id: string;
  certificate_id: string;
  certificate_code: string | null;
  recipient_name: string;
  recipient_email: string | null;
  programme: string;
  issue_date: string;
  status: "valid" | "revoked";
  issuer_name: string;
  email_status: string;
  email_sent_at: string | null;
  created_at: string;
  national_id?: string | null;
};

export function CertificatesTab() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");

  const certs = useQuery({
    queryKey: ["admin-certs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("certificates")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        throw error;
      }

      return data as Cert[];
    },
  });

  const list = certs.data ?? [];
  const filtered = list.filter((cert) => {
    if (!search.trim()) {
      return true;
    }

    const query = search.toLowerCase();
    const code = getCertificateCode(cert).toLowerCase();
    return (
      code.includes(query) ||
      cert.recipient_name.toLowerCase().includes(query) ||
      cert.programme.toLowerCase().includes(query) ||
      (cert.recipient_email ?? "").toLowerCase().includes(query)
    );
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin-certs"] });
  const validCount = list.filter((cert) => cert.status === "valid").length;
  const revokedCount = list.filter((cert) => cert.status === "revoked").length;
  const sentCount = list.filter((cert) => cert.email_status === "sent").length;

  return (
    <div className="space-y-8">
      <AdminPageHeader
        eyebrow="Certificates"
        title="Issued certificate registry"
        description="Review issued certificates, verify delivery state, and manage revocation or restoration when a record changes."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AdminStat
          label="Issued"
          value={list.length}
          hint="Total certificate records in the registry"
        />
        <AdminStat
          label="Valid"
          value={validCount}
          hint="Certificates currently recognised as active"
        />
        <AdminStat
          label="Revoked"
          value={revokedCount}
          hint="Records that should no longer be accepted"
        />
        <AdminStat
          label="Delivered"
          value={sentCount}
          hint="Certificates marked as sent by email"
        />
      </div>

      <AdminPanel>
        <AdminPanelHeader
          title="Certificate library"
          description="Search by certificate ID, recipient, programme, or email address."
          actions={
            <div className="relative w-full sm:w-80">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search certificates..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          }
        />

        <div className="px-5 py-5 sm:px-6">
          {certs.isLoading ? (
            <div className="text-sm text-muted-foreground">Loading certificates...</div>
          ) : filtered.length === 0 ? (
            <AdminEmptyState
              icon={ShieldCheck}
              title="No certificates found"
              description={
                list.length === 0
                  ? "Generate a certificate from the enrolments workflow to populate this registry."
                  : "Try a different search term to find the certificate you need."
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Certificate ID</TableHead>
                  <TableHead>Recipient</TableHead>
                  <TableHead>Programme</TableHead>
                  <TableHead>Issued</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((cert) => (
                  <CertRow key={cert.id} cert={cert} onChange={refresh} />
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </AdminPanel>
    </div>
  );
}

function getCertificateCode(cert: Pick<Cert, "certificate_code" | "certificate_id">) {
  return cert.certificate_code || cert.certificate_id;
}

function CertRow({ cert, onChange }: { cert: Cert; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [emailBusy, setEmailBusy] = useState(false);
  const certificateCode = getCertificateCode(cert);

  async function download() {
    const { downloadCertificatePdf } = await import("@/lib/pdf");
    await downloadCertificatePdf({
      certificateId: certificateCode,
      recipientName: cert.recipient_name,
      programme: cert.programme,
      issueDate: cert.issue_date,
      issuerName: cert.issuer_name,
      nrcNumber: cert.national_id ?? undefined,
    });
  }

  async function emailToStudent() {
    if (!cert.recipient_email) {
      toast.error("No email address on this certificate — update the student record first.");
      return;
    }

    setEmailBusy(true);
    try {
      const { sendCertificateEmail } = await import("@/lib/api/certificates.functions");
      await sendCertificateEmail({ data: { certificateId: cert.id } });
      toast.success(`Certificate emailed to ${cert.recipient_email}`);
      onChange();
    } catch (error: any) {
      const msg = error?.message ?? error?.data?.message ?? String(error) ?? "Failed to send email";
      toast.error(msg);
      console.error("[email] send failed:", error);
    } finally {
      setEmailBusy(false);
    }
  }

  async function copyLink() {
    await navigator.clipboard.writeText(verificationUrl(certificateCode));
    toast.success("Verification link copied");
  }

  async function toggleRevoke() {
    setBusy(true);
    try {
      if (cert.status === "valid") {
        const reason = window.prompt("Reason for revoking (optional):") ?? null;
        const { error } = await supabase
          .from("certificates")
          .update({
            status: "revoked",
            revoked_at: new Date().toISOString(),
            revoke_reason: reason,
          })
          .eq("id", cert.id);

        if (error) {
          throw error;
        }

        toast.success("Certificate revoked");
      } else {
        const { error } = await supabase
          .from("certificates")
          .update({ status: "valid", revoked_at: null, revoke_reason: null })
          .eq("id", cert.id);

        if (error) {
          throw error;
        }

        toast.success("Certificate restored");
      }

      onChange();
    } catch (error: any) {
      toast.error(error.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (
      !window.confirm(`Permanently delete certificate ${certificateCode}? This cannot be undone.`)
    ) {
      return;
    }

    setBusy(true);
    try {
      await supabase.storage
        .from("certificates")
        .remove([`${certificateCode}.pdf`, `${cert.certificate_id}.pdf`])
        .catch(() => {});

      const { error } = await supabase.from("certificates").delete().eq("id", cert.id);

      if (error) {
        throw error;
      }

      toast.success("Certificate deleted");
      onChange();
    } catch (error: any) {
      toast.error(error.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <TableRow>
      <TableCell className="font-mono text-xs">{certificateCode}</TableCell>
      <TableCell>
        <div className="font-medium">{cert.recipient_name}</div>
        <div className="mt-1 text-sm text-muted-foreground">
          {cert.recipient_email ?? "no email"}
        </div>
      </TableCell>
      <TableCell className="text-muted-foreground">{cert.programme}</TableCell>
      <TableCell className="text-muted-foreground">
        {new Date(`${cert.issue_date}T00:00:00`).toLocaleDateString()}
      </TableCell>
      <TableCell>
        {cert.status === "valid" ? (
          <Badge className="bg-success text-success-foreground hover:bg-success">Valid</Badge>
        ) : (
          <Badge variant="destructive">Revoked</Badge>
        )}
      </TableCell>
      <TableCell>
        {cert.email_status === "sent" ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-success">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Sent
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">Not sent</span>
        )}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex flex-wrap justify-end gap-2">
          <Button size="sm" variant="outline" onClick={copyLink} title="Copy verification link">
            <Copy className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="outline" asChild title="Open public verification page">
            <a href={`/verify/${certificateCode}`} target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
          <Button size="sm" variant="outline" onClick={download} title="Download PDF">
            <Download className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={emailToStudent}
            disabled={busy || emailBusy}
            title={cert.recipient_email ? `Email to ${cert.recipient_email}` : "No email on record"}
          >
            {emailBusy
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Mail className="h-4 w-4" />
            }
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={toggleRevoke}
            disabled={busy}
            title={cert.status === "valid" ? "Revoke" : "Restore"}
          >
            {cert.status === "valid" ? (
              <Ban className="h-4 w-4 text-destructive" />
            ) : (
              <RotateCcw className="h-4 w-4" />
            )}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={remove}
            disabled={busy}
            title="Delete certificate"
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
