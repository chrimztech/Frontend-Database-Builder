import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Award, ArrowRight, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { generateCertificateId, ORG_NAME } from "@/lib/cert";
import { uploadCertificatePdf } from "@/lib/pdf";

type EnrolmentStatus = "enrolled" | "in_progress" | "completed" | "certified";

type PaymentStatus = "pending" | "paid" | "waived" | "free";

type Enrolment = {
  id: string;
  status: EnrolmentStatus;
  enrolled_at: string;
  completed_at: string | null;
  certificate_id: string | null;
  fee_charged: number | null;
  payment_status: PaymentStatus;
  student: { id: string; full_name: string; email: string | null; category: "unza" | "non_unza" } | null;
  course: { id: string; name: string; prefix: string; fee_unza: number | null; fee_non_unza: number | null } | null;
};

const PAY_LABEL: Record<PaymentStatus, string> = {
  pending: "Pending", paid: "Paid", waived: "Waived", free: "Free",
};
const PAY_TONE: Record<PaymentStatus, string> = {
  pending: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  paid: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  waived: "bg-muted text-muted-foreground",
  free: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
};
function fmtZmw(v: number | null) {
  if (v == null) return "—";
  return `K${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const STATUS_LABEL: Record<EnrolmentStatus, string> = {
  enrolled: "Enrolled",
  in_progress: "In progress",
  completed: "Completed",
  certified: "Certified",
};

const STATUS_BADGE: Record<EnrolmentStatus, string> = {
  enrolled: "bg-muted text-foreground",
  in_progress: "bg-primary/15 text-primary",
  completed: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  certified: "bg-success text-success-foreground",
};

export function EnrolmentsTab() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"all" | EnrolmentStatus>("all");

  const enrolments = useQuery({
    queryKey: ["admin-enrolments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("enrolments")
        .select(`
          id, status, enrolled_at, completed_at, certificate_id, fee_charged, payment_status,
          student:students ( id, full_name, email, category ),
          course:courses ( id, name, prefix, fee_unza, fee_non_unza )
        `)
        .order("enrolled_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Enrolment[];
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin-enrolments"] });
    qc.invalidateQueries({ queryKey: ["admin-certs"] });
    qc.invalidateQueries({ queryKey: ["admin-stats"] });
  };

  const list = enrolments.data ?? [];
  const filtered = tab === "all" ? list : list.filter((e) => e.status === tab);
  const counts = {
    all: list.length,
    enrolled: list.filter((e) => e.status === "enrolled").length,
    in_progress: list.filter((e) => e.status === "in_progress").length,
    completed: list.filter((e) => e.status === "completed").length,
    certified: list.filter((e) => e.status === "certified").length,
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-display">Enrolments</h2>
          <p className="text-sm text-muted-foreground">Track who's in training, who needs a certificate, and who's been certified.</p>
        </div>
        <EnrolDialog onSaved={refresh} />
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="all">All ({counts.all})</TabsTrigger>
          <TabsTrigger value="enrolled">Enrolled ({counts.enrolled})</TabsTrigger>
          <TabsTrigger value="in_progress">In progress ({counts.in_progress})</TabsTrigger>
          <TabsTrigger value="completed">Needs certificate ({counts.completed})</TabsTrigger>
          <TabsTrigger value="certified">Certified ({counts.certified})</TabsTrigger>
        </TabsList>
        <TabsContent value={tab} className="mt-4">
          <div className="rounded-lg border bg-card overflow-hidden">
            {enrolments.isLoading ? (
              <div className="p-10 text-center text-sm text-muted-foreground">Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="p-10 text-center text-sm text-muted-foreground">Nothing here.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Course</TableHead>
                    <TableHead>Enrolled</TableHead>
                    <TableHead>Fee</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((e) => (
                    <EnrolRow key={e.id} enrolment={e} onChange={refresh} />
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function EnrolRow({ enrolment, onChange }: { enrolment: Enrolment; onChange: () => void }) {
  const [busy, setBusy] = useState(false);

  async function setStatus(status: EnrolmentStatus) {
    setBusy(true);
    try {
      const patch: any = { status };
      if (status === "in_progress" && !enrolment.completed_at) patch.started_at = new Date().toISOString();
      if (status === "completed") patch.completed_at = new Date().toISOString();
      const { error } = await supabase.from("enrolments").update(patch).eq("id", enrolment.id);
      if (error) throw error;
      toast.success(`Marked ${STATUS_LABEL[status]}`);
      onChange();
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    } finally { setBusy(false); }
  }

  async function generateCertificate() {
    if (!enrolment.student || !enrolment.course) return;
    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");
      const certificate_id = generateCertificateId(new Date().getFullYear(), enrolment.course.prefix);
      const issue_date = new Date().toISOString().slice(0, 10);
      const { data: cert, error } = await supabase
        .from("certificates")
        .insert({
          certificate_id,
          recipient_name: enrolment.student.full_name,
          recipient_email: enrolment.student.email,
          programme: enrolment.course.name,
          issue_date,
          issuer_name: ORG_NAME,
          issued_by: user.id,
          course_id: enrolment.course.id,
          student_id: enrolment.student.id,
        })
        .select()
        .single();
      if (error) throw error;

      // Render & upload PDF
      await uploadCertificatePdf({
        certificateId: cert.certificate_id,
        recipientName: cert.recipient_name,
        programme: cert.programme,
        issueDate: cert.issue_date,
        issuerName: cert.issuer_name,
      });

      // Mark enrolment certified, link cert
      await supabase
        .from("enrolments")
        .update({ status: "certified", certificate_id: cert.id, completed_at: enrolment.completed_at ?? new Date().toISOString() })
        .eq("id", enrolment.id);

      toast.success(`Certificate ${cert.certificate_id} generated`);
      onChange();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to generate");
    } finally { setBusy(false); }
  }

  async function remove() {
    if (!window.confirm("Remove this enrolment?")) return;
    const { error } = await supabase.from("enrolments").delete().eq("id", enrolment.id);
    if (error) toast.error(error.message);
    else { toast.success("Enrolment removed"); onChange(); }
  }

  async function cyclePayment() {
    const order: PaymentStatus[] = ["pending", "paid", "waived", "free"];
    const next = order[(order.indexOf(enrolment.payment_status) + 1) % order.length];
    const { error } = await supabase.from("enrolments").update({ payment_status: next }).eq("id", enrolment.id);
    if (error) toast.error(error.message); else { toast.success(`Payment: ${PAY_LABEL[next]}`); onChange(); }
  }

  return (
    <TableRow>
      <TableCell>
        <div className="font-medium flex items-center gap-2">
          {enrolment.student?.full_name ?? "—"}
          {enrolment.student?.category === "unza"
            ? <Badge className="bg-accent text-accent-foreground text-[10px] px-1.5 py-0">UNZA</Badge>
            : <Badge variant="outline" className="text-[10px] px-1.5 py-0">Non-UNZA</Badge>}
        </div>
        <div className="text-xs text-muted-foreground">{enrolment.student?.email ?? ""}</div>
      </TableCell>
      <TableCell>{enrolment.course?.name ?? "—"}</TableCell>
      <TableCell className="text-muted-foreground text-xs">{new Date(enrolment.enrolled_at).toLocaleDateString()}</TableCell>
      <TableCell className="font-mono text-xs">{fmtZmw(enrolment.fee_charged)}</TableCell>
      <TableCell>
        <button onClick={cyclePayment} disabled={busy} title="Click to cycle status">
          <span className={`inline-block text-xs px-2 py-0.5 rounded ${PAY_TONE[enrolment.payment_status]}`}>
            {PAY_LABEL[enrolment.payment_status]}
          </span>
        </button>
      </TableCell>
      <TableCell>
        <Badge className={STATUS_BADGE[enrolment.status]}>{STATUS_LABEL[enrolment.status]}</Badge>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          {enrolment.status === "enrolled" && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setStatus("in_progress")}>
              Start <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          )}
          {enrolment.status === "in_progress" && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setStatus("completed")}>
              Mark completed <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          )}
          {enrolment.status === "completed" && (
            <Button size="sm" disabled={busy} onClick={generateCertificate} className="bg-accent text-accent-foreground hover:bg-accent/90">
              <Award className="h-4 w-4 mr-1" /> Generate certificate
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={remove} disabled={busy}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function EnrolDialog({ onSaved }: { onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [student_id, setStudent] = useState("");
  const [course_id, setCourse] = useState("");
  const [payment_status, setPaymentStatus] = useState<PaymentStatus>("pending");
  const [overrideFee, setOverrideFee] = useState<string>("");

  const students = useQuery({
    queryKey: ["enrol-students"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.from("students").select("id, full_name, category").order("full_name");
      if (error) throw error;
      return data;
    },
  });
  const courses = useQuery({
    queryKey: ["enrol-courses"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("courses")
        .select("id, name, fee_unza, fee_non_unza, category")
        .eq("active", true).order("name");
      if (error) throw error;
      return data;
    },
  });

  const selectedStudent = (students.data ?? []).find((s: any) => s.id === student_id);
  const selectedCourse = (courses.data ?? []).find((c: any) => c.id === course_id);
  const suggestedFee: number | null =
    selectedStudent && selectedCourse
      ? (selectedStudent.category === "unza" ? selectedCourse.fee_unza : selectedCourse.fee_non_unza)
      : null;
  const finalFee: number | null = overrideFee.trim() !== ""
    ? Number(overrideFee)
    : suggestedFee;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!student_id || !course_id) return toast.error("Pick a student and a course");
    setBusy(true);
    try {
      const fee_charged = finalFee == null || Number.isNaN(finalFee) ? null : finalFee;
      const auto_pay: PaymentStatus = fee_charged === 0 ? "free" : payment_status;
      const { error } = await supabase.from("enrolments").insert({
        student_id, course_id,
        fee_charged,
        payment_status: auto_pay,
      });
      if (error) throw error;
      toast.success("Enrolment created");
      setStudent(""); setCourse(""); setOverrideFee(""); setPaymentStatus("pending");
      onSaved(); setOpen(false);
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-accent text-accent-foreground hover:bg-accent/90">
          <Plus className="h-4 w-4 mr-1" /> New enrolment
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enrol a student</DialogTitle>
          <DialogDescription>Fee is auto-suggested from the student's category (UNZA / Non-UNZA).</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <Label>Student</Label>
            <Select value={student_id} onValueChange={setStudent}>
              <SelectTrigger><SelectValue placeholder="Pick a student" /></SelectTrigger>
              <SelectContent>
                {(students.data ?? []).map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.full_name} {s.category === "unza" ? "· UNZA" : "· Non-UNZA"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Course</Label>
            <Select value={course_id} onValueChange={setCourse}>
              <SelectTrigger><SelectValue placeholder="Pick a course" /></SelectTrigger>
              <SelectContent>
                {(courses.data ?? []).map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {selectedStudent && selectedCourse && (
            <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-1">
              <div>Suggested fee for <strong>{selectedStudent.category === "unza" ? "UNZA" : "Non-UNZA"}</strong> student: {suggestedFee != null ? `K${suggestedFee.toLocaleString()}` : "— (not set on course)"}</div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="fee">Fee charged (ZMW)</Label>
              <input
                id="fee"
                type="number" min="0" step="0.01"
                className="flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm"
                placeholder={suggestedFee != null ? String(suggestedFee) : "0.00"}
                value={overrideFee}
                onChange={(e) => setOverrideFee(e.target.value)}
              />
            </div>
            <div>
              <Label>Payment status</Label>
              <Select value={payment_status} onValueChange={(v) => setPaymentStatus(v as PaymentStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="waived">Waived</SelectItem>
                  <SelectItem value="free">Free</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={busy} className="bg-accent text-accent-foreground hover:bg-accent/90">
              {busy ? "Creating…" : "Enrol"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
