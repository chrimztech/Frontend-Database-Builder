import { useState } from "react";
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
import { cn } from "@/lib/utils";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import {
  AdminEmptyState,
  AdminPageHeader,
  AdminPagination,
  AdminPanel,
  AdminPanelHeader,
  AdminStat,
  type PageResponse,
} from "@/components/admin/admin-ui";
import unzaLogo from "@/assets/unza-logo.png.asset.json";

type EnrolmentStatus = "enrolled" | "in_progress" | "completed" | "certified";
type StudentCategory = "unza" | "non_unza";

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
    unza_student_id: string | null;
    category: StudentCategory;
  } | null;
  course: {
    id: string;
    name: string;
    prefix: string;
  } | null;
};

type CourseOption = { id: string; name: string };

const PAGE_SIZE = 25;
// Export covers the entire filtered dataset (not just the visible page) in one request —
// comfortably above today's real-world enrolment counts.
const EXPORT_MAX_ROWS = 20000;

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

const CATEGORY_LABEL: Record<StudentCategory, string> = {
  unza: "UNZA",
  non_unza: "Non-UNZA",
};

const CATEGORY_BADGE: Record<StudentCategory, string> = {
  unza: "bg-accent text-accent-foreground",
  non_unza: "bg-muted text-muted-foreground",
};

const UNZA_GREEN: [number, number, number] = [26, 92, 46];

function fmtDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function initials(name?: string | null) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "";
  return (first + last).toUpperCase();
}

/** UNZA students are identified by their student number; everyone else by NRC. */
function identifierFor(student: JourneyRow["student"]) {
  if (!student) return { label: "NRC", value: "—" };
  if (student.category === "unza") {
    return { label: "Student No.", value: student.unza_student_id || "—" };
  }
  return { label: "NRC", value: student.national_id || "—" };
}

async function fetchAsDataUrl(url: string): Promise<string | null> {
  try {
    const resp = await fetch(url);
    const blob = await resp.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export function StudentJourneyTab() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [courseId, setCourseId] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(0);
  const [exporting, setExporting] = useState(false);

  const hasActiveFilters =
    search.trim() !== "" || courseId !== "all" || status !== "all" || fromDate !== "" || toDate !== "";

  // Shared filter params (everything except status/page/size) reused by the main
  // query, the status breakdown, and the full-dataset PDF export.
  function filterParams() {
    const params = new URLSearchParams();
    if (debouncedSearch.trim()) params.set("q", debouncedSearch.trim());
    if (courseId !== "all") params.set("courseId", courseId);
    if (fromDate) params.set("fromDate", fromDate);
    if (toDate) params.set("toDate", toDate);
    return params;
  }

  function setSearchAndResetPage(value: string) {
    setSearch(value);
    setPage(0);
  }
  function setCourseIdAndResetPage(value: string) {
    setCourseId(value);
    setPage(0);
  }
  function setStatusAndResetPage(value: string) {
    setStatus(value);
    setPage(0);
  }
  function setFromDateAndResetPage(value: string) {
    setFromDate(value);
    setPage(0);
  }
  function setToDateAndResetPage(value: string) {
    setToDate(value);
    setPage(0);
  }

  const journey = useQuery({
    queryKey: ["student-journey", debouncedSearch, courseId, status, fromDate, toDate, page],
    queryFn: async () => {
      const params = filterParams();
      params.set("page", String(page));
      params.set("size", String(PAGE_SIZE));
      if (status !== "all") params.set("status", status);
      return apiGet<PageResponse<JourneyRow>>(`/enrolments?${params}`);
    },
  });

  // All active courses, for the filter dropdown — independent of the current page's data.
  const coursesList = useQuery({
    queryKey: ["student-journey-courses"],
    queryFn: async () => {
      const data = await apiGet<CourseOption[]>("/courses");
      return [...data].sort((a, b) => a.name.localeCompare(b.name));
    },
  });

  // Status breakdown across the WHOLE filtered dataset (not just the current page).
  const stats = useQuery({
    queryKey: ["student-journey-stats", debouncedSearch, courseId, fromDate, toDate],
    queryFn: async () => {
      const base = filterParams();
      base.set("page", "0");
      base.set("size", "1");
      const withStatus = (s: string) => {
        const p = new URLSearchParams(base);
        p.set("status", s);
        return p;
      };
      const [total, learning, awaiting, certified] = await Promise.all([
        apiGet<PageResponse<JourneyRow>>(`/enrolments?${base}`),
        apiGet<PageResponse<JourneyRow>>(`/enrolments?${withStatus("in_progress")}`),
        apiGet<PageResponse<JourneyRow>>(`/enrolments?${withStatus("completed")}`),
        apiGet<PageResponse<JourneyRow>>(`/enrolments?${withStatus("certified")}`),
      ]);
      return {
        total: total.total_elements,
        learning: learning.total_elements,
        awaitingCertificate: awaiting.total_elements,
        certified: certified.total_elements,
      };
    },
  });

  const rows = journey.data?.content ?? [];
  const totalElements = journey.data?.total_elements ?? 0;
  const totalPages = journey.data?.total_pages ?? 0;
  const courses = coursesList.data ?? [];
  const counts = {
    total: stats.data?.total ?? 0,
    learning: stats.data?.learning ?? 0,
    awaitingCertificate: stats.data?.awaitingCertificate ?? 0,
    certified: stats.data?.certified ?? 0,
  };

  function clearFilters() {
    setSearch("");
    setCourseId("all");
    setStatus("all");
    setFromDate("");
    setToDate("");
    setPage(0);
  }

  async function exportPdf() {
    setExporting(true);
    try {
      // Pull the entire filtered dataset (every page), not just what's on screen.
      const params = filterParams();
      params.set("page", "0");
      params.set("size", String(EXPORT_MAX_ROWS));
      if (status !== "all") params.set("status", status);
      const full = await apiGet<PageResponse<JourneyRow>>(`/enrolments?${params}`);
      const exportRows = full.content;

      if (exportRows.length === 0) {
        toast.error("Nothing to export — adjust your filters");
        return;
      }

      const [{ jsPDF }, { default: autoTable }, logoData] = await Promise.all([
        import("jspdf"),
        import("jspdf-autotable"),
        fetchAsDataUrl(unzaLogo.url),
      ]);

      const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 40;

      // ── Letterhead ──────────────────────────────────────────────────────
      if (logoData) {
        try {
          doc.addImage(logoData, "PNG", margin, 24, 42, 42);
        } catch {
          // Unsupported image format — report still generates without the logo
        }
      }
      const textX = logoData ? margin + 54 : margin;

      doc.setTextColor(26, 26, 26);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(17);
      doc.text("Student Journey Report", textX, 42);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(90);
      doc.text("University of Zambia — Technology and E-Learning Support Unit (TeLS)", textX, 58);

      doc.setDrawColor(...UNZA_GREEN);
      doc.setLineWidth(1.5);
      doc.line(margin, 78, pageWidth - margin, 78);

      doc.setFontSize(9);
      doc.setTextColor(110);
      const generatedAt = new Date().toLocaleString("en-GB");
      const filterNote = hasActiveFilters ? " · filtered view" : " · full list";
      doc.text(`Generated ${generatedAt}${filterNote} — ${exportRows.length} record(s)`, margin, 92);

      // ── Table ───────────────────────────────────────────────────────────
      autoTable(doc, {
        startY: 104,
        margin: { left: margin, right: margin },
        head: [[
          "#",
          "Student",
          "Category",
          "ID / NRC",
          "Email",
          "Course",
          "Registered",
          "Started",
          "Completed",
          "Certificate issued",
          "Status",
        ]],
        body: exportRows.map((row, index) => {
          const id = identifierFor(row.student);
          return [
            String(index + 1),
            row.student?.full_name ?? "-",
            row.student ? CATEGORY_LABEL[row.student.category] : "-",
            id.value,
            row.student?.email || "—",
            row.course?.name ?? "-",
            fmtDate(row.enrolled_at),
            fmtDate(row.started_at),
            fmtDate(row.completed_at),
            fmtDate(row.certificate?.issue_date ?? row.certificate?.created_at ?? null),
            STATUS_LABEL[row.status],
          ];
        }),
        styles: { fontSize: 7.5, cellPadding: 5, lineColor: [225, 225, 225], lineWidth: 0.5 },
        headStyles: { fillColor: UNZA_GREEN, textColor: 255, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [245, 247, 245] },
        columnStyles: {
          0: { cellWidth: 20, halign: "center" },
          1: { cellWidth: 95 },
          2: { cellWidth: 50, halign: "center" },
          3: { cellWidth: 70 },
          4: { cellWidth: 110 },
          5: { cellWidth: 85 },
          6: { cellWidth: 58 },
          7: { cellWidth: 58 },
          8: { cellWidth: 58 },
          9: { cellWidth: 62 },
          10: { cellWidth: 55, halign: "center" },
        },
        didDrawPage: () => {
          doc.setFontSize(8);
          doc.setTextColor(140);
          doc.text(
            "CEMIS — UNZA Technology and E-Learning Support Unit",
            margin,
            doc.internal.pageSize.getHeight() - 20,
          );
        },
      });

      // ── Page numbers (added after layout, once total page count is known) ──
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(140);
        doc.text(
          `Page ${i} of ${pageCount}`,
          pageWidth - margin,
          doc.internal.pageSize.getHeight() - 20,
          { align: "right" },
        );
      }

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
              placeholder="Search name, email, NRC, student no, course..."
              value={search}
              onChange={(e) => setSearchAndResetPage(e.target.value)}
            />
          </div>

          <Select value={courseId} onValueChange={setCourseIdAndResetPage}>
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

          <Select value={status} onValueChange={setStatusAndResetPage}>
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
              onChange={(e) => setFromDateAndResetPage(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground">to</label>
            <Input
              type="date"
              className="w-40"
              value={toDate}
              onChange={(e) => setToDateAndResetPage(e.target.value)}
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
          ) : rows.length === 0 ? (
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
              <TableHeader className="sticky top-0 z-10">
                <TableRow>
                  <TableHead className="w-10 text-right">#</TableHead>
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
                {rows.map((row, index) => {
                  const id = identifierFor(row.student);
                  const category = row.student?.category ?? "non_unza";
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="text-right font-mono text-xs text-muted-foreground">
                        {page * PAGE_SIZE + index + 1}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-start gap-3">
                          <div
                            className={cn(
                              "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                              CATEGORY_BADGE[category],
                            )}
                          >
                            {initials(row.student?.full_name)}
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium">{row.student?.full_name ?? "-"}</div>
                            <div className="mt-0.5 truncate text-xs text-muted-foreground">
                              {row.student?.email || "No email on file"}
                            </div>
                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                              <Badge className={cn("text-[10px]", CATEGORY_BADGE[category])}>
                                {CATEGORY_LABEL[category]}
                              </Badge>
                              <span className="font-mono text-[11px] text-muted-foreground">
                                {id.label}: {id.value}
                              </span>
                            </div>
                          </div>
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
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
        <AdminPagination
          page={page}
          totalPages={totalPages}
          totalElements={totalElements}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
        />
      </AdminPanel>
    </div>
  );
}
