import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const EXPORT_TABLES = [
  "students",
  "courses",
  "enrolments",
  "certificates",
  "student_access_log",
  "user_roles",
  "org_settings",
] as const;

const ORDER_BY: Record<string, string> = {
  students: "created_at",
  courses: "created_at",
  enrolments: "enrolled_at",
  certificates: "created_at",
  student_access_log: "created_at",
  user_roles: "created_at",
  org_settings: "id",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchAll(table: string): Promise<any[]> {
  const { data, error } = await (supabaseAdmin as any)
    .from(table)
    .select("*")
    .order(ORDER_BY[table] ?? "id", { ascending: true })
    .limit(50_000);
  if (error) throw new Error(`${table}: ${error.message}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any[]) ?? [];
}

// Full JSON backup — all tables in one payload
export const createFullBackup = createServerFn({ method: "POST" }).handler(async () => {
  const [
    students,
    courses,
    enrolments,
    certificates,
    student_access_log,
    user_roles,
    org_settings,
  ] = await Promise.all(EXPORT_TABLES.map((t) => fetchAll(t)));

  // Return as a typed string so TanStack Start serialization is happy;
  // the client parses it back to JSON before triggering the download.
  return {
    exported_at: new Date().toISOString(),
    schema_version: "1.0" as string,
    system: "UNZA TeLS e-Certificate System" as string,
    // Serialise each table to a JSON string to avoid unknown-type issues
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
      students: students.length,
      courses: courses.length,
      enrolments: enrolments.length,
      certificates: certificates.length,
      student_access_log: student_access_log.length,
    },
  };
});

// Single-table export — returns rows as a JSON string to avoid serialization check
export const exportTableData = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      table: z.enum([
        "students",
        "courses",
        "enrolments",
        "certificates",
        "student_access_log",
      ]),
    }),
  )
  .handler(async ({ data }) => {
    const rows = await fetchAll(data.table);
    return { rows_json: JSON.stringify(rows) };
  });

// Storage manifest — lists branding files from the Spring Boot backend
export const getStorageManifest = createServerFn({ method: "POST" }).handler(async () => {
  const brandingRes = await supabaseAdmin.storage.from("branding").list();
  const brandingFiles: any[] = brandingRes.data ?? [];
  return {
    certificates: { count: 0, total_bytes: 0, files: [] },
    branding: {
      count: brandingFiles.length,
      total_bytes: brandingFiles.reduce((s: number, f: any) => s + (f.size ?? 0), 0),
      files: brandingFiles.map((f: any) => ({ name: f.name, size: f.size ?? 0, updated_at: null })),
    },
  };
});
