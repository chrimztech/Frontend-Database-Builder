// Backup & export helpers — plain async functions so they run in the browser
// where the user's JWT is available in localStorage.
import { apiGet, getToken } from "@/lib/api";

function apiBase(): string {
  return (import.meta.env.VITE_API_URL as string) ?? "http://localhost:8080/api";
}

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

type StorageBucket = {
  count: number;
  total_bytes: number;
  files: { name: string; size: number; updated_at: string | null }[];
};

// Storage manifest — file counts/sizes for both the certificates and branding
// buckets, computed server-side (GET /backup/manifest).
export async function getStorageManifest() {
  return apiGet<{ certificates: StorageBucket; branding: StorageBucket }>("/backup/manifest");
}

// Downloads one ZIP containing a full Postgres dump plus every certificate PDF
// and branding asset on disk — the actual file contents, not just a manifest.
export async function downloadFullBackupArchive(): Promise<void> {
  const token = getToken();
  const res = await fetch(`${apiBase()}/backup/full`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(text || `Backup failed: HTTP ${res.status}`);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `cemis-full-backup-${new Date().toISOString().slice(0, 10)}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
