// Backup & export helpers — plain async functions so they run in the browser
// where the user's JWT is available in localStorage.
import { supabase } from "@/integrations/supabase/client";

const ORDER_BY: Record<string, string> = {
  students:           "created_at",
  courses:            "created_at",
  enrolments:         "enrolled_at",
  certificates:       "created_at",
  student_access_log: "created_at",
  user_roles:         "created_at",
  org_settings:       "id",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchAll(table: string): Promise<any[]> {
  const { data, error } = await (supabase as any)
    .from(table)
    .select("*")
    .order(ORDER_BY[table] ?? "id", { ascending: true })
    .limit(50_000);
  if (error) throw new Error(`${table}: ${error.message}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any[]) ?? [];
}

// Full JSON backup — all tables in one payload
export async function createFullBackup() {
  const [
    students,
    courses,
    enrolments,
    certificates,
    student_access_log,
    user_roles,
    org_settings,
  ] = await Promise.all([
    "students",
    "courses",
    "enrolments",
    "certificates",
    "student_access_log",
    "user_roles",
    "org_settings",
  ].map((t) => fetchAll(t)));

  return {
    exported_at:    new Date().toISOString(),
    schema_version: "1.0" as string,
    system:         "UNZA TeLS e-Certificate System" as string,
    tables_json: JSON.stringify({
      students,
      courses,
      enrolments,
      certificates,
      student_access_log,
      user_roles,
      org_settings,
    }),
    counts: {
      students:           students.length,
      courses:            courses.length,
      enrolments:         enrolments.length,
      certificates:       certificates.length,
      student_access_log: student_access_log.length,
    },
  };
}

// Single-table export
export async function exportTableData({
  data,
}: {
  data: {
    table:
      | "students"
      | "courses"
      | "enrolments"
      | "certificates"
      | "student_access_log";
  };
}) {
  const rows = await fetchAll(data.table);
  return { rows_json: JSON.stringify(rows) };
}

// Storage manifest — lists branding files from the Spring Boot backend
export async function getStorageManifest() {
  const brandingRes = await supabase.storage.from("branding").list();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const brandingFiles: any[] = brandingRes.data ?? [];
  return {
    certificates: { count: 0, total_bytes: 0, files: [] as never[] },
    branding: {
      count:       brandingFiles.length,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      total_bytes: brandingFiles.reduce((s: number, f: any) => s + (f.size ?? 0), 0),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      files: brandingFiles.map((f: any) => ({
        name:       f.name as string,
        size:       (f.size ?? 0) as number,
        updated_at: null as string | null,
      })),
    },
  };
}
