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
  Pencil,
  RotateCcw,
  Search,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiGet, apiPatch, apiDelete } from "@/lib/api";
import { verificationUrl } from "@/lib/cert";
import { toTitleCaseName } from "@/lib/text";
import { certificateSendErrorMessage, sendCertificateEmailWithRepair } from "@/lib/certificate-delivery";
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
  certificate_type?: string;
  pdf_path?: string | null;
};

export function CertificatesTab() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");

  const certs = useQuery({
    queryKey: ["admin-certs"],
    queryFn: async () => {
      const data = await apiGet<Cert[]>("/certificates");
      return [...data].sort((a, b) => b.created_at.localeCompare(a.created_at));
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
      certificateType: cert.certificate_type as any,
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
      await sendCertificateEmailWithRepair(cert);
      toast.success(`Certificate emailed to ${cert.recipient_email}`);
      onChange();
    } catch (error: any) {
      const msg = certificateSendErrorMessage(error) ?? "Failed to send email";
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
        await apiPatch(`/certificates/${cert.id}`, {
          status: "revoked",
          revoked_at: new Date().toISOString(),
          revoke_reason: reason,
        });

        toast.success("Certificate revoked");
      } else {
        await apiPatch(`/certificates/${cert.id}`, { status: "valid", revoked_at: null, revoke_reason: null });

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
      await apiDelete(`/certificates/${cert.id}`);

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
          <EditCertificateDialog cert={cert} onSaved={onChange} />
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

function EditCertificateDialog({ cert, onSaved }: { cert: Cert; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [recipientName, setRecipientName] = useState(cert.recipient_name);
  const [recipientEmail, setRecipientEmail] = useState(cert.recipient_email ?? "");
  const [programme, setProgramme] = useState(cert.programme);
  const [nationalId, setNationalId] = useState(cert.national_id ?? "");
  const [issueDate, setIssueDate] = useState(cert.issue_date);

  function resetToCert() {
    setRecipientName(cert.recipient_name);
    setRecipientEmail(cert.recipient_email ?? "");
    setProgramme(cert.programme);
    setNationalId(cert.national_id ?? "");
    setIssueDate(cert.issue_date);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!recipientName.trim() || !programme.trim()) {
      toast.error("Recipient name and programme are required");
      return;
    }
    setBusy(true);
    try {
      const normalizedName = toTitleCaseName(recipientName.trim());
      await apiPatch(`/certificates/${cert.id}`, {
        recipient_name: normalizedName,
        recipient_email: recipientEmail.trim() || null,
        programme: programme.trim(),
        national_id: nationalId.trim() || null,
        issue_date: issueDate,
      });

      // Re-render the PDF with the corrected data and replace the stored file,
      // so the downloaded/emailed certificate reflects the fix too.
      const certificateCode = getCertificateCode(cert);
      const { uploadCertificatePdf } = await import("@/lib/pdf");
      await uploadCertificatePdf({
        certificateId: certificateCode,
        certificateType: cert.certificate_type as any,
        recipientName: normalizedName,
        programme: programme.trim(),
        issueDate,
        issuerName: cert.issuer_name,
        nrcNumber: nationalId.trim() || undefined,
      });

      toast.success("Certificate updated and PDF regenerated");
      onSaved();
      setOpen(false);
    } catch (error: any) {
      toast.error(error.message ?? "Failed to update certificate");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) resetToCert();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" title="Edit certificate">
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit certificate</DialogTitle>
          <DialogDescription>
            Corrects a data-entry mistake (e.g. NRC entered as a computer number, a misspelled
            name) without deleting and regenerating the certificate. The PDF is re-rendered and
            replaced on save.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="edit-cert-name">Recipient name</Label>
            <Input
              id="edit-cert-name"
              required
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-cert-email">Recipient email</Label>
            <Input
              id="edit-cert-email"
              type="email"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-cert-programme">Programme</Label>
            <Input
              id="edit-cert-programme"
              required
              value={programme}
              onChange={(e) => setProgramme(e.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="edit-cert-nrc">NRC number</Label>
              <Input
                id="edit-cert-nrc"
                value={nationalId}
                onChange={(e) => setNationalId(e.target.value)}
                placeholder="e.g. 123456/78/1"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-cert-date">Issue date</Label>
              <Input
                id="edit-cert-date"
                type="date"
                required
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving..." : "Save and regenerate PDF"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
