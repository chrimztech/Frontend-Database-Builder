import { useRef, useState } from "react";
import { CheckCircle2, Download, FileText, Loader2, Upload, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { apiGet, apiPost, apiPut } from "@/lib/api";

type PaymentStatus = "pending" | "paid" | "waived" | "free";
type StudentCategory = "unza" | "non_unza";

type CsvRow = {
  lineNo: number;
  full_name: string;
  email: string;
  phone: string;
  national_id: string;
  category: StudentCategory;
  unza_student_id: string;
  course: string;
  payment_status: PaymentStatus;
  fee_charged: number | null;
  errors: string[];
};

type ImportResult = {
  lineNo: number;
  full_name: string;
  ok: boolean;
  enrolled: boolean;
  courseName: string;
  error?: string;
};

const TEMPLATE_CSV = [
  "full_name,email,phone,national_id,category,unza_student_id,course,payment_status,fee_charged",
  "John Banda,john.banda@example.com,0977123456,123456/78/1,non_unza,,Computer Basics,paid,500",
  "Mary Phiri,mary.phiri@unza.zm,0966234567,234567/89/2,unza,2021001234,Computer Basics,paid,200",
  "Peter Mwansa,,,345678/90/3,non_unza,,,pending,",
].join("\n");

// Simple RFC-4180 CSV parser
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') { cell += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { cell += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { row.push(cell); cell = ""; }
      else if (ch === '\r' && next === '\n') {
        row.push(cell); cell = "";
        if (row.some((c) => c.trim())) rows.push(row);
        row = []; i++;
      } else if (ch === '\n' || ch === '\r') {
        row.push(cell); cell = "";
        if (row.some((c) => c.trim())) rows.push(row);
        row = [];
      } else { cell += ch; }
    }
  }
  if (cell || row.length > 0) {
    row.push(cell);
    if (row.some((c) => c.trim())) rows.push(row);
  }
  return rows;
}

function toCategory(v: string): StudentCategory {
  return v.toLowerCase().trim() === "unza" ? "unza" : "non_unza";
}

function toPayment(v: string): PaymentStatus {
  const s = v.toLowerCase().trim();
  if (s === "paid") return "paid";
  if (s === "waived") return "waived";
  if (s === "free") return "free";
  return "pending";
}

const QUALIFIES_FOR_ENROLMENT: PaymentStatus[] = ["paid", "waived", "free"];

export function CsvImportDialog({ onImported }: { onImported: () => void }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"upload" | "preview" | "done">("upload");
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [results, setResults] = useState<ImportResult[]>([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function reset() {
    setStep("upload");
    setRows([]);
    setResults([]);
    if (fileRef.current) fileRef.current.value = "";
  }

  function downloadTemplate() {
    const blob = new Blob([TEMPLATE_CSV], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "student-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => parseFile((e.target?.result as string) ?? "");
    reader.readAsText(file, "utf-8");
  }

  function parseFile(text: string) {
    const raw = parseCSV(text.trim());
    if (raw.length < 2) {
      toast.error("CSV must have a header row and at least one data row.");
      return;
    }

    const headers = raw[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
    const idx = (name: string) => headers.indexOf(name);

    const parsed: CsvRow[] = raw.slice(1).map((cells, i) => {
      const get = (name: string) => (cells[idx(name)] ?? "").trim();
      const errors: string[] = [];

      const full_name = get("full_name");
      const national_id = get("national_id");
      const category = toCategory(get("category"));
      const payment_status = toPayment(get("payment_status"));
      const feeRaw = get("fee_charged");
      const fee_charged = feeRaw ? parseFloat(feeRaw) : null;

      if (!full_name) errors.push("full_name required");
      if (!national_id) errors.push("national_id required");
      if (category === "unza" && !get("unza_student_id")) errors.push("unza_student_id required for UNZA category");
      if (feeRaw && isNaN(fee_charged as number)) errors.push("fee_charged must be a number");

      return {
        lineNo: i + 2,
        full_name,
        email: get("email"),
        phone: get("phone"),
        national_id,
        category,
        unza_student_id: get("unza_student_id"),
        course: get("course") || get("course_name") || get("course_prefix"),
        payment_status,
        fee_charged: feeRaw && !isNaN(fee_charged as number) ? (fee_charged as number) : null,
        errors,
      };
    });

    setRows(parsed);
    setStep("preview");
  }

  async function runImport() {
    setBusy(true);
    const out: ImportResult[] = [];

    // Load all courses once for name/prefix matching
    const courses = await apiGet<{ id: string; name: string; prefix: string }[]>("/courses").catch(() => []);
    const findCourse = (name: string) => {
      if (!name) return null;
      const lo = name.toLowerCase();
      return courses.find(
        (c) => c.name.toLowerCase() === lo || c.prefix.toLowerCase() === lo,
      ) ?? null;
    };

    for (const row of rows.filter((r) => r.errors.length === 0)) {
      try {
        const studentPayload = {
          full_name: row.full_name,
          email: row.email || null,
          phone: row.phone || null,
          category: row.category,
          national_id: row.national_id || null,
          unza_student_id: row.category === "unza" ? row.unza_student_id || null : null,
          pii_consent_at: new Date().toISOString(),
          pii_consent_source: "csv-import",
        };

        // Upsert student — match on national_id to avoid duplicates
        let studentId: string | null = null;
        const existing = await apiGet<{ id: string } | null>(
          `/students?nationalId=${encodeURIComponent(row.national_id)}`,
        ).catch(() => null);

        if (existing) {
          await apiPut(`/students/${existing.id}`, studentPayload);
          studentId = existing.id;
        } else {
          const inserted = await apiPost<{ id: string }>("/students", studentPayload);
          studentId = inserted?.id ?? null;
        }

        // Audit log
        if (studentId) {
          await apiPost("/reports/audit-log", {
            student_id: studentId, action: "create", detail: `csv-import: ${row.full_name}`,
          }).catch(() => {});
        }

        // Auto-enrol if course specified and payment qualifies
        let enrolled = false;
        let courseName = "";
        const course = findCourse(row.course);

        if (course && studentId && QUALIFIES_FOR_ENROLMENT.includes(row.payment_status)) {
          courseName = course.name;
          // Skip if already enrolled
          const existingEnrolments = await apiGet<{ course: { id: string } | null }[]>(
            `/enrolments?studentId=${studentId}`,
          ).catch(() => []);
          const alreadyEnrolled = existingEnrolments.some((e) => e.course?.id === course.id);

          if (!alreadyEnrolled) {
            await apiPost("/enrolments", {
              student_id: studentId,
              course_id: course.id,
              payment_status: row.payment_status,
              fee_charged: row.fee_charged,
            });
            enrolled = true;
          }
        }

        out.push({ lineNo: row.lineNo, full_name: row.full_name, ok: true, enrolled, courseName });
      } catch (err: any) {
        out.push({ lineNo: row.lineNo, full_name: row.full_name, ok: false, enrolled: false, courseName: "", error: err.message });
      }
    }

    setResults(out);
    setStep("done");
    setBusy(false);
    onImported();
  }

  const validRows = rows.filter((r) => r.errors.length === 0);
  const invalidRows = rows.filter((r) => r.errors.length > 0);

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload className="mr-1 h-4 w-4" />
          Import CSV
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulk import students from CSV</DialogTitle>
        </DialogHeader>

        {/* ── Step 1: Upload ── */}
        {step === "upload" && (
          <div className="space-y-5">
            <div
              className="cursor-pointer rounded-[1.35rem] border-2 border-dashed border-border bg-muted/20 p-10 text-center transition hover:border-primary/40 hover:bg-primary/[0.03]"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files[0];
                if (f) handleFile(f);
              }}
            >
              <FileText className="mx-auto h-10 w-10 text-muted-foreground" />
              <p className="mt-3 text-sm font-semibold text-foreground">
                Drop a CSV file here, or click to browse
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Required columns: <code className="text-primary">full_name</code>,{" "}
                <code className="text-primary">national_id</code>
              </p>
              <Button size="sm" className="mt-4 pointer-events-none">
                <Upload className="mr-1 h-4 w-4" /> Choose file
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
            </div>

            <div className="flex justify-end">
              <Button size="sm" variant="outline" onClick={downloadTemplate}>
                <Download className="mr-1 h-4 w-4" /> Download template CSV
              </Button>
            </div>

            <div className="rounded-[1.35rem] border border-border/70 bg-white/72 p-5 shadow-[var(--shadow-soft)]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Column reference
              </p>
              <div className="mt-3 space-y-1.5 text-xs">
                {[
                  ["full_name *", "Student's full name"],
                  ["email", "Email address"],
                  ["phone", "Phone number"],
                  ["national_id *", "NRC number — e.g. 123456/78/1"],
                  ["category", "unza or non_unza (default: non_unza)"],
                  ["unza_student_id", "Required when category = unza"],
                  ["course", "Course name or prefix — triggers auto-enrolment"],
                  ["payment_status", "pending / paid / waived / free (default: pending)"],
                  ["fee_charged", "Amount in ZMW (number)"],
                ].map(([col, desc]) => (
                  <div key={col} className="flex gap-3">
                    <code className="w-44 shrink-0 text-primary">{col}</code>
                    <span className="text-muted-foreground">{desc}</span>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-xs text-muted-foreground">
                Students with <strong>paid</strong>, <strong>waived</strong>, or{" "}
                <strong>free</strong> payment status and a matching course are
                automatically enrolled.
              </p>
            </div>
          </div>
        )}

        {/* ── Step 2: Preview ── */}
        {step === "preview" && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-semibold text-success">{validRows.length} valid</span>
              {invalidRows.length > 0 && (
                <span className="text-sm font-semibold text-destructive">
                  {invalidRows.length} with errors (will be skipped)
                </span>
              )}
              <Button size="sm" variant="outline" className="ml-auto" onClick={reset}>
                ← Back
              </Button>
            </div>

            <div className="overflow-x-auto rounded-xl border border-border/70">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 text-[10px] uppercase tracking-[0.16em]">
                  <tr>
                    <th className="p-2 text-left text-muted-foreground">#</th>
                    <th className="p-2 text-left">Name</th>
                    <th className="p-2 text-left">NRC</th>
                    <th className="p-2 text-left">Category</th>
                    <th className="p-2 text-left">Course</th>
                    <th className="p-2 text-left">Payment</th>
                    <th className="p-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.lineNo}
                      className={`border-t ${row.errors.length > 0 ? "bg-destructive/5" : ""}`}
                    >
                      <td className="p-2 text-muted-foreground">{row.lineNo}</td>
                      <td className="p-2 font-medium">
                        {row.full_name || <span className="text-destructive">missing</span>}
                      </td>
                      <td className="p-2 font-mono">
                        {row.national_id || <span className="text-destructive">missing</span>}
                      </td>
                      <td className="p-2">{row.category}</td>
                      <td className="p-2 text-muted-foreground">{row.course || "—"}</td>
                      <td className="p-2">{row.payment_status}</td>
                      <td className="p-2">
                        {row.errors.length === 0 ? (
                          <span className="font-semibold text-success">✓ Valid</span>
                        ) : (
                          <span
                            className="font-semibold text-destructive"
                            title={row.errors.join("; ")}
                          >
                            ✗ {row.errors[0]}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={reset}>
                Cancel
              </Button>
              <Button disabled={validRows.length === 0 || busy} onClick={runImport}>
                {busy ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Importing…
                  </>
                ) : (
                  `Import ${validRows.length} student${validRows.length !== 1 ? "s" : ""}`
                )}
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* ── Step 3: Results ── */}
        {step === "done" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-success" />
              <p className="font-semibold">
                Import complete —{" "}
                {results.filter((r) => r.ok).length} of {results.length} succeeded
              </p>
            </div>

            <div className="overflow-x-auto rounded-xl border border-border/70">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 text-[10px] uppercase tracking-[0.16em]">
                  <tr>
                    <th className="p-2 text-left text-muted-foreground">#</th>
                    <th className="p-2 text-left">Name</th>
                    <th className="p-2 text-left">Student</th>
                    <th className="p-2 text-left">Enrolled</th>
                    <th className="p-2 text-left">Course / Error</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r) => (
                    <tr key={r.lineNo} className={`border-t ${!r.ok ? "bg-destructive/5" : ""}`}>
                      <td className="p-2 text-muted-foreground">{r.lineNo}</td>
                      <td className="p-2 font-medium">{r.full_name}</td>
                      <td className="p-2">
                        {r.ok ? (
                          <span className="font-semibold text-success">✓ Saved</span>
                        ) : (
                          <span className="font-semibold text-destructive">✗ Failed</span>
                        )}
                      </td>
                      <td className="p-2">
                        {r.enrolled ? (
                          <span className="font-semibold text-success">✓ Enrolled</span>
                        ) : r.ok ? (
                          <span className="text-muted-foreground">—</span>
                        ) : null}
                      </td>
                      <td className="p-2 text-muted-foreground">
                        {r.error ? (
                          <span className="text-destructive">{r.error}</span>
                        ) : (
                          r.courseName || "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <DialogFooter>
              <Button onClick={() => { setOpen(false); reset(); }}>Done</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
