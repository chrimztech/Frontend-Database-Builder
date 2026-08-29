import { useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Award, Check, CheckCheck, ChevronsUpDown, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";
import { generateCertificate as generateCertificateServer } from "@/lib/api/certificates.functions";
import {
  AdminEmptyState,
  AdminPageHeader,
  AdminPanel,
  AdminPanelHeader,
  AdminStat,
} from "@/components/admin/admin-ui";
import { cn } from "@/lib/utils";

type EnrolmentStatus = "enrolled" | "in_progress" | "completed" | "certified";
type PaymentStatus = "pending" | "paid" | "waived" | "free";

type Enrolment = {
  id: string;
  status: EnrolmentStatus;
  enrolled_at: string;
  completed_at: string | null;
  certificate: { id: string; certificate_code: string | null } | null;
  fee_charged: number | null;
  payment_status: PaymentStatus;
  student: {
    id: string;
    full_name: string;
    email: string | null;
    national_id: string | null;
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
  if (value == null) return "-";
  return `K${Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function EnrolmentsTab() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"all" | EnrolmentStatus>("all");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const enrolments = useQuery({
    queryKey: ["admin-enrolments"],
    queryFn: async () => {
      const data = await apiGet<Enrolment[]>("/enrolments");
      return [...data].sort((a, b) => b.enrolled_at.localeCompare(a.enrolled_at));
    },
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-enrolments"] });
    queryClient.invalidateQueries({ queryKey: ["admin-certs"] });
    queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
    setSelectedIds(new Set());
  };

  const list = enrolments.data ?? [];
  const byStatus = tab === "all" ? list : list.filter((row) => row.status === tab);
  const query = search.trim().toLowerCase();
  const filtered = !query
    ? byStatus
    : byStatus.filter((row) => {
        const haystack = [
          row.student?.full_name,
          row.student?.email,
          row.student?.national_id,
          row.course?.name,
          row.course?.prefix,
          row.certificate?.certificate_code,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(query);
      });
  const counts = {
    all: list.length,
    enrolled: list.filter((r) => r.status === "enrolled").length,
    in_progress: list.filter((r) => r.status === "in_progress").length,
    completed: list.filter((r) => r.status === "completed").length,
    certified: list.filter((r) => r.status === "certified").length,
  };

  // Enrolled rows can be bulk-started, in-progress rows can be bulk-completed —
  // both are selectable together so "select all" works from any tab (including "All").
  const startableIds = filtered.filter((r) => r.status === "enrolled").map((r) => r.id);
  const completableIds = filtered.filter((r) => r.status === "in_progress").map((r) => r.id);
  const selectableIds = [...startableIds, ...completableIds];
  const allSelected =
    selectableIds.length > 0 && selectableIds.every((id) => selectedIds.has(id));
  const selectedStartIds = startableIds.filter((id) => selectedIds.has(id));
  const selectedCompleteIds = completableIds.filter((id) => selectedIds.has(id));

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectableIds));
    }
  }

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function bulkStart() {
    if (selectedStartIds.length === 0) return;
    setBulkBusy(true);
    try {
      await apiPost("/enrolments/bulk-start", { ids: selectedStartIds });
      toast.success(`${selectedStartIds.length} enrolment(s) marked In progress`);
      refresh();
    } catch (err: any) {
      toast.error(err.message ?? "Bulk update failed");
    } finally {
      setBulkBusy(false);
    }
  }

  async function bulkComplete() {
    if (selectedCompleteIds.length === 0) return;
    setBulkBusy(true);
    try {
      await apiPost("/enrolments/bulk-complete", { ids: selectedCompleteIds });
      toast.success(`${selectedCompleteIds.length} enrolment(s) marked Completed`);
      refresh();
    } catch (err: any) {
      toast.error(err.message ?? "Bulk update failed");
    } finally {
      setBulkBusy(false);
    }
  }

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

      <Tabs value={tab} onValueChange={(v) => { setTab(v as "all" | EnrolmentStatus); setSelectedIds(new Set()); }}>
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
              actions={
                <div className="relative w-full sm:w-80">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Search by student, email, NRC, or course..."
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </div>
              }
            />

            {/* Bulk action bar */}
            {selectedIds.size > 0 && (
              <div className="flex flex-wrap items-center gap-3 border-b border-border bg-primary/5 px-5 py-3 sm:px-6">
                <span className="text-sm font-medium text-primary">
                  {selectedIds.size} selected
                </span>
                {selectedStartIds.length > 0 && (
                  <Button size="sm" disabled={bulkBusy} onClick={bulkStart}>
                    <ArrowRight className="mr-1 h-3 w-3" />
                    {bulkBusy ? "Updating..." : `Start ${selectedStartIds.length} course${selectedStartIds.length === 1 ? "" : "s"}`}
                  </Button>
                )}
                {selectedCompleteIds.length > 0 && (
                  <Button size="sm" disabled={bulkBusy} onClick={bulkComplete}>
                    <CheckCheck className="mr-1 h-3 w-3" />
                    {bulkBusy ? "Updating..." : `Mark ${selectedCompleteIds.length} completed`}
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
                  Clear
                </Button>
              </div>
            )}

            <div className="px-5 py-5 sm:px-6">
              {enrolments.isLoading ? (
                <div className="text-sm text-muted-foreground">Loading enrolments...</div>
              ) : filtered.length === 0 ? (
                <AdminEmptyState
                  title={query ? "No matches" : "Nothing in this stage"}
                  description={
                    query
                      ? "Try a different search term."
                      : "When learners move into this status, they will appear here automatically."
                  }
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        {selectableIds.length > 0 && (
                          <Checkbox
                            checked={allSelected}
                            onCheckedChange={toggleSelectAll}
                            aria-label="Select all"
                          />
                        )}
                      </TableHead>
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
                      <EnrolRow
                        key={row.id}
                        enrolment={row}
                        onChange={refresh}
                        selected={selectedIds.has(row.id)}
                        onToggle={() => toggleOne(row.id)}
                      />
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
  selected,
  onToggle,
}: {
  enrolment: Enrolment;
  onChange: () => void;
  selected: boolean;
  onToggle: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function setStatus(status: EnrolmentStatus) {
    setBusy(true);
    try {
      await apiPatch(`/enrolments/${enrolment.id}/status`, { status });
      toast.success(`Marked ${STATUS_LABEL[status]}`);
      onChange();
    } catch (err: any) {
      toast.error(err.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function generateCertificate() {
    if (!enrolment.student || !enrolment.course) return;
    setBusy(true);
    try {
      const [cert] = await Promise.all([
        generateCertificateServer({ data: { enrolmentId: enrolment.id } }),
        import("@/lib/font-loader").then(({ preloadCustomFonts }) => preloadCustomFonts()),
      ]);
      await import("@/lib/branding").then(({ loadBranding }) =>
        loadBranding(cert.certificate_type).catch(() => null),
      );
      const { uploadCertificatePdf } = await import("@/lib/pdf");
      await uploadCertificatePdf({
        certificateId: cert.certificate_code,
        certificateType: cert.certificate_type,
        recipientName: enrolment.student.full_name,
        programme: enrolment.course.name,
        issueDate: new Date().toISOString().slice(0, 10),
        nrcNumber: enrolment.student.national_id ?? undefined,
      });
      // Certificate generation already marks the enrolment certified server-side.
      toast.success(`Certificate ${cert.certificate_code} generated`);
      onChange();
    } catch (err: any) {
      toast.error(err.message ?? "Failed to generate");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm("Remove this enrolment?")) return;
    try {
      await apiDelete(`/enrolments/${enrolment.id}`);
      toast.success("Enrolment removed");
      onChange();
    } catch (error: any) {
      toast.error(error.message ?? "Failed");
    }
  }

  async function cyclePayment() {
    const order: PaymentStatus[] = ["pending", "paid", "waived", "free"];
    const next = order[(order.indexOf(enrolment.payment_status) + 1) % order.length];
    try {
      await apiPatch(`/enrolments/${enrolment.id}/payment`, { payment_status: next });
      toast.success(`Payment: ${PAY_LABEL[next]}`);
      onChange();
    } catch (error: any) {
      toast.error(error.message ?? "Failed");
    }
  }

  const canSelect = enrolment.status === "enrolled" || enrolment.status === "in_progress";

  return (
    <TableRow className={selected ? "bg-primary/5" : undefined}>
      <TableCell>
        {canSelect && (
          <Checkbox checked={selected} onCheckedChange={onToggle} aria-label="Select row" />
        )}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2 font-medium">
          {enrolment.student?.full_name ?? "-"}
          {enrolment.student?.category === "unza" ? (
            <Badge className="bg-accent text-accent-foreground">UNZA</Badge>
          ) : (
            <Badge variant="outline">Non-UNZA</Badge>
          )}
        </div>
        <div className="mt-1 text-sm text-muted-foreground">{enrolment.student?.email ?? ""}</div>
      </TableCell>
      <TableCell>{enrolment.course?.name ?? "-"}</TableCell>
      <TableCell className="text-muted-foreground">
        {new Date(enrolment.enrolled_at).toLocaleDateString()}
      </TableCell>
      <TableCell className="font-mono text-xs">{fmtZmw(enrolment.fee_charged)}</TableCell>
      <TableCell>
        <button onClick={cyclePayment} disabled={busy} title="Click to cycle payment status">
          <span className={`inline-flex rounded-full px-3 py-1 text-[11px] font-semibold tracking-[0.12em] ${PAY_TONE[enrolment.payment_status]}`}>
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
              Start <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          )}
          {enrolment.status === "in_progress" && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setStatus("completed")}>
              Mark completed <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          )}
          {enrolment.status === "completed" && !enrolment.certificate && (
            <Button size="sm" disabled={busy} onClick={generateCertificate}>
              <Award className="mr-1 h-4 w-4" /> Generate certificate
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

// Searchable combobox for student selection
function StudentCombobox({
  students,
  value,
  onChange,
}: {
  students: { id: string; full_name: string; category: string }[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = students.filter((s) =>
    s.full_name.toLowerCase().includes(search.toLowerCase()),
  );

  const selected = students.find((s) => s.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          {selected ? (
            <span>
              {selected.full_name}{" "}
              <span className="text-muted-foreground text-xs">
                — {selected.category === "unza" ? "UNZA" : "Non-UNZA"}
              </span>
            </span>
          ) : (
            <span className="text-muted-foreground">Search for a student...</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Type a name to search..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            {filtered.length === 0 ? (
              <CommandEmpty>No student found.</CommandEmpty>
            ) : (
              <CommandGroup>
                {filtered.map((s) => (
                  <CommandItem
                    key={s.id}
                    value={s.id}
                    onSelect={() => {
                      onChange(s.id);
                      setSearch("");
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn("mr-2 h-4 w-4", value === s.id ? "opacity-100" : "opacity-0")}
                    />
                    {s.full_name}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {s.category === "unza" ? "UNZA" : "Non-UNZA"}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function EnrolDialog({
  onSaved,
  presetStudent,
  trigger,
}: {
  onSaved: () => void;
  presetStudent?: { id: string; full_name: string; category: string };
  trigger?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [studentId, setStudent] = useState(presetStudent?.id ?? "");
  const [courseIds, setCourseIds] = useState<Set<string>>(new Set());
  const [courseFilter, setCourseFilter] = useState("");
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("pending");
  const [feeOverrides, setFeeOverrides] = useState<Record<string, string>>({});

  const students = useQuery({
    queryKey: ["enrol-students"],
    enabled: open && !presetStudent,
    queryFn: async () => {
      const data = await apiGet<{ id: string; full_name: string; category: string }[]>("/students");
      return [...data].sort((a, b) => a.full_name.localeCompare(b.full_name));
    },
  });

  const courses = useQuery({
    queryKey: ["enrol-courses"],
    enabled: open,
    queryFn: async () => {
      const data = await apiGet<
        { id: string; name: string; fee_unza: number | null; fee_non_unza: number | null; category: string }[]
      >("/courses?active=true");
      return [...data].sort((a, b) => a.name.localeCompare(b.name));
    },
  });

  const selectedStudent = presetStudent ?? (students.data ?? []).find((s: any) => s.id === studentId);
  const courseList = courses.data ?? [];
  const filteredCourses = courseFilter.trim()
    ? courseList.filter((c: any) => c.name.toLowerCase().includes(courseFilter.trim().toLowerCase()))
    : courseList;

  function suggestedFeeFor(course: any): number | null {
    if (!selectedStudent) return null;
    return selectedStudent.category === "unza" ? course.fee_unza : course.fee_non_unza;
  }

  function toggleCourse(id: string) {
    setCourseIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const totalFee = [...courseIds].reduce((sum, id) => {
    const course = courseList.find((c: any) => c.id === id);
    if (!course) return sum;
    const override = feeOverrides[id];
    const fee = override?.trim() ? Number(override) : suggestedFeeFor(course);
    return sum + (fee != null && !Number.isNaN(fee) ? fee : 0);
  }, 0);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!studentId) return toast.error("Pick a student");
    if (courseIds.size === 0) return toast.error("Pick at least one course");
    setBusy(true);
    let ok = 0;
    let fail = 0;
    for (const id of courseIds) {
      const course = courseList.find((c: any) => c.id === id);
      const override = feeOverrides[id];
      const suggested = course ? suggestedFeeFor(course) : null;
      const fee = override?.trim() ? Number(override) : suggested;
      const feeCharged = fee == null || Number.isNaN(fee) ? null : fee;
      const autoPaymentStatus: PaymentStatus = feeCharged === 0 ? "free" : paymentStatus;
      try {
        await apiPost("/enrolments", {
          student_id: studentId,
          course_id: id,
          fee_charged: feeCharged,
          payment_status: autoPaymentStatus,
        });
        ok++;
      } catch (err: any) {
        fail++;
        toast.error(`${course?.name ?? "Course"}: ${err.message ?? "failed"}`);
      }
    }
    setBusy(false);
    if (ok > 0) toast.success(`Enrolled in ${ok} course${ok !== 1 ? "s" : ""}`);
    if (fail > 0 && ok === 0) return; // nothing succeeded — leave the dialog open to retry
    setStudent(presetStudent?.id ?? "");
    setCourseIds(new Set());
    setFeeOverrides({});
    setCourseFilter("");
    setPaymentStatus("pending");
    onSaved();
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <Plus className="mr-1 h-4 w-4" />
            New enrolment
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Enrol a student</DialogTitle>
          <DialogDescription>
            Pick one or more courses — the student is enrolled in all of them at once. Fee is
            suggested automatically from the student category and each course's fee schedule.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Student</Label>
            {presetStudent ? (
              <div className="flex items-center gap-2 rounded-md border border-input bg-muted/40 px-3 py-2 text-sm">
                {presetStudent.full_name}
                <Badge variant={presetStudent.category === "unza" ? "secondary" : "outline"}>
                  {presetStudent.category === "unza" ? "UNZA" : "Non-UNZA"}
                </Badge>
              </div>
            ) : (
              <StudentCombobox
                students={students.data ?? []}
                value={studentId}
                onChange={setStudent}
              />
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">
                Courses {courseIds.size > 0 ? `(${courseIds.size} selected)` : ""}
              </Label>
              {courseIds.size > 0 && (
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setCourseIds(new Set())}
                >
                  Clear
                </button>
              )}
            </div>
            <Input
              placeholder="Filter courses..."
              value={courseFilter}
              onChange={(e) => setCourseFilter(e.target.value)}
            />
            <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border border-input p-2">
              {courses.isLoading ? (
                <p className="p-2 text-sm text-muted-foreground">Loading courses...</p>
              ) : filteredCourses.length === 0 ? (
                <p className="p-2 text-sm text-muted-foreground">No courses match.</p>
              ) : (
                filteredCourses.map((course: any) => {
                  const checked = courseIds.has(course.id);
                  const suggested = suggestedFeeFor(course);
                  return (
                    <label
                      key={course.id}
                      className={`flex cursor-pointer items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-muted ${checked ? "bg-primary/5" : ""}`}
                    >
                      <span className="flex items-center gap-2">
                        <Checkbox checked={checked} onCheckedChange={() => toggleCourse(course.id)} />
                        {course.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {suggested != null ? `K${suggested.toLocaleString()}` : "-"}
                      </span>
                    </label>
                  );
                })
              )}
            </div>
          </div>

          {courseIds.size > 0 && (
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Fee overrides (optional, ZMW)</Label>
              <div className="max-h-40 space-y-2 overflow-y-auto">
                {[...courseIds].map((id) => {
                  const course = courseList.find((c: any) => c.id === id);
                  if (!course) return null;
                  const suggested = suggestedFeeFor(course);
                  return (
                    <div key={id} className="flex items-center gap-2">
                      <span className="flex-1 truncate text-xs text-muted-foreground">{course.name}</span>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder={suggested != null ? String(suggested) : "0.00"}
                        value={feeOverrides[id] ?? ""}
                        onChange={(e) => setFeeOverrides((prev) => ({ ...prev, [id]: e.target.value }))}
                        className="h-8 w-28"
                      />
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                Total: <strong>K{totalFee.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-sm font-semibold">Payment status</Label>
            <Select value={paymentStatus} onValueChange={(v) => setPaymentStatus(v as PaymentStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="waived">Waived</SelectItem>
                <SelectItem value="free">Free</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Applied to every selected course (a K0 fee is always marked free).</p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={busy}>
              {busy
                ? "Enrolling..."
                : courseIds.size > 0
                  ? `Enrol in ${courseIds.size} course${courseIds.size === 1 ? "" : "s"}`
                  : "Enrol student"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
