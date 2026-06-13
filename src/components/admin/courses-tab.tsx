import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";

export type CourseCategory = "self_paced" | "short_course" | "special_schedule" | "professional_diploma";
export type CourseMode = "self_paced" | "interactive" | "special_schedule" | "blended" | null;

type Course = {
  id: string;
  code: string;
  name: string;
  prefix: string;
  description: string | null;
  duration_text: string | null;
  active: boolean;
  category: CourseCategory;
  fee_unza: number | null;
  fee_non_unza: number | null;
  start_date: string | null;
  time_slot: string | null;
  mode: CourseMode;
};

const CATEGORY_LABEL: Record<CourseCategory, string> = {
  self_paced: "Self-paced",
  short_course: "Short course",
  special_schedule: "Special schedule",
  professional_diploma: "Professional diploma",
};
const CATEGORY_TONE: Record<CourseCategory, string> = {
  self_paced: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-200",
  short_course: "bg-sky-100 text-sky-900 dark:bg-sky-900/30 dark:text-sky-200",
  special_schedule: "bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200",
  professional_diploma: "bg-violet-100 text-violet-900 dark:bg-violet-900/30 dark:text-violet-200",
};

function fmtZmw(v: number | null) {
  if (v == null) return "—";
  return `K${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function CoursesTab() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"all" | CourseCategory>("all");

  const courses = useQuery({
    queryKey: ["admin-courses"],
    queryFn: async () => {
      const { data, error } = await supabase.from("courses").select("*").order("category").order("name");
      if (error) throw error;
      return data as Course[];
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-courses"] });
  const list = (courses.data ?? []).filter((c) => filter === "all" || c.category === filter);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-display">Courses</h2>
          <p className="text-sm text-muted-foreground">
            Categorise courses and set separate fees for UNZA and non-UNZA students.
            The prefix is used to generate certificate IDs (e.g. <code className="font-mono">WEB-2026-…</code>).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filter} onValueChange={(v) => setFilter(v as any)}>
            <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              <SelectItem value="self_paced">Self-paced</SelectItem>
              <SelectItem value="short_course">Short course</SelectItem>
              <SelectItem value="special_schedule">Special schedule</SelectItem>
              <SelectItem value="professional_diploma">Professional diploma</SelectItem>
            </SelectContent>
          </Select>
          <CourseDialog onSaved={refresh} />
        </div>
      </div>

      <div className="rounded-lg border bg-card overflow-hidden">
        {courses.isLoading ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Loading…</div>
        ) : list.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">No courses match.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Code · Prefix</TableHead>
                <TableHead>Schedule</TableHead>
                <TableHead className="text-right">Fee UNZA</TableHead>
                <TableHead className="text-right">Fee Non-UNZA</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((c) => (
                <CourseRow key={c.id} course={c} onChange={refresh} />
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}

function CourseRow({ course, onChange }: { course: Course; onChange: () => void }) {
  async function remove() {
    if (!window.confirm(`Delete course ${course.name}? This will fail if there are enrolments on it.`)) return;
    const { error } = await supabase.from("courses").delete().eq("id", course.id);
    if (error) toast.error(error.message);
    else { toast.success("Course deleted"); onChange(); }
  }
  return (
    <TableRow>
      <TableCell className="font-medium">{course.name}</TableCell>
      <TableCell>
        <span className={`inline-block text-xs px-2 py-0.5 rounded ${CATEGORY_TONE[course.category]}`}>
          {CATEGORY_LABEL[course.category]}
        </span>
      </TableCell>
      <TableCell className="font-mono text-xs">
        {course.code} <span className="text-muted-foreground">·</span> <Badge variant="secondary" className="font-mono">{course.prefix}</Badge>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {course.start_date ? new Date(course.start_date).toLocaleDateString() : "—"}<br />
        <span>{course.time_slot ?? course.duration_text ?? ""}</span>
      </TableCell>
      <TableCell className="text-right font-mono text-xs">{fmtZmw(course.fee_unza)}</TableCell>
      <TableCell className="text-right font-mono text-xs">{fmtZmw(course.fee_non_unza)}</TableCell>
      <TableCell>{course.active ? <Badge>Active</Badge> : <Badge variant="outline">Inactive</Badge>}</TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          <CourseDialog onSaved={onChange} course={course} trigger={
            <Button size="sm" variant="ghost"><Pencil className="h-4 w-4" /></Button>
          } />
          <Button size="sm" variant="ghost" onClick={remove}><Trash2 className="h-4 w-4 text-destructive" /></Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function CourseDialog({ onSaved, course, trigger }: { onSaved: () => void; course?: Course; trigger?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState(course?.code ?? "");
  const [name, setName] = useState(course?.name ?? "");
  const [prefix, setPrefix] = useState(course?.prefix ?? "");
  const [description, setDescription] = useState(course?.description ?? "");
  const [duration_text, setDuration] = useState(course?.duration_text ?? "");
  const [active, setActive] = useState(course?.active ?? true);
  const [category, setCategory] = useState<CourseCategory>(course?.category ?? "short_course");
  const [mode, setMode] = useState<NonNullable<CourseMode> | "none">((course?.mode ?? "none") as any);
  const [fee_unza, setFeeUnza] = useState<string>(course?.fee_unza != null ? String(course.fee_unza) : "");
  const [fee_non_unza, setFeeNonUnza] = useState<string>(course?.fee_non_unza != null ? String(course.fee_non_unza) : "");
  const [start_date, setStartDate] = useState<string>(course?.start_date ?? "");
  const [time_slot, setTimeSlot] = useState(course?.time_slot ?? "");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const pf = prefix.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (!pf) throw new Error("Prefix is required (letters/numbers only)");
      const parseFee = (s: string): number | null => {
        const t = s.trim();
        if (!t) return null;
        const n = Number(t);
        if (Number.isNaN(n) || n < 0) throw new Error("Fee must be a positive number");
        return n;
      };
      const payload = {
        code: code.trim().toUpperCase(),
        name: name.trim(),
        prefix: pf,
        description: description.trim() || null,
        duration_text: duration_text.trim() || null,
        active,
        category,
        mode: mode === "none" ? null : mode,
        fee_unza: parseFee(fee_unza),
        fee_non_unza: parseFee(fee_non_unza),
        start_date: start_date || null,
        time_slot: time_slot.trim() || null,
      };
      if (course) {
        const { error } = await supabase.from("courses").update(payload).eq("id", course.id);
        if (error) throw error;
        toast.success("Course updated");
      } else {
        const { error } = await supabase.from("courses").insert(payload);
        if (error) throw error;
        toast.success("Course added");
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
            <Plus className="h-4 w-4 mr-1" /> Add course
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{course ? "Edit course" : "Add a course"}</DialogTitle>
          <DialogDescription>Set the certificate ID prefix and the two fee tiers (UNZA vs Non-UNZA).</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="cc">Code</Label>
              <Input id="cc" required maxLength={20} value={code} onChange={(e) => setCode(e.target.value)} placeholder="WEB-DEV" />
            </div>
            <div>
              <Label htmlFor="pf">Cert ID prefix</Label>
              <Input id="pf" required maxLength={10} value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="WEB" />
            </div>
            <div>
              <Label>Category</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as CourseCategory)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="self_paced">Self-paced</SelectItem>
                  <SelectItem value="short_course">Short course</SelectItem>
                  <SelectItem value="special_schedule">Special schedule</SelectItem>
                  <SelectItem value="professional_diploma">Professional diploma</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="nm">Name</Label>
            <Input id="nm" required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="du">Duration</Label>
              <Input id="du" maxLength={60} value={duration_text} onChange={(e) => setDuration(e.target.value)} placeholder="2 Weeks" />
            </div>
            <div>
              <Label htmlFor="sd">Start date</Label>
              <Input id="sd" type="date" value={start_date} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="ts">Time slot</Label>
              <Input id="ts" maxLength={40} value={time_slot} onChange={(e) => setTimeSlot(e.target.value)} placeholder="17:30 – 19:30" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Delivery mode</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as any)}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Unspecified —</SelectItem>
                  <SelectItem value="self_paced">Self-paced</SelectItem>
                  <SelectItem value="interactive">Interactive</SelectItem>
                  <SelectItem value="special_schedule">Special schedule</SelectItem>
                  <SelectItem value="blended">Blended</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="fu">Fee — UNZA (ZMW)</Label>
              <Input id="fu" type="number" min="0" step="0.01" value={fee_unza} onChange={(e) => setFeeUnza(e.target.value)} placeholder="250.00" />
            </div>
            <div>
              <Label htmlFor="fn">Fee — Non-UNZA (ZMW)</Label>
              <Input id="fn" type="number" min="0" step="0.01" value={fee_non_unza} onChange={(e) => setFeeNonUnza(e.target.value)} placeholder="1500.00" />
            </div>
          </div>
          <div>
            <Label htmlFor="ds">Description</Label>
            <Textarea id="ds" rows={2} maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <Switch id="ac" checked={active} onCheckedChange={setActive} />
            <Label htmlFor="ac">Active (available for enrolment)</Label>
          </div>
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
