import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Search, Shield, ChevronDown, ChevronRight, Award } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";

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
type PaymentStatus  = "pending" | "paid" | "waived" | "free";

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
  enrolled: "Enrolled", in_progress: "In progress", completed: "Completed", certified: "Certified",
};
const STATUS_BADGE: Record<EnrolmentStatus, string> = {
  enrolled: "bg-muted text-foreground",
  in_progress: "bg-primary/15 text-primary",
  completed: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  certified: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
};
const PAY_LABEL: Record<PaymentStatus, string> = {
  pending: "Pending", paid: "Paid", waived: "Waived", free: "Free",
};
const PAY_TONE: Record<PaymentStatus, string> = {
  pending: "bg-amber-500/15 text-amber-700",
  paid: "bg-emerald-500/15 text-emerald-700",
  waived: "bg-muted text-muted-foreground",
  free: "bg-sky-500/15 text-sky-700",
};

async function logAccess(action: "view" | "create" | "update" | "delete" | "export", studentId: string | null, detail?: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("student_access_log").insert({
    student_id: studentId,
    actor_id: user.id,
    action,
    detail: detail ?? null,
  }).then(() => {}, () => {});
}

export function StudentsTab() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<"all" | StudentCategory>("all");

  const students = useQuery({
    queryKey: ["admin-students"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Student[];
    },
  });

  const filtered = (students.data ?? []).filter((s) => {
    if (category !== "all" && s.category !== category) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      s.full_name.toLowerCase().includes(q) ||
      (s.email ?? "").toLowerCase().includes(q) ||
      (s.national_id ?? "").toLowerCase().includes(q) ||
      (s.unza_student_id ?? "").toLowerCase().includes(q)
    );
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-students"] });

  const counts = {
    total: students.data?.length ?? 0,
    unza: (students.data ?? []).filter((s) => s.category === "unza").length,
    nonUnza: (students.data ?? []).filter((s) => s.category === "non_unza").length,
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-display">Students</h2>
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Shield className="h-3.5 w-3.5" />
            All records are admin-only. Access is logged for audit.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="secondary">Total {counts.total}</Badge>
            <Badge variant="secondary">UNZA {counts.unza}</Badge>
            <Badge variant="secondary">Non-UNZA {counts.nonUnza}</Badge>
          </div>
          <Select value={category} onValueChange={(v) => setCategory(v as any)}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              <SelectItem value="unza">UNZA students</SelectItem>
              <SelectItem value="non_unza">Non-UNZA students</SelectItem>
            </SelectContent>
          </Select>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 w-56" />
          </div>
          <StudentDialog onSaved={refresh} />
        </div>
      </div>

      <div className="rounded-lg border bg-card overflow-hidden">
        {students.isLoading ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">No students match.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-6" />
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>UNZA / National ID</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((s) => (
                <StudentRow key={s.id} student={s} onChange={refresh} />
              ))}
            </TableBody>
          </Table>
        )}
      </div>
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
      const { data, error } = await supabase
        .from("enrolments")
        .select(`
          id, status, enrolled_at, completed_at, certificate_id, fee_charged, payment_status,
          course:courses ( id, name, prefix )
        `)
        .eq("student_id", student.id)
        .order("enrolled_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as StudentEnrolment[];
    },
  });

  async function remove() {
    if (!window.confirm(`Delete ${student.full_name}? Their enrolments will also be removed.`)) return;
    await logAccess("delete", student.id, student.full_name);
    const { error } = await supabase.from("students").delete().eq("id", student.id);
    if (error) toast.error(error.message);
    else { toast.success("Student deleted"); onChange(); }
  }

  const idDisplay = student.category === "unza"
    ? (student.unza_student_id ?? "—")
    : (student.national_id ?? "—");

  const enrolCount = enrolments.data?.length;

  return (
    <>
      <TableRow
        className="cursor-pointer hover:bg-muted/50"
        onClick={() => setExpanded((v) => !v)}
      >
        <TableCell className="pr-0">
          {expanded
            ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
            : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        </TableCell>
        <TableCell>
          <div className="font-medium">{student.full_name}</div>
          {expanded && enrolCount !== undefined && (
            <div className="text-xs text-muted-foreground mt-0.5">
              {enrolCount === 0 ? "No enrolments" : `${enrolCount} course${enrolCount !== 1 ? "s" : ""}`}
            </div>
          )}
        </TableCell>
        <TableCell>
          {student.category === "unza"
            ? <Badge className="bg-accent text-accent-foreground">UNZA</Badge>
            : <Badge variant="outline">Non-UNZA</Badge>}
        </TableCell>
        <TableCell className="text-muted-foreground">{student.email ?? "—"}</TableCell>
        <TableCell className="text-muted-foreground">{student.phone ?? "—"}</TableCell>
        <TableCell className="text-muted-foreground font-mono text-xs">{idDisplay}</TableCell>
        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
          <div className="flex justify-end gap-1">
            <StudentDialog onSaved={onChange} student={student} trigger={
              <Button size="sm" variant="ghost"><Pencil className="h-4 w-4" /></Button>
            } />
            <Button size="sm" variant="ghost" onClick={remove}><Trash2 className="h-4 w-4 text-destructive" /></Button>
          </div>
        </TableCell>
      </TableRow>

      {expanded && (
        <TableRow className="bg-muted/20 hover:bg-muted/20">
          <TableCell colSpan={7} className="py-0">
            <div className="px-8 py-3">
              {enrolments.isLoading ? (
                <p className="text-xs text-muted-foreground py-2">Loading courses…</p>
              ) : !enrolments.data || enrolments.data.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">
                  This student has no enrolments yet. Go to the <strong>Enrolments</strong> tab to add one.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground">
                      <th className="text-left py-1.5 pr-4 font-medium">Course</th>
                      <th className="text-left py-1.5 pr-4 font-medium">Status</th>
                      <th className="text-left py-1.5 pr-4 font-medium">Enrolled</th>
                      <th className="text-left py-1.5 pr-4 font-medium">Fee</th>
                      <th className="text-left py-1.5 pr-4 font-medium">Payment</th>
                      <th className="text-left py-1.5 font-medium">Certificate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {enrolments.data.map((e) => (
                      <tr key={e.id} className="border-b last:border-0">
                        <td className="py-2 pr-4 font-medium">{e.course?.name ?? "—"}</td>
                        <td className="py-2 pr-4">
                          <span className={`inline-block text-xs px-2 py-0.5 rounded font-medium ${STATUS_BADGE[e.status]}`}>
                            {STATUS_LABEL[e.status]}
                          </span>
                        </td>
                        <td className="py-2 pr-4 text-muted-foreground text-xs">
                          {new Date(e.enrolled_at).toLocaleDateString()}
                        </td>
                        <td className="py-2 pr-4 text-muted-foreground font-mono text-xs">
                          {e.fee_charged != null ? `K${Number(e.fee_charged).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : "—"}
                        </td>
                        <td className="py-2 pr-4">
                          <span className={`inline-block text-xs px-2 py-0.5 rounded ${PAY_TONE[e.payment_status]}`}>
                            {PAY_LABEL[e.payment_status]}
                          </span>
                        </td>
                        <td className="py-2">
                          {e.status === "certified" && e.certificate_id ? (
                            <span className="flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
                              <Award className="h-3.5 w-3.5" /> Issued
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

function StudentDialog({ onSaved, student, trigger }: { onSaved: () => void; student?: Student; trigger?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [full_name, setFullName] = useState(student?.full_name ?? "");
  const [email, setEmail] = useState(student?.email ?? "");
  const [phone, setPhone] = useState(student?.phone ?? "");
  const [category, setCategory] = useState<StudentCategory>(student?.category ?? "non_unza");
  const [unza_student_id, setUnzaId] = useState(student?.unza_student_id ?? "");
  const [national_id, setNationalId] = useState(student?.national_id ?? "");
  const [consent, setConsent] = useState(!!student?.pii_consent_at);
  const [notes, setNotes] = useState(student?.notes ?? "");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (!full_name.trim()) throw new Error("Name is required");
      if (category === "unza" && !unza_student_id.trim()) throw new Error("UNZA student ID is required for UNZA students");
      if (!consent) throw new Error("You must confirm the student has consented to storing their details");

      const payload = {
        full_name: full_name.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        category,
        unza_student_id: category === "unza" ? unza_student_id.trim() : null,
        national_id: national_id.trim() || null,
        notes: notes.trim() || null,
        pii_consent_at: student?.pii_consent_at ?? new Date().toISOString(),
        pii_consent_source: student?.pii_consent_source ?? "admin-confirmed",
      };
      if (student) {
        const { error } = await supabase.from("students").update(payload).eq("id", student.id);
        if (error) throw error;
        await logAccess("update", student.id, "edit details");
        toast.success("Student updated");
      } else {
        const { data, error } = await supabase.from("students").insert(payload).select("id").single();
        if (error) throw error;
        await logAccess("create", data?.id ?? null, payload.full_name);
        toast.success("Student added");
        setFullName(""); setEmail(""); setPhone(""); setUnzaId(""); setNationalId(""); setNotes("");
      }
      onSaved();
      setOpen(false);
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button className="bg-accent text-accent-foreground hover:bg-accent/90">
            <Plus className="h-4 w-4 mr-1" /> Add student
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{student ? "Edit student" : "Add a student"}</DialogTitle>
          <DialogDescription>Personal data is encrypted in transit and only visible to admins.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <Label>Category</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as StudentCategory)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="unza">UNZA student (subsidized fee)</SelectItem>
                <SelectItem value="non_unza">Non-UNZA student (full fee)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="fn">Full name</Label>
            <Input id="fn" required maxLength={120} value={full_name} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="em">Email</Label>
              <Input id="em" type="email" maxLength={160} value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="ph">Phone</Label>
              <Input id="ph" maxLength={40} value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
          {category === "unza" ? (
            <div>
              <Label htmlFor="uz">UNZA student ID *</Label>
              <Input id="uz" required maxLength={40} value={unza_student_id} onChange={(e) => setUnzaId(e.target.value)} placeholder="e.g. 2021123456" />
            </div>
          ) : (
            <div>
              <Label htmlFor="ni">National ID (optional)</Label>
              <Input id="ni" maxLength={60} value={national_id} onChange={(e) => setNationalId(e.target.value)} />
            </div>
          )}
          <div>
            <Label htmlFor="nt">Notes</Label>
            <Textarea id="nt" rows={2} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <label className="flex items-start gap-2 text-xs text-muted-foreground rounded border p-2 bg-muted/30">
            <input type="checkbox" className="mt-0.5" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>I confirm this student has consented to having their personal details stored and used for course administration and certification.</span>
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={busy} className="bg-accent text-accent-foreground hover:bg-accent/90">
              {busy ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
