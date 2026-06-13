import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, Ban, RotateCcw, ExternalLink, Mail, Copy, CheckCircle2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { downloadCertificatePdf, uploadCertificatePdf } from "@/lib/pdf";
import { verificationUrl } from "@/lib/cert";

type Cert = {
  id: string;
  certificate_id: string;
  recipient_name: string;
  recipient_email: string | null;
  programme: string;
  issue_date: string;
  status: "valid" | "revoked";
  issuer_name: string;
  email_status: string;
  email_sent_at: string | null;
  created_at: string;
};

export function CertificatesTab() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");

  const certs = useQuery({
    queryKey: ["admin-certs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("certificates")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Cert[];
    },
  });

  const filtered = (certs.data ?? []).filter((c) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      c.certificate_id.toLowerCase().includes(q) ||
      c.recipient_name.toLowerCase().includes(q) ||
      c.programme.toLowerCase().includes(q) ||
      (c.recipient_email ?? "").toLowerCase().includes(q)
    );
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-certs"] });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-display">Certificates</h2>
          <p className="text-sm text-muted-foreground">All issued certificates. Download, send by email, or revoke.</p>
        </div>
        <Input className="w-72" placeholder="Search ID, name, programme…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="rounded-lg border bg-card overflow-hidden">
        {certs.isLoading ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">No certificates yet. Generate one from the Enrolments tab.</div>
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
              {filtered.map((c) => (
                <CertRow key={c.id} cert={c} onChange={refresh} />
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}

function CertRow({ cert, onChange }: { cert: Cert; onChange: () => void }) {
  const [busy, setBusy] = useState(false);

  async function download() {
    await downloadCertificatePdf({
      certificateId: cert.certificate_id,
      recipientName: cert.recipient_name,
      programme: cert.programme,
      issueDate: cert.issue_date,
      issuerName: cert.issuer_name,
    });
  }

  async function emailToStudent() {
    if (!cert.recipient_email) return toast.error("No email on this certificate. Edit the student record first.");
    setBusy(true);
    try {
      // Ensure PDF exists in storage
      const pdfUrl = await uploadCertificatePdf({
        certificateId: cert.certificate_id,
        recipientName: cert.recipient_name,
        programme: cert.programme,
        issueDate: cert.issue_date,
        issuerName: cert.issuer_name,
      });
      const verify = verificationUrl(cert.certificate_id);
      const subject = encodeURIComponent(`Your certificate: ${cert.programme}`);
      const body = encodeURIComponent(
        `Dear ${cert.recipient_name},\n\nCongratulations on completing ${cert.programme}!\n\n` +
        `Your certificate is attached and can also be downloaded here:\n${pdfUrl}\n\n` +
        `You (or any employer) can verify it at any time here:\n${verify}\n\n` +
        `Certificate ID: ${cert.certificate_id}\n\nBest regards,\n${cert.issuer_name}`
      );
      window.open(`mailto:${cert.recipient_email}?subject=${subject}&body=${body}`, "_blank");

      // Mark as sent
      await supabase
        .from("certificates")
        .update({
          email_status: "sent",
          email_sent_at: new Date().toISOString(),
          email_attempts: 1,
        })
        .eq("id", cert.id);
      toast.success("Email opened in your mail client. Marked as sent.");
      onChange();
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    } finally { setBusy(false); }
  }

  async function copyLink() {
    await navigator.clipboard.writeText(verificationUrl(cert.certificate_id));
    toast.success("Verification link copied");
  }

  async function toggleRevoke() {
    setBusy(true);
    try {
      if (cert.status === "valid") {
        const reason = window.prompt("Reason for revoking (optional):") ?? null;
        const { error } = await supabase
          .from("certificates")
          .update({ status: "revoked", revoked_at: new Date().toISOString(), revoke_reason: reason })
          .eq("id", cert.id);
        if (error) throw error;
        toast.success("Certificate revoked");
      } else {
        const { error } = await supabase
          .from("certificates")
          .update({ status: "valid", revoked_at: null, revoke_reason: null })
          .eq("id", cert.id);
        if (error) throw error;
        toast.success("Certificate restored");
      }
      onChange();
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    } finally { setBusy(false); }
  }

  async function remove() {
    if (!window.confirm(`Permanently delete certificate ${cert.certificate_id}? This cannot be undone.`)) return;
    setBusy(true);
    try {
      // Best-effort: remove the stored PDF too (ignore errors).
      await supabase.storage.from("certificates").remove([`${cert.certificate_id}.pdf`]).catch(() => {});
      const { error } = await supabase.from("certificates").delete().eq("id", cert.id);
      if (error) throw error;
      toast.success("Certificate deleted");
      onChange();
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    } finally { setBusy(false); }
  }

  return (
    <TableRow>
      <TableCell className="font-mono text-xs">{cert.certificate_id}</TableCell>
      <TableCell>
        <div className="font-medium">{cert.recipient_name}</div>
        <div className="text-xs text-muted-foreground">{cert.recipient_email ?? "no email"}</div>
      </TableCell>
      <TableCell className="text-muted-foreground">{cert.programme}</TableCell>
      <TableCell className="text-muted-foreground text-xs">{cert.issue_date}</TableCell>
      <TableCell>
        {cert.status === "valid"
          ? <Badge className="bg-success text-success-foreground hover:bg-success">Valid</Badge>
          : <Badge variant="destructive">Revoked</Badge>}
      </TableCell>
      <TableCell>
        {cert.email_status === "sent" ? (
          <span className="inline-flex items-center gap-1 text-xs text-success">
            <CheckCircle2 className="h-3 w-3" /> Sent
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">Not sent</span>
        )}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" onClick={copyLink} title="Copy verification link">
            <Copy className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" asChild title="View public verification page">
            <a href={`/verify/${cert.certificate_id}`} target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
          <Button size="sm" variant="ghost" onClick={download} title="Download PDF">
            <Download className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={emailToStudent} disabled={busy} title="Email to student">
            <Mail className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={toggleRevoke} disabled={busy} title={cert.status === "valid" ? "Revoke" : "Restore"}>
            {cert.status === "valid" ? <Ban className="h-4 w-4 text-destructive" /> : <RotateCcw className="h-4 w-4" />}
          </Button>
          <Button size="sm" variant="ghost" onClick={remove} disabled={busy} title="Delete certificate">
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
