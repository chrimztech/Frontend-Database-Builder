import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRight, Search, Tag, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";

type StudentCategory = "unza" | "non_unza";

type StudentMetadata = {
  department?: string;
  program?: string;
  year_of_study?: string;
  study_mode?: string;
  employer?: string;
  job_title?: string;
  coach?: string;
  learning_goals?: string;
  skills?: string[];
  tags?: string[];
  status_notes?: string;
  secondary_email?: string | null;
  secondary_phone?: string | null;
  address_line?: string | null;
  city?: string | null;
  postal_code?: string | null;
  country?: string | null;
};

type StudentProfile = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  category: StudentCategory;
  unza_student_id: string | null;
  national_id: string | null;
  notes: string | null;
  metadata: StudentMetadata | null;
  created_at: string;
};

function normalizeText(value: string | null | undefined) {
  return (value ?? "").trim();
}

function joinTags(value: string) {
  return value.split(",").map((t) => t.trim()).filter(Boolean);
}

export function StudentProfilesTab() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<"all" | StudentCategory>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const students = useQuery({
    queryKey: ["admin-student-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("id, full_name, email, phone, category, unza_student_id, national_id, notes, metadata, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as StudentProfile[];
    },
  });

  const selected = useMemo(
    () => (students.data ?? []).find((student) => student.id === selectedId) ?? (students.data?.[0] ?? null),
    [students.data, selectedId],
  );

  const enrolmentsQuery = useQuery({
    queryKey: ["student-enrolments", selected?.id],
    enabled: !!selected?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("enrolments")
        .select("id, status, enrolled_at, course_id, courses(id, name, code)")
        .eq("student_id", selected!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (students.data ?? []).filter((student) => {
      if (category !== "all" && student.category !== category) return false;
      if (!q) return true;
      const metadataText = JSON.stringify(student.metadata ?? {}).toLowerCase();
      return [
        student.full_name,
        student.email,
        student.phone,
        student.unza_student_id,
        student.national_id,
        student.notes,
        metadataText,
      ]
        .filter((v): v is string => Boolean(v))
        .some((value) => value.toLowerCase().includes(q));
    });
  }, [students.data, search, category]);

  const counts = {
    all: students.data?.length ?? 0,
    unza: (students.data ?? []).filter((s) => s.category === "unza").length,
    nonUnza: (students.data ?? []).filter((s) => s.category === "non_unza").length,
  };

  const metadata = selected?.metadata ?? {};
  const [email, setEmail] = useState(selected?.email ?? "");
  const [phone, setPhone] = useState(selected?.phone ?? "");
  const [department, setDepartment] = useState(metadata.department ?? "");
  const [program, setProgram] = useState(metadata.program ?? "");
  const [yearOfStudy, setYearOfStudy] = useState(metadata.year_of_study ?? "");
  const [studyMode, setStudyMode] = useState(metadata.study_mode ?? "");
  const [employer, setEmployer] = useState(metadata.employer ?? "");
  const [jobTitle, setJobTitle] = useState(metadata.job_title ?? "");
  const [coach, setCoach] = useState(metadata.coach ?? "");
  const [learningGoals, setLearningGoals] = useState(metadata.learning_goals ?? "");
  const [skills, setSkills] = useState((metadata.skills ?? []).join(", "));
  const [tags, setTags] = useState((metadata.tags ?? []).join(", "));
  const [statusNotes, setStatusNotes] = useState(metadata.status_notes ?? "");
  const [secondaryEmail, setSecondaryEmail] = useState(metadata.secondary_email ?? "");
  const [secondaryPhone, setSecondaryPhone] = useState(metadata.secondary_phone ?? "");
  const [addressLine, setAddressLine] = useState(metadata.address_line ?? "");
  const [city, setCity] = useState(metadata.city ?? "");
  const [postalCode, setPostalCode] = useState(metadata.postal_code ?? "");
  const [country, setCountry] = useState(metadata.country ?? "");

  const syncSelected = () => {
    setEmail(selected?.email ?? "");
    setPhone(selected?.phone ?? "");
    setDepartment(metadata.department ?? "");
    setProgram(metadata.program ?? "");
    setYearOfStudy(metadata.year_of_study ?? "");
    setStudyMode(metadata.study_mode ?? "");
    setEmployer(metadata.employer ?? "");
    setJobTitle(metadata.job_title ?? "");
    setCoach(metadata.coach ?? "");
    setLearningGoals(metadata.learning_goals ?? "");
    setSkills((metadata.skills ?? []).join(", "));
    setTags((metadata.tags ?? []).join(", "));
    setStatusNotes(metadata.status_notes ?? "");
    setSecondaryEmail(metadata.secondary_email ?? "");
    setSecondaryPhone(metadata.secondary_phone ?? "");
    setAddressLine(metadata.address_line ?? "");
    setCity(metadata.city ?? "");
    setPostalCode(metadata.postal_code ?? "");
    setCountry(metadata.country ?? "");
  };

  useMemo(() => {
    syncSelected();
  }, [selected?.id]);

  async function saveProfile() {
    if (!selected) return;
    setBusy(true);
    try {
      const payload = {
        metadata: {
          department: normalizeText(department) || null,
          program: normalizeText(program) || null,
          year_of_study: normalizeText(yearOfStudy) || null,
          study_mode: normalizeText(studyMode) || null,
          employer: normalizeText(employer) || null,
          job_title: normalizeText(jobTitle) || null,
          coach: normalizeText(coach) || null,
          learning_goals: normalizeText(learningGoals) || null,
          skills: joinTags(skills),
          tags: joinTags(tags),
          status_notes: normalizeText(statusNotes) || null,
          secondary_email: normalizeText(secondaryEmail) || null,
          secondary_phone: normalizeText(secondaryPhone) || null,
          address_line: normalizeText(addressLine) || null,
          city: normalizeText(city) || null,
          postal_code: normalizeText(postalCode) || null,
          country: normalizeText(country) || null,
        },
      };

      // Update top-level contact fields (email/phone) alongside metadata
      const updatePayload: any = { ...payload };
      updatePayload.email = normalizeText(email) || null;
      updatePayload.phone = normalizeText(phone) || null;

      const { error } = await supabase.from("students").update(updatePayload).eq("id", selected.id);
      if (error) throw error;
      toast.success("Student profile metadata saved");
      qc.invalidateQueries({ queryKey: ["admin-student-profiles"] });
    } catch (error: any) {
      toast.error(error.message ?? "Unable to save profile metadata");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Student intelligence</CardTitle>
            <CardDescription>Find students by name, ID, email, or metadata and publish richer student profiles.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Search student metadata</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input className="pl-10" placeholder="Search students..." value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-sm text-muted-foreground">
              <div className="rounded-lg border bg-muted/60 p-3 text-center">
                <div className="font-semibold text-foreground">{counts.all}</div>
                <div>All</div>
              </div>
              <div className="rounded-lg border bg-muted/60 p-3 text-center">
                <div className="font-semibold text-foreground">{counts.unza}</div>
                <div>UNZA</div>
              </div>
              <div className="rounded-lg border bg-muted/60 p-3 text-center">
                <div className="font-semibold text-foreground">{counts.nonUnza}</div>
                <div>Non-UNZA</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Student list</CardTitle>
            <CardDescription>{filtered.length} students match the current filters.</CardDescription>
          </CardHeader>
          <div className="divide-y border-t">
            {filtered.map((student) => (
              <button
                key={student.id}
                type="button"
                className={`w-full text-left px-4 py-3 transition hover:bg-muted ${selected?.id === student.id ? "bg-muted/80" : ""}`}
                onClick={() => setSelectedId(student.id)}
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="font-medium">{student.full_name}</div>
                    <div className="text-xs text-muted-foreground">{student.email ?? student.phone ?? "No contact"}</div>
                  </div>
                  <Badge variant={student.category === "unza" ? "secondary" : "outline"}>
                    {student.category === "unza" ? "UNZA" : "Non-UNZA"}
                  </Badge>
                </div>
                <div className="mt-2 flex flex-wrap gap-1 text-xs text-muted-foreground">
                  {student.metadata?.program ? <Badge variant="outline">{student.metadata.program}</Badge> : null}
                  {student.metadata?.department ? <Badge variant="outline">{student.metadata.department}</Badge> : null}
                  {student.metadata?.skills?.slice(0, 3).map((skill) => <Badge key={skill} variant="secondary">{skill}</Badge>)}
                </div>
              </button>
            ))}
            {filtered.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">No student matches the filter.</div>
            ) : null}
          </div>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Profile details</CardTitle>
            <CardDescription>Advanced student metadata and learning profile.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!selected ? (
              <div className="text-sm text-muted-foreground">Select a student to begin.</div>
            ) : (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <Card className="border-dashed border-slate-200">
                    <CardHeader className="space-y-2">
                      <CardTitle className="text-sm">Profile</CardTitle>
                      <CardDescription>{selected.full_name}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm text-muted-foreground">
                      <div>
                        <Label className="text-xs">Primary email</Label>
                        <div className="text-sm">{selected.email ?? "-"}</div>
                      </div>
                      <div>
                        <Label className="text-xs">Primary phone</Label>
                        <div className="text-sm">{selected.phone ?? "-"}</div>
                      </div>
                      <div>ID: {selected.category === "unza" ? selected.unza_student_id ?? "-" : selected.national_id ?? "-"}</div>
                    </CardContent>
                  </Card>
                  <Card className="border-dashed border-slate-200">
                    <CardHeader className="space-y-2">
                      <CardTitle className="text-sm">Learning snapshot</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm text-muted-foreground">
                      <div>{selected.metadata?.program ?? "No program set"}</div>
                      <div>{selected.metadata?.year_of_study ? `Year ${selected.metadata.year_of_study}` : "Year not specified"}</div>
                      <div>{selected.metadata?.study_mode ? `${selected.metadata.study_mode} mode` : "Study mode unavailable"}</div>
                    </CardContent>
                  </Card>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="space-y-6">
                    <div>
                      <Label htmlFor="primaryEmail">Primary email</Label>
                      <Input id="primaryEmail" value={email} onChange={(e) => setEmail(e.target.value)} />
                    </div>
                    <div>
                      <Label htmlFor="primaryPhone">Primary phone</Label>
                      <Input id="primaryPhone" value={phone} onChange={(e) => setPhone(e.target.value)} />
                    </div>
                    <div>
                      <Label htmlFor="secondaryEmail">Secondary email</Label>
                      <Input id="secondaryEmail" value={secondaryEmail} onChange={(e) => setSecondaryEmail(e.target.value)} />
                    </div>
                    <div>
                      <Label htmlFor="secondaryPhone">Secondary phone</Label>
                      <Input id="secondaryPhone" value={secondaryPhone} onChange={(e) => setSecondaryPhone(e.target.value)} />
                    </div>
                    <div>
                      <Label htmlFor="department">Department / faculty</Label>
                      <Input id="department" value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="e.g. Computer Science" />
                    </div>
                    <div>
                      <Label htmlFor="program">Program</Label>
                      <Input id="program" value={program} onChange={(e) => setProgram(e.target.value)} placeholder="e.g. Data Analytics" />
                    </div>
                    <div>
                      <Label htmlFor="yearOfStudy">Year of study</Label>
                      <Input id="yearOfStudy" value={yearOfStudy} onChange={(e) => setYearOfStudy(e.target.value)} placeholder="e.g. 2" />
                    </div>
                    <div>
                      <Label htmlFor="studyMode">Study mode</Label>
                      <Input id="studyMode" value={studyMode} onChange={(e) => setStudyMode(e.target.value)} placeholder="e.g. blended" />
                    </div>
                    <div>
                      <Label htmlFor="addressLine">Address</Label>
                      <Input id="addressLine" value={addressLine} onChange={(e) => setAddressLine(e.target.value)} placeholder="Street address" />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" />
                      <Input id="postalCode" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} placeholder="Postal code" />
                      <Input id="country" value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Country" />
                    </div>
                    <div>
                      <Label htmlFor="learningGoals">Learning goals</Label>
                      <Textarea id="learningGoals" rows={3} value={learningGoals} onChange={(e) => setLearningGoals(e.target.value)} placeholder="What this student wants to achieve" />
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div>
                      <Label htmlFor="employer">Employer</Label>
                      <Input id="employer" value={employer} onChange={(e) => setEmployer(e.target.value)} placeholder="Employer or organisation" />
                    </div>
                    <div>
                      <Label htmlFor="jobTitle">Job title</Label>
                      <Input id="jobTitle" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="Job title or role" />
                    </div>
                    <div>
                      <Label htmlFor="coach">Coach / mentor</Label>
                      <Input id="coach" value={coach} onChange={(e) => setCoach(e.target.value)} placeholder="Mentor name" />
                    </div>
                    <div>
                      <Label htmlFor="skills">Skills / tags</Label>
                      <Input id="skills" value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="Comma-separated skill tags" />
                    </div>
                    <div>
                      <Label htmlFor="metadataTags">Profile tags</Label>
                      <Input id="metadataTags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Comma-separated tags" />
                    </div>
                  </div>
                </div>

                <div>
                  <Label htmlFor="statusNotes">Status & coaching notes</Label>
                  <Textarea id="statusNotes" rows={4} value={statusNotes} onChange={(e) => setStatusNotes(e.target.value)} placeholder="Add profile notes, next steps, or support recommendations." />
                </div>
              </div>
            )}
          </CardContent>
          <CardFooter className="justify-between gap-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Tag className="h-4 w-4" /> Rich metadata enables deeper student insights.
            </div>
            <Button onClick={saveProfile} disabled={!selected || busy}>
              {busy ? "Saving..." : "Save profile"}
            </Button>
          </CardFooter>
        </Card>

        {selected ? (
          <Card>
            <CardHeader>
              <CardTitle>Metadata preview</CardTitle>
              <CardDescription>Current metadata values for the selected student.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-lg border p-3">
                  <div className="font-semibold">Skills</div>
                  <div className="mt-2 flex flex-wrap gap-2">{(selected.metadata?.skills ?? []).map((skill) => <Badge key={skill}>{skill}</Badge>)}</div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="font-semibold">Tags</div>
                  <div className="mt-2 flex flex-wrap gap-2">{(selected.metadata?.tags ?? []).map((tag) => <Badge key={tag}>{tag}</Badge>)}</div>
                </div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="font-semibold">Registered courses</div>
                <div className="mt-2 text-sm">
                  {enrolmentsQuery.isLoading ? (
                    <div className="text-muted-foreground">Loading...</div>
                  ) : (enrolmentsQuery.data ?? []).length === 0 ? (
                    <div className="text-muted-foreground">No enrolments</div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {(enrolmentsQuery.data ?? []).map((e: any) => (
                        <div key={e.id} className="flex items-center justify-between">
                          <div>
                            <div className="font-medium">{e.courses?.name ?? e.course_id}</div>
                            <div className="text-xs text-muted-foreground">{e.courses?.code ?? ""} - {e.status}</div>
                          </div>
                          <div className="text-xs text-muted-foreground">{e.enrolled_at ? new Date(e.enrolled_at).toLocaleDateString() : ''}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="rounded-lg border p-4 bg-muted/50">
                <div className="font-semibold">Learning Goals</div>
                <p className="mt-2 text-sm text-muted-foreground">{selected.metadata?.learning_goals ?? "No learning goals defined."}</p>
              </div>
              <div className="rounded-lg border p-4 bg-muted/50">
                <div className="font-semibold">Coach notes</div>
                <p className="mt-2 text-sm text-muted-foreground">{selected.metadata?.status_notes ?? "No profile notes yet."}</p>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

