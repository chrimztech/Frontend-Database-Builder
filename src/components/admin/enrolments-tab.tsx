import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Award, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { generateCertificateId, ORG_NAME } from "@/lib/cert";
import { uploadCertificatePdf } from "@/lib/pdf";
import {
  AdminEmptyState,
  AdminPageHeader,
  AdminPanel,
  AdminPanelHeader,
  AdminStat,
} from "@/components/admin/admin-ui";

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
  student: {
    id: string;
    full_name: string;
    email: string | null;
    category: "unza" | "non_unza";
  } | null;
  course: {
    id: string;
    name: string;
    prefix: string;
    fee_unza: number | null;
    fee_non_unza: number | null;
  } | null;
};

const PAY_LABEL: Record<PaymentStatus, string> = {
  pending: "Pending",
  paid: "Paid",
  waived: "Waived",
  free: "Free",
};

const PAY_TONE: Record<PaymentStatus, string> = {
  pending: "bg-amber-500/15 text-amber-700",
  paid: "bg-emerald-500/15 text-emerald-700",
  waived: "bg-muted text-muted-foreground",
  free: "bg-sky-500/15 text-sky-700",
};

const STATUS_LABEL: Record<EnrolmentStatus, string> = {
  enrolled: "Enrolled",
  in_progress: "In progress",
  completed: "Completed",
  certified: "Certified",
};

const STATUS_BADGE: Record<EnrolmentStatus, string> = {
  enrolled: "bg-muted text-foreground",
  in_progress: "bg-primary/15 text-primary",
  completed: "bg-amber-500/15 text-amber-700",
  certified: "bg-success text-success-foreground",
};

function fmtZmw(value: number | null) {
  if (value == null) {
    return "-";
  }

  return `K${Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function EnrolmentsTab() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"all" | EnrolmentStatus>("all");

  const enrolments = useQuery({
    queryKey: ["admin-enrolments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("enrolments")
        .select(
          `
          id, status, enrolled_at, completed_at, certificate_id, fee_charged, payment_status,
          student:students ( id, full_name, email, category ),
          course:courses ( id, name, prefix, fee_unza, fee_non_unza )
        `,
        )
        .order("enrolled_at", { ascending: false });

      if (error) {
        throw error;
      }

      return (data ?? []) as unknown as Enrolment[];
    },
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-enrolments"] });
    queryClient.invalidateQueries({ queryKey: ["admin-certs"] });
    queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
  };

  const list = enrolments.data ?? [];
  const filtered = tab === "all" ? list : list.filter((row) => row.status === tab);
  const counts = {
    all: list.length,
    enrolled: list.filter((row) => row.status === "enrolled").length,
    in_progress: list.filter((row) => row.status === "in_progress").length,
    completed: list.filter((row) => row.status === "completed").length,
    certified: list.filter((row) => row.status === "certified").length,
  };

  return (
    <div className="space-y-8">
      <AdminPageHeader
        eyebrow="Training"
        title="Enrolment workflow"
        description="Move learners through training, track payment status, and generate certificates as soon as a completion is ready."
        actions={<EnrolDialog onSaved={refresh} />}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AdminStat label="All enrolments" value={counts.all} hint="Everything currently tracked in the training pipeline" />
        <AdminStat label="In progress" value={counts.in_progress} hint="Learners currently active in training" />
        <AdminStat label="Needs certificate" value={counts.completed} hint="Completed training awaiting certificate generation" />
        <AdminStat label="Certified" value={counts.certified} hint="Learners already issued a certificate" />
      </div>

      <Tabs value={tab} onValueChange={(value) => setTab(value as "all" | EnrolmentStatus)}>
        <TabsList>
          <TabsTrigger value="all">All ({counts.all})</TabsTrigger>
          <TabsTrigger value="enrolled">Enrolled ({counts.enrolled})</TabsTrigger>
          <TabsTrigger value="in_progress">In progress ({counts.in_progress})</TabsTrigger>
          <TabsTrigger value="completed">Needs certificate ({counts.completed})</TabsTrigger>
          <TabsTrigger value="certified">Certified ({counts.certified})</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-6">
          <AdminPanel>
            <AdminPanelHeader
              title="Enrolment records"
              description="Track each learner from enrolment through certification, including fee handling and operational next steps."
            />

            <div className="px-5 py-5 sm:px-6">
              {enrolments.isLoading ? (
                <div className="text-sm text-muted-foreground">Loading enrolments...</div>
              ) : filtered.length === 0 ? (
                <AdminEmptyState
                  title="Nothing in this stage"
                  description="When learners move into this status, they will appear here automatically."
                />
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
                    {filtered.map((row) => (
                      <EnrolRow key={row.id} enrolment={row} onChange={refresh} />
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </AdminPanel>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function EnrolRow({
  enrolment,
  onChange,
}: {
  enrolment: Enrolment;
  onChange: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function setStatus(status: EnrolmentStatus) {
    setBusy(true);
    try {
      const patch: { status: EnrolmentStatus; started_at?: string; completed_at?: string } = { status };
      if (status === "in_progress" && !enrolment.completed_at) {
        patch.started_at = new Date().toISOString();
      }
      if (status === "completed") {
        patch.completed_at = new Date().toISOString();
      }

      const { error } = await supabase.from("enrolments").update(patch).eq("id", enrolment.id);
      if (error) {
        throw error;
      }

      toast.success(`Marked ${STATUS_LABEL[status]}`);
      onChange();
    } catch (error: any) {
      toast.error(error.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function generateCertificate() {
    if (!enrolment.student || !enrolment.course) {
      return;
    }

    setBusy(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        throw new Error("Not signed in");
      }

      const certificateId = generateCertificateId(
        new Date().getFullYear(),
        enrolment.course.prefix,
      );
      const issueDate = new Date().toISOString().slice(0, 10);
      const { data: cert, error } = await supabase
        .from("certificates")
        .insert({
          certificate_id: certificateId,
          recipient_name: enrolment.student.full_name,
          recipient_email: enrolment.student.email,
          programme: enrolment.course.name,
          issue_date: issueDate,
          issuer_name: ORG_NAME,
          issued_by: user.id,
          course_id: enrolment.course.id,
          student_id: enrolment.student.id,
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      await uploadCertificatePdf({
        certificateId: cert.certificate_id,
        recipientName: cert.recipient_name,
        programme: cert.programme,
        issueDate: cert.issue_date,
        issuerName: cert.issuer_name,
      });

      await supabase
        .from("enrolments")
        .update({
          status: "certified",
          certificate_id: cert.id,
          completed_at: enrolment.completed_at ?? new Date().toISOString(),
        })
        .eq("id", enrolment.id);

      toast.success(`Certificate ${cert.certificate_id} generated`);
      onChange();
    } catch (error: any) {
      toast.error(error.message ?? "Failed to generate");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm("Remove this enrolment?")) {
      return;
    }

    const { error } = await supabase.from("enrolments").delete().eq("id", enrolment.id);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Enrolment removed");
      onChange();
    }
  }

  async function cyclePayment() {
    const order: PaymentStatus[] = ["pending", "paid", "waived", "free"];
    const next = order[(order.indexOf(enrolment.payment_status) + 1) % order.length];
    const { error } = await supabase
      .from("enrolments")
      .update({ payment_status: next })
      .eq("id", enrolment.id);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success(`Payment: ${PAY_LABEL[next]}`);
      onChange();
    }
  }

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-2 font-medium">
          {enrolment.student?.full_name ?? "-"}
          {enrolment.student?.category === "unza" ? (
            <Badge className="bg-accent text-accent-foreground">UNZA</Badge>
          ) : (
            <Badge variant="outline">Non-UNZA</Badge>
          )}
        </div>
        <div className="mt-1 text-sm text-muted-foreground">
          {enrolment.student?.email ?? ""}
        </div>
      </TableCell>
      <TableCell>{enrolment.course?.name ?? "-"}</TableCell>
      <TableCell className="text-muted-foreground">
        {new Date(enrolment.enrolled_at).toLocaleDateString()}
      </TableCell>
      <TableCell className="font-mono text-xs">{fmtZmw(enrolment.fee_charged)}</TableCell>
      <TableCell>
        <button
          onClick={cyclePayment}
          disabled={busy}
          title="Click to cycle payment status"
        >
          <span
            className={`inline-flex rounded-full px-3 py-1 text-[11px] font-semibold tracking-[0.12em] ${PAY_TONE[enrolment.payment_status]}`}
          >
            {PAY_LABEL[enrolment.payment_status]}
          </span>
        </button>
      </TableCell>
      <TableCell>
        <Badge className={STATUS_BADGE[enrolment.status]}>{STATUS_LABEL[enrolment.status]}</Badge>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex flex-wrap justify-end gap-2">
          {enrolment.status === "enrolled" && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setStatus("in_progress")}>
              Start
              <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          )}
          {enrolment.status === "in_progress" && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setStatus("completed")}>
              Mark completed
              <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          )}
          {enrolment.status === "completed" && (
            <Button size="sm" disabled={busy} onClick={generateCertificate}>
              <Award className="mr-1 h-4 w-4" />
              Generate certificate
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={remove} disabled={busy}>
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
  const [studentId, setStudent] = useState("");
  const [courseId, setCourse] = useState("");
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("pending");
  const [overrideFee, setOverrideFee] = useState<string>("");

  const students = useQuery({
    queryKey: ["enrol-students"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("id, full_name, category")
        .order("full_name");
      if (error) {
        throw error;
      }

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
        .eq("active", true)
        .order("name");
      if (error) {
        throw error;
      }

      return data;
    },
  });

  const selectedStudent = (students.data ?? []).find((student: any) => student.id === studentId);
  const selectedCourse = (courses.data ?? []).find((course: any) => course.id === courseId);
  const suggestedFee: number | null =
    selectedStudent && selectedCourse
      ? selectedStudent.category === "unza"
        ? selectedCourse.fee_unza
        : selectedCourse.fee_non_unza
      : null;
  const finalFee: number | null =
    overrideFee.trim() !== "" ? Number(overrideFee) : suggestedFee;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!studentId || !courseId) {
      return toast.error("Pick a student and a course");
    }

    setBusy(true);
    try {
      const feeCharged =
        finalFee == null || Number.isNaN(finalFee) ? null : finalFee;
      const autoPaymentStatus: PaymentStatus =
        feeCharged === 0 ? "free" : paymentStatus;

      const { error } = await supabase.from("enrolments").insert({
        student_id: studentId,
        course_id: courseId,
        fee_charged: feeCharged,
        payment_status: autoPaymentStatus,
      });

      if (error) {
        throw error;
      }

      toast.success("Enrolment created");
      setStudent("");
      setCourse("");
      setOverrideFee("");
      setPaymentStatus("pending");
      onSaved();
      setOpen(false);
    } catch (error: any) {
      toast.error(error.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-1 h-4 w-4" />
          New enrolment
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enrol a student</DialogTitle>
          <DialogDescription>
            Fee is suggested automatically from the student category and course fee
            schedule.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Student</Label>
            <Select value={studentId} onValueChange={setStudent}>
              <SelectTrigger>
                <SelectValue placeholder="Pick a student" />
              </SelectTrigger>
              <SelectContent>
                {(students.data ?? []).map((student: any) => (
                  <SelectItem key={student.id} value={student.id}>
                    {student.full_name} {student.category === "unza" ? "- UNZA" : "- Non-UNZA"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-semibold">Course</Label>
            <Select value={courseId} onValueChange={setCourse}>
              <SelectTrigger>
                <SelectValue placeholder="Pick a course" />
              </SelectTrigger>
              <SelectContent>
                {(courses.data ?? []).map((course: any) => (
                  <SelectItem key={course.id} value={course.id}>
                    {course.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedStudent && selectedCourse && (
            <div className="rounded-[1.35rem] border border-border/70 bg-white/72 p-4 text-sm shadow-[var(--shadow-soft)]">
              Suggested fee for{" "}
              <strong>
                {selectedStudent.category === "unza" ? "UNZA" : "Non-UNZA"}
              </strong>{" "}
              student:{" "}
              <strong>
                {suggestedFee != null ? `K${suggestedFee.toLocaleString()}` : "-"}
              </strong>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="fee" className="text-sm font-semibold">
                Fee charged (ZMW)
              </Label>
              <Input
                id="fee"
                type="number"
                min="0"
                step="0.01"
                placeholder={suggestedFee != null ? String(suggestedFee) : "0.00"}
                value={overrideFee}
                onChange={(event) => setOverrideFee(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Payment status</Label>
              <Select
                value={paymentStatus}
                onValueChange={(value) => setPaymentStatus(value as PaymentStatus)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
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
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Creating..." : "Enrol student"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
