import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Loader2, Search } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { apiGet } from "@/lib/api";
import {
  AdminEmptyState,
  AdminPageHeader,
  AdminPanel,
  AdminPanelHeader,
  AdminStat,
} from "@/components/admin/admin-ui";

type EnrolmentStatus = "enrolled" | "in_progress" | "completed" | "certified";

type JourneyRow = {
  id: string;
  status: EnrolmentStatus;
  enrolled_at: string;
  started_at: string | null;
  completed_at: string | null;
  certificate: {
    id: string;
    certificate_code: string | null;
    issue_date: string | null;
    created_at: string | null;
  } | null;
  student: {
    id: string;
    full_name: string;
    email: string | null;
    national_id: string | null;
  } | null;
  course: {
    id: string;
    name: string;
    prefix: string;
  } | null;
};

const STATUS_LABEL: Record<EnrolmentStatus, string> = {
  enrolled: "Registered",
  in_progress: "Learning",
  completed: "Completed",
  certified: "Certified",
};

const STATUS_BADGE: Record<EnrolmentStatus, string> = {
  enrolled: "bg-muted text-foreground",
  in_progress: "bg-primary/15 text-primary",
  completed: "bg-amber-500/15 text-amber-700",
  certified: "bg-success text-success-foreground",
};

function fmtDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function dateOnly(value: string) {
  return value.slice(0, 10);
}

export function StudentJourneyTab() {
  const [search, setSearch] = useState("");
  const [courseId, setCourseId] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [exporting, setExporting] = useState(false);

  const journey = useQuery({
    queryKey: ["student-journey"],
    queryFn: async () => {
      const data = await apiGet<JourneyRow[]>("/enrolments");
      return [...data].sort((a, b) => b.enrolled_at.localeCompare(a.enrolled_at));
    },
  });

  const list = journey.data ?? [];

  const courses = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    for (const row of list) {
      if (row.course) map.set(row.course.id, { id: row.course.id, name: row.course.name });
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [list]);

  const query = search.trim().toLowerCase();

  const filtered = list.filter((row) => {
    if (courseId !== "all" && row.course?.id !== courseId) return false;
    if (status !== "all" && row.status !== status) return false;
    if (fromDate && dateOnly(row.enrolled_at) < fromDate) return false;
    if (toDate && dateOnly(row.enrolled_at) > toDate) return false;
    if (query) {
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
      if (!haystack.includes(query)) return false;
    }
    return true;
  });

  const counts = {
    total: filtered.length,
    learning: filtered.filter((r) => r.status === "in_progress").length,
    awaitingCertificate: filtered.filter((r) => r.status === "completed").length,
    certified: filtered.filter((r) => r.status === "certified").length,
  };

  const hasActiveFilters =
    search.trim() !== "" || courseId !== "all" || status !== "all" || fromDate !== "" || toDate !== "";

  function clearFilters() {
    setSearch("");
    setCourseId("all");
    setStatus("all");
    setFromDate("");
    setToDate("");
  }

  async function exportPdf() {
    if (filtered.length === 0) {
      toast.error("Nothing to export — adjust your filters");
      return;
    }
    setExporting(true);
    try {
      const [{ jsPDF }, { default: autoTable }] = await Promise.all([
        import("jspdf"),
        import("jspdf-autotable"),
      ]);

      const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });

      doc.setFontSize(16);
      doc.text("Student Journey Report", 40, 40);
      doc.setFontSize(10);
      doc.setTextColor(100);
      const generatedAt = new Date().toLocaleString("en-GB");
      const filterNote = hasActiveFilters ? " (filtered)" : "";
      doc.text(`Generated ${generatedAt}${filterNote} — ${filtered.length} record(s)`, 40, 58);

      autoTable(doc, {
        startY: 72,
        head: [[
          "Student",
          "Email / NRC",
          "Course",
          "Registered",
          "Started",
          "Completed",
          "Certificate issued",
          "Status",
        ]],
        body: filtered.map((row) => [
          row.student?.full_name ?? "-",
          row.student?.email || row.student?.national_id || "-",
          row.course?.name ?? "-",
          fmtDate(row.enrolled_at),
          fmtDate(row.started_at),
          fmtDate(row.completed_at),
          fmtDate(row.certificate?.issue_date ?? row.certificate?.created_at ?? null),
          STATUS_LABEL[row.status],
        ]),
        styles: { fontSize: 8, cellPadding: 5 },
        headStyles: { fillColor: [26, 92, 46] },
        alternateRowStyles: { fillColor: [245, 247, 245] },
      });

      doc.save(`student-journey-${new Date().toISOString().slice(0, 10)}.pdf`);
      toast.success("PDF report downloaded");
    } catch (err: any) {
      toast.error(err.message ?? "Could not generate PDF");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-8">
      <AdminPageHeader
        eyebrow="Training"
        title="Student journey"
        description="Every student's full timeline — registered, started, completed, and certified — with a one-click PDF report."
        actions={
          <Button onClick={exportPdf} disabled={exporting}>
            {exporting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Export PDF
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AdminStat label="Showing" value={counts.total} hint="Rows matching the current filters" />
        <AdminStat label="Learning" value={counts.learning} hint="Currently in progress" />
        <AdminStat label="Awaiting certificate" value={counts.awaitingCertificate} hint="Completed, not yet certified" />
        <AdminStat label="Certified" value={counts.certified} hint="Certificate issued" />
      </div>

      <AdminPanel>
        <AdminPanelHeader
          title="Timeline records"
          description="Search and filter by student, course, status, or registration date."
        />

        <div className="flex flex-wrap items-end gap-3 border-b border-border px-5 py-4 sm:px-6">
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search name, email, NRC, course..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <Select value={courseId} onValueChange={setCourseId}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="All courses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All courses</SelectItem>
              {courses.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="enrolled">Registered</SelectItem>
              <SelectItem value="in_progress">Learning</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="certified">Certified</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground">Registered from</label>
            <Input
              type="date"
              className="w-40"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground">to</label>
            <Input
              type="date"
              className="w-40"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </div>

          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          )}
        </div>

        <div className="px-5 py-5 sm:px-6">
          {journey.isLoading ? (
            <div className="text-sm text-muted-foreground">Loading student journey...</div>
          ) : filtered.length === 0 ? (
            <AdminEmptyState
              title={hasActiveFilters ? "No matches" : "No enrolments yet"}
              description={
                hasActiveFilters
                  ? "Try a different search term or widen your filters."
                  : "Once students are enrolled, their journey will appear here."
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Course</TableHead>
                  <TableHead>Registered</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Completed</TableHead>
                  <TableHead>Certificate issued</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <div className="font-medium">{row.student?.full_name ?? "-"}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {row.student?.email ?? row.student?.national_id ?? ""}
                      </div>
                    </TableCell>
                    <TableCell>{row.course?.name ?? "-"}</TableCell>
                    <TableCell className="text-muted-foreground">{fmtDate(row.enrolled_at)}</TableCell>
                    <TableCell className="text-muted-foreground">{fmtDate(row.started_at)}</TableCell>
                    <TableCell className="text-muted-foreground">{fmtDate(row.completed_at)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {fmtDate(row.certificate?.issue_date ?? row.certificate?.created_at ?? null)}
                    </TableCell>
                    <TableCell>
                      <Badge className={STATUS_BADGE[row.status]}>{STATUS_LABEL[row.status]}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </AdminPanel>
    </div>
  );
}
