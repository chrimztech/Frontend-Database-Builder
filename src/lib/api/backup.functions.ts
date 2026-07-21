// Backup & export helpers — plain async functions so they run in the browser
// where the user's JWT is available in localStorage.
import { apiGet } from "@/lib/api";

const TABLE_ENDPOINT: Record<string, string> = {
  students:           "/students",
  courses:            "/courses",
  enrolments:         "/enrolments",
  certificates:       "/certificates",
  student_access_log: "/reports/audit-log?page=0&size=50000",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchAll(table: string): Promise<any[]> {
  const path = TABLE_ENDPOINT[table];
  if (!path) throw new Error(`${table}: unknown table`);
  return apiGet<any[]>(path).catch((err: Error) => {
    throw new Error(`${table}: ${err.message}`);
  });
}

// Full JSON backup — all tables in one payload
export async function createFullBackup() {
  const [
    students,
    courses,
    enrolments,
    certificates,
    student_access_log,
    users,
    settings,
  ] = await Promise.all([
    fetchAll("students"),
    fetchAll("courses"),
    fetchAll("enrolments"),
    fetchAll("certificates"),
    fetchAll("student_access_log"),
    apiGet<any[]>("/users").catch(() => []),
    apiGet<any>("/settings").catch(() => null),
  ]);

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
      users,
      org_settings: settings ? [settings] : [],
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
  const brandingFiles = await apiGet<{ name: string; size: number }[]>("/branding").catch(() => []);
  return {
    certificates: { count: 0, total_bytes: 0, files: [] as never[] },
    branding: {
      count:       brandingFiles.length,
      total_bytes: brandingFiles.reduce((s, f) => s + (f.size ?? 0), 0),
      files: brandingFiles.map((f) => ({
        name:       f.name,
        size:       f.size ?? 0,
        updated_at: null as string | null,
      })),
    },
  };
}
