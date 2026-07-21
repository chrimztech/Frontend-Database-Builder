import { useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Award,
  ChevronDown,
  ChevronRight,
  Pencil,
  Plus,
  Search,
  Shield,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api";
import {
  AdminEmptyState,
  AdminPageHeader,
  AdminPanel,
  AdminPanelHeader,
  AdminStat,
} from "@/components/admin/admin-ui";
import { CsvImportDialog } from "@/components/admin/csv-import-dialog";

type StudentCategory = "unza" | "non_unza";
type Student = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  national_id: string | null;
  category: StudentCategory;
  unza_student_id: string | null;
  pii_consent_at: string | null;
  pii_consent_source: string | null;
  notes: string | null;
  created_at: string;
};
type EnrolmentStatus = "enrolled" | "in_progress" | "completed" | "certified";
type PaymentStatus = "pending" | "paid" | "waived" | "free";
type StudentEnrolment = {
  id: string;
  status: EnrolmentStatus;
  enrolled_at: string;
  completed_at: string | null;
  certificate_id: string | null;
  fee_charged: number | null;
  payment_status: PaymentStatus;
  course: { id: string; name: string; prefix: string } | null;
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
  certified: "bg-emerald-500/15 text-emerald-700",
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

async function logAccess(
  action: "view" | "create" | "update" | "delete" | "export",
  studentId: string | null,
  detail?: string,
) {
  await apiPost("/reports/audit-log", {
    student_id: studentId, action, detail: detail ?? null,
  }).catch(() => {});
}

export function StudentsTab() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<"all" | StudentCategory>("all");

  const students = useQuery({
    queryKey: ["admin-students"],
    queryFn: async () => {
      const data = await apiGet<Student[]>("/students");
      return [...data].sort((a, b) => b.created_at.localeCompare(a.created_at));
    },
  });

  const fullList = students.data ?? [];
  const filtered = fullList.filter((student) => {
    if (category !== "all" && student.category !== category) return false;
    if (!search.trim()) return true;
    const query = search.toLowerCase();
    return (
      student.full_name.toLowerCase().includes(query) ||
      (student.email ?? "").toLowerCase().includes(query) ||
      (student.national_id ?? "").toLowerCase().includes(query) ||
      (student.unza_student_id ?? "").toLowerCase().includes(query)
    );
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin-students"] });
  const counts = {
    total:   fullList.length,
    unza:    fullList.filter((student) => student.category === "unza").length,
    nonUnza: fullList.filter((student) => student.category === "non_unza").length,
  };

  return (
    <div className="space-y-8">
      <AdminPageHeader
        eyebrow="People"
        title="Student records"
        description="Manage student identity data, category-based fee eligibility, and the audit-sensitive personal details used in enrolment and certification."
        actions={
          <div className="flex gap-2">
            <CsvImportDialog onImported={refresh} />
            <StudentDialog onSaved={refresh} />
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AdminStat label="Students" value={counts.total} hint="Total student records stored in the registry" />
        <AdminStat label="UNZA" value={counts.unza} hint="Students eligible for UNZA fee treatment" />
        <AdminStat label="Non-UNZA" value={counts.nonUnza} hint="External students and standard-fee learners" />
        <AdminStat label="Protected" value="Audit" hint="Personal data access remains admin-only and logged" />
      </div>

      <AdminPanel>
        <AdminPanelHeader
          title="Student directory"
          description="Search by name, email, national ID, or UNZA student ID, then expand a record to inspect course history."
          actions={
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
              <Select
                value={category}
                onValueChange={(value) => setCategory(value as "all" | StudentCategory)}
              >
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  <SelectItem value="unza">UNZA students</SelectItem>
                  <SelectItem value="non_unza">Non-UNZA students</SelectItem>
                </SelectContent>
              </Select>
              <div className="relative w-full sm:w-72">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search students..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
          }
        />

        <div className="border-b border-border/70 px-5 py-4 text-sm text-muted-foreground sm:px-6">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            All records are admin-only and access is logged for audit.
          </div>
        </div>

        <div className="px-5 py-5 sm:px-6">
          {students.isLoading ? (
            <div className="text-sm text-muted-foreground">Loading students...</div>
          ) : filtered.length === 0 ? (
            <AdminEmptyState
              title="No students match"
              description={
                fullList.length === 0
                  ? "Add the first student record to begin managing enrolments and certification."
                  : "Try a different filter or search term to find the student record you need."
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>UNZA / National ID</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((student) => (
                  <StudentRow key={student.id} student={student} onChange={refresh} />
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </AdminPanel>
    </div>
  );
}

function StudentRow({ student, onChange }: { student: Student; onChange: () => void }) {
  const [expanded, setExpanded] = useState(false);

  const enrolments = useQuery({
    queryKey: ["student-enrolments", student.id],
    enabled: expanded,
    queryFn: async () => {
      await logAccess("view", student.id, "view courses");
      return apiGet<StudentEnrolment[]>(`/enrolments?studentId=${student.id}`);
    },
  });

  async function remove() {
    if (!window.confirm(`Delete ${student.full_name}? Their enrolments will also be removed.`)) return;
    await logAccess("delete", student.id, student.full_name);
    try {
      await apiDelete(`/students/${student.id}`);
      toast.success("Student deleted");
      onChange();
    } catch (error: any) {
      toast.error(error.message ?? "Failed");
    }
  }

  const idDisplay = student.category === "unza" ? student.unza_student_id ?? "-" : student.national_id ?? "-";
  const enrolmentCount = enrolments.data?.length;

  return (
    <>
      <TableRow
        className="cursor-pointer"
        onClick={() => setExpanded((current) => !current)}
      >
        <TableCell className="pr-0">
          {expanded
            ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
            : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        </TableCell>
        <TableCell>
          <div className="font-medium">{student.full_name}</div>
          {expanded && enrolmentCount !== undefined ? (
            <div className="mt-1 text-xs text-muted-foreground">
              {enrolmentCount === 0
                ? "No enrolments"
                : `${enrolmentCount} course${enrolmentCount !== 1 ? "s" : ""}`}
            </div>
          ) : null}
        </TableCell>
        <TableCell>
          {student.category === "unza"
            ? <Badge className="bg-accent text-accent-foreground">UNZA</Badge>
            : <Badge variant="outline">Non-UNZA</Badge>}
        </TableCell>
        <TableCell className="text-muted-foreground">{student.email ?? "-"}</TableCell>
        <TableCell className="text-muted-foreground">{student.phone ?? "-"}</TableCell>
        <TableCell className="font-mono text-xs text-muted-foreground">{idDisplay}</TableCell>
        <TableCell className="text-right" onClick={(event) => event.stopPropagation()}>
          <div className="flex justify-end gap-2">
            <StudentDialog
              onSaved={onChange}
              student={student}
              trigger={<Button size="sm" variant="outline"><Pencil className="h-4 w-4" /></Button>}
            />
            <Button size="sm" variant="outline" onClick={remove}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        </TableCell>
      </TableRow>

      {expanded ? (
        <TableRow className="bg-primary/[0.03] hover:bg-primary/[0.03]">
          <TableCell colSpan={7} className="pb-5 pt-1">
            <div className="rounded-[1.35rem] border border-border/70 bg-white/72 p-5 shadow-[var(--shadow-soft)]">
              {enrolments.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading course history...</p>
              ) : !enrolments.data || enrolments.data.length === 0 ? (
                <p className="text-sm leading-6 text-muted-foreground">
                  This student has no enrolments yet. Use the <strong>Enrolments</strong>{" "}
                  workspace to add one.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/70 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        <th className="py-3 pr-4">Course</th>
                        <th className="py-3 pr-4">Status</th>
                        <th className="py-3 pr-4">Enrolled</th>
                        <th className="py-3 pr-4">Fee</th>
                        <th className="py-3 pr-4">Payment</th>
                        <th className="py-3">Certificate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {enrolments.data.map((enrolment) => (
                        <tr key={enrolment.id} className="border-b border-border/60 last:border-0">
                          <td className="py-3 pr-4 font-medium">{enrolment.course?.name ?? "-"}</td>
                          <td className="py-3 pr-4">
                            <span className={`inline-flex rounded-full px-3 py-1 text-[11px] font-semibold tracking-[0.12em] ${STATUS_BADGE[enrolment.status]}`}>
                              {STATUS_LABEL[enrolment.status]}
                            </span>
                          </td>
                          <td className="py-3 pr-4 text-sm text-muted-foreground">
                            {new Date(enrolment.enrolled_at).toLocaleDateString()}
                          </td>
                          <td className="py-3 pr-4 font-mono text-xs text-muted-foreground">
                            {enrolment.fee_charged != null
                              ? `K${Number(enrolment.fee_charged).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                              : "-"}
                          </td>
                          <td className="py-3 pr-4">
                            <span className={`inline-flex rounded-full px-3 py-1 text-[11px] font-semibold tracking-[0.12em] ${PAY_TONE[enrolment.payment_status]}`}>
                              {PAY_LABEL[enrolment.payment_status]}
                            </span>
                          </td>
                          <td className="py-3">
                            {enrolment.status === "certified" && enrolment.certificate_id ? (
                              <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                                <Award className="h-3.5 w-3.5" /> Issued
                              </span>
                            ) : (
                              <span className="text-sm text-muted-foreground">-</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}

function StudentDialog({
  onSaved,
  student,
  trigger,
}: {
  onSaved: () => void;
  student?: Student;
  trigger?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fullName, setFullName] = useState(student?.full_name ?? "");
  const [email, setEmail] = useState(student?.email ?? "");
  const [phone, setPhone] = useState(student?.phone ?? "");
  const [category, setCategory] = useState<StudentCategory>(
    student?.category ?? "non_unza",
  );
  const [unzaStudentId, setUnzaId] = useState(student?.unza_student_id ?? "");
  const [nationalId, setNationalId] = useState(student?.national_id ?? "");
  const [consent, setConsent] = useState(Boolean(student?.pii_consent_at));
  const [notes, setNotes] = useState(student?.notes ?? "");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      if (!fullName.trim()) {
        throw new Error("Name is required");
      }
      if (category === "unza" && !unzaStudentId.trim()) {
        throw new Error("UNZA student ID is required for UNZA students");
      }
      if (!nationalId.trim()) {
        throw new Error("NRC number is required");
      }
      if (!consent) {
        throw new Error(
          "You must confirm the student has consented to storing their details",
        );
      }

      const payload = {
        full_name: fullName.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        category,
        unza_student_id: category === "unza" ? unzaStudentId.trim() : null,
        national_id: nationalId.trim() || null,
        notes: notes.trim() || null,
        pii_consent_at: student?.pii_consent_at ?? new Date().toISOString(),
        pii_consent_source: student?.pii_consent_source ?? "admin-confirmed",
      };

      if (student) {
        await apiPut(`/students/${student.id}`, payload);

        await logAccess("update", student.id, "edit details");
        toast.success("Student updated");
      } else {
        const created = await apiPost<{ id: string }>("/students", payload);

        await logAccess("create", created?.id ?? null, payload.full_name);
        toast.success("Student added");
        setFullName("");
        setEmail("");
        setPhone("");
        setUnzaId("");
        setNationalId("");
        setNotes("");
      }

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
        {trigger ?? (
          <Button>
            <Plus className="mr-1 h-4 w-4" />
            Add student
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{student ? "Edit student" : "Add a student"}</DialogTitle>
          <DialogDescription>
            Personal data is visible only to authorised admins and is handled as
            audit-sensitive information.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Category" htmlFor="student-category">
            <Select
              value={category}
              onValueChange={(value) => setCategory(value as StudentCategory)}
            >
              <SelectTrigger id="student-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unza">UNZA student (subsidised fee)</SelectItem>
                <SelectItem value="non_unza">Non-UNZA student (full fee)</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field label="Full name" htmlFor="student-name">
            <Input
              id="student-name"
              required
              maxLength={120}
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
            />
          </Field>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Email" htmlFor="student-email">
              <Input
                id="student-email"
                type="email"
                maxLength={160}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </Field>
            <Field label="Phone" htmlFor="student-phone">
              <Input
                id="student-phone"
                maxLength={40}
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
              />
            </Field>
          </div>

          {category === "unza" && (
            <Field label="UNZA student ID *" htmlFor="student-unza">
              <Input
                id="student-unza"
                required
                maxLength={40}
                value={unzaStudentId}
                onChange={(event) => setUnzaId(event.target.value)}
                placeholder="e.g. 2021123456"
              />
            </Field>
          )}

          <Field label="NRC Number *" htmlFor="student-national">
            <Input
              id="student-national"
              required
              maxLength={60}
              value={nationalId}
              onChange={(event) => setNationalId(event.target.value)}
              placeholder="e.g. 123456/78/9"
            />
          </Field>

          <Field label="Notes" htmlFor="student-notes">
            <Textarea
              id="student-notes"
              rows={3}
              maxLength={1000}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </Field>

          <label className="flex items-start gap-3 rounded-[1.35rem] border border-border/70 bg-white/72 p-4 text-sm leading-6 text-muted-foreground shadow-[var(--shadow-soft)]">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 rounded border-border"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
            />
            <span>
              I confirm this student has consented to having their personal details
              stored and used for course administration and certification.
            </span>
          </label>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving..." : "Save student"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor} className="text-sm font-semibold">
        {label}
      </Label>
      {children}
    </div>
  );
}
