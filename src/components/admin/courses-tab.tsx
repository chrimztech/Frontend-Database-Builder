import { useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
import { supabase } from "@/integrations/supabase/client";
import {
  AdminEmptyState,
  AdminPageHeader,
  AdminPanel,
  AdminPanelHeader,
  AdminStat,
} from "@/components/admin/admin-ui";

export type CourseCategory =
  | "self_paced"
  | "short_course"
  | "special_schedule"
  | "professional_diploma";
export type CourseMode =
  | "self_paced"
  | "interactive"
  | "special_schedule"
  | "blended"
  | null;

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
  self_paced: "bg-emerald-100 text-emerald-900",
  short_course: "bg-sky-100 text-sky-900",
  special_schedule: "bg-amber-100 text-amber-900",
  professional_diploma: "bg-violet-100 text-violet-900",
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

export function CoursesTab() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<"all" | CourseCategory>("all");

  const courses = useQuery({
    queryKey: ["admin-courses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("courses")
        .select("*")
        .order("category")
        .order("name");

      if (error) {
        throw error;
      }

      return data as Course[];
    },
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin-courses"] });
  const list = (courses.data ?? []).filter(
    (course) => filter === "all" || course.category === filter,
  );
  const fullList = courses.data ?? [];
  const activeCount = fullList.filter((course) => course.active).length;

  return (
    <div className="space-y-8">
      <AdminPageHeader
        eyebrow="Training"
        title="Course catalogue"
        description="Define course metadata, separate UNZA and non-UNZA fee levels, and manage the prefixes used in certificate ID generation."
        actions={<CourseDialog onSaved={refresh} />}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AdminStat label="Courses" value={fullList.length} hint="Total catalogue entries available in the system" />
        <AdminStat label="Active" value={activeCount} hint="Courses currently available for enrolment" />
        <AdminStat
          label="Short courses"
          value={fullList.filter((course) => course.category === "short_course").length}
          hint="Short-format offerings"
        />
        <AdminStat
          label="Self-paced"
          value={fullList.filter((course) => course.category === "self_paced").length}
          hint="Courses that can run with flexible scheduling"
        />
      </div>

      <AdminPanel>
        <AdminPanelHeader
          title="Course records"
          description="Filter by delivery category and review fee tiers, activation state, and certificate prefix setup."
          actions={
            <Select value={filter} onValueChange={(value) => setFilter(value as "all" | CourseCategory)}>
              <SelectTrigger className="w-full sm:w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                <SelectItem value="self_paced">Self-paced</SelectItem>
                <SelectItem value="short_course">Short course</SelectItem>
                <SelectItem value="special_schedule">Special schedule</SelectItem>
                <SelectItem value="professional_diploma">Professional diploma</SelectItem>
              </SelectContent>
            </Select>
          }
        />

        <div className="px-5 py-5 sm:px-6">
          {courses.isLoading ? (
            <div className="text-sm text-muted-foreground">Loading courses...</div>
          ) : list.length === 0 ? (
            <AdminEmptyState
              title="No courses match this filter"
              description={
                fullList.length === 0
                  ? "Add your first course to begin building the training catalogue."
                  : "Adjust the category filter to see a different part of the course catalogue."
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Code / Prefix</TableHead>
                  <TableHead>Schedule</TableHead>
                  <TableHead className="text-right">Fee UNZA</TableHead>
                  <TableHead className="text-right">Fee Non-UNZA</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((course) => (
                  <CourseRow key={course.id} course={course} onChange={refresh} />
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </AdminPanel>
    </div>
  );
}

function CourseRow({ course, onChange }: { course: Course; onChange: () => void }) {
  async function remove() {
    if (
      !window.confirm(
        `Delete course ${course.name}? This will fail if there are enrolments linked to it.`,
      )
    ) {
      return;
    }

    const { error } = await supabase.from("courses").delete().eq("id", course.id);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Course deleted");
      onChange();
    }
  }

  return (
    <TableRow>
      <TableCell className="font-medium">{course.name}</TableCell>
      <TableCell>
        <span
          className={`inline-flex rounded-full px-3 py-1 text-[11px] font-semibold tracking-[0.12em] ${CATEGORY_TONE[course.category]}`}
        >
          {CATEGORY_LABEL[course.category]}
        </span>
      </TableCell>
      <TableCell className="font-mono text-xs">
        {course.code} <span className="text-muted-foreground">/</span>{" "}
        <Badge variant="outline" className="font-mono">
          {course.prefix}
        </Badge>
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        <div>{course.start_date ? new Date(course.start_date).toLocaleDateString() : "-"}</div>
        <div className="mt-1">{course.time_slot ?? course.duration_text ?? "-"}</div>
      </TableCell>
      <TableCell className="text-right font-mono text-xs">{fmtZmw(course.fee_unza)}</TableCell>
      <TableCell className="text-right font-mono text-xs">{fmtZmw(course.fee_non_unza)}</TableCell>
      <TableCell>
        {course.active ? <Badge>Active</Badge> : <Badge variant="outline">Inactive</Badge>}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-2">
          <CourseDialog
            onSaved={onChange}
            course={course}
            trigger={
              <Button size="sm" variant="outline">
                <Pencil className="h-4 w-4" />
              </Button>
            }
          />
          <Button size="sm" variant="outline" onClick={remove}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function CourseDialog({
  onSaved,
  course,
  trigger,
}: {
  onSaved: () => void;
  course?: Course;
  trigger?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState(course?.code ?? "");
  const [name, setName] = useState(course?.name ?? "");
  const [prefix, setPrefix] = useState(course?.prefix ?? "");
  const [description, setDescription] = useState(course?.description ?? "");
  const [durationText, setDuration] = useState(course?.duration_text ?? "");
  const [active, setActive] = useState(course?.active ?? true);
  const [category, setCategory] = useState<CourseCategory>(
    course?.category ?? "short_course",
  );
  const [mode, setMode] = useState<NonNullable<CourseMode> | "none">(
    (course?.mode ?? "none") as NonNullable<CourseMode> | "none",
  );
  const [feeUnza, setFeeUnza] = useState<string>(
    course?.fee_unza != null ? String(course.fee_unza) : "",
  );
  const [feeNonUnza, setFeeNonUnza] = useState<string>(
    course?.fee_non_unza != null ? String(course.fee_non_unza) : "",
  );
  const [startDate, setStartDate] = useState<string>(course?.start_date ?? "");
  const [timeSlot, setTimeSlot] = useState(course?.time_slot ?? "");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);

    try {
      const cleanPrefix = prefix.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (!cleanPrefix) {
        throw new Error("Prefix is required and must use only letters or numbers");
      }

      const parseFee = (value: string): number | null => {
        const trimmed = value.trim();
        if (!trimmed) {
          return null;
        }

        const parsed = Number(trimmed);
        if (Number.isNaN(parsed) || parsed < 0) {
          throw new Error("Fee must be a positive number");
        }

        return parsed;
      };

      const payload = {
        code: code.trim().toUpperCase(),
        name: name.trim(),
        prefix: cleanPrefix,
        description: description.trim() || null,
        duration_text: durationText.trim() || null,
        active,
        category,
        mode: mode === "none" ? null : mode,
        fee_unza: parseFee(feeUnza),
        fee_non_unza: parseFee(feeNonUnza),
        start_date: startDate || null,
        time_slot: timeSlot.trim() || null,
      };

      if (course) {
        const { error } = await supabase
          .from("courses")
          .update(payload)
          .eq("id", course.id);

        if (error) {
          throw error;
        }

        toast.success("Course updated");
      } else {
        const { error } = await supabase.from("courses").insert(payload);
        if (error) {
          throw error;
        }

        toast.success("Course added");
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
            Add course
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{course ? "Edit course" : "Add a course"}</DialogTitle>
          <DialogDescription>
            Set the certificate ID prefix and separate fee tiers for UNZA and
            non-UNZA participants.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Code" htmlFor="course-code">
              <Input
                id="course-code"
                required
                maxLength={20}
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="WEB-DEV"
              />
            </Field>
            <Field label="Cert ID prefix" htmlFor="course-prefix">
              <Input
                id="course-prefix"
                required
                maxLength={10}
                value={prefix}
                onChange={(event) => setPrefix(event.target.value)}
                placeholder="WEB"
              />
            </Field>
            <Field label="Category" htmlFor="course-category">
              <Select
                value={category}
                onValueChange={(value) => setCategory(value as CourseCategory)}
              >
                <SelectTrigger id="course-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="self_paced">Self-paced</SelectItem>
                  <SelectItem value="short_course">Short course</SelectItem>
                  <SelectItem value="special_schedule">Special schedule</SelectItem>
                  <SelectItem value="professional_diploma">
                    Professional diploma
                  </SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field label="Name" htmlFor="course-name">
            <Input
              id="course-name"
              required
              maxLength={120}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>

          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Duration" htmlFor="course-duration">
              <Input
                id="course-duration"
                maxLength={60}
                value={durationText}
                onChange={(event) => setDuration(event.target.value)}
                placeholder="2 weeks"
              />
            </Field>
            <Field label="Start date" htmlFor="course-start">
              <Input
                id="course-start"
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </Field>
            <Field label="Time slot" htmlFor="course-time">
              <Input
                id="course-time"
                maxLength={40}
                value={timeSlot}
                onChange={(event) => setTimeSlot(event.target.value)}
                placeholder="17:30 - 19:30"
              />
            </Field>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Delivery mode" htmlFor="course-mode">
              <Select value={mode} onValueChange={(value) => setMode(value as NonNullable<CourseMode> | "none")}>
                <SelectTrigger id="course-mode">
                  <SelectValue placeholder="Unspecified" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unspecified</SelectItem>
                  <SelectItem value="self_paced">Self-paced</SelectItem>
                  <SelectItem value="interactive">Interactive</SelectItem>
                  <SelectItem value="special_schedule">Special schedule</SelectItem>
                  <SelectItem value="blended">Blended</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Fee - UNZA (ZMW)" htmlFor="course-fee-unza">
              <Input
                id="course-fee-unza"
                type="number"
                min="0"
                step="0.01"
                value={feeUnza}
                onChange={(event) => setFeeUnza(event.target.value)}
                placeholder="250.00"
              />
            </Field>
            <Field label="Fee - Non-UNZA (ZMW)" htmlFor="course-fee-external">
              <Input
                id="course-fee-external"
                type="number"
                min="0"
                step="0.01"
                value={feeNonUnza}
                onChange={(event) => setFeeNonUnza(event.target.value)}
                placeholder="1500.00"
              />
            </Field>
          </div>

          <Field label="Description" htmlFor="course-description">
            <Textarea
              id="course-description"
              rows={3}
              maxLength={1000}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </Field>

          <div className="rounded-[1.35rem] border border-border/70 bg-white/72 p-4 shadow-[var(--shadow-soft)]">
            <div className="flex items-center gap-3">
              <Switch id="course-active" checked={active} onCheckedChange={setActive} />
              <Label htmlFor="course-active" className="text-sm font-semibold">
                Active and available for enrolment
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving..." : "Save course"}
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
