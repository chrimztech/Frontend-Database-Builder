import { useState } from "react";
import {
  Archive,
  CheckCircle2,
  Database,
  Download,
  FileJson2,
  FileText,
  HardDrive,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  AdminEmptyState,
  AdminPageHeader,
  AdminPanel,
  AdminPanelHeader,
  AdminStat,
} from "@/components/admin/admin-ui";

// ── helpers ──────────────────────────────────────────────────────────────────

function dateStamp() {
  return new Date().toISOString().slice(0, 10);
}

function fmtBytes(bytes: number) {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / 1024 ** i).toFixed(1)} ${units[i]}`;
}

function triggerDownload(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function toCSV(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[,"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join(
    "\n",
  );
}

// ── table config ─────────────────────────────────────────────────────────────

const TABLES = [
  {
    key: "students" as const,
    label: "Students",
    description: "Student identity records and personal details",
  },
  {
    key: "courses" as const,
    label: "Courses",
    description: "Training catalogue and course metadata",
  },
  {
    key: "enrolments" as const,
    label: "Enrolments",
    description: "Student–course enrolment records and payment status",
  },
  {
    key: "certificates" as const,
    label: "Certificates",
    description: "Issued certificate registry with codes and revocation state",
  },
  {
    key: "student_access_log" as const,
    label: "Audit log",
    description: "Administrative access trail and actor history",
  },
] as const;

// ── component ─────────────────────────────────────────────────────────────────

type StorageManifest = {
  certificates: { count: number; total_bytes: number; files: { name: string; size: number; updated_at: string | null }[] };
  branding: { count: number; total_bytes: number; files: { name: string; size: number; updated_at: string | null }[] };
};

export function BackupTab() {
  const [fullBusy, setFullBusy] = useState(false);
  const [tableBusy, setTableBusy] = useState<string | null>(null);
  const [storageBusy, setStorageBusy] = useState(false);
  const [manifest, setManifest] = useState<StorageManifest | null>(null);
  const [lastBackup, setLastBackup] = useState<string | null>(null);

  async function downloadFullBackup() {
    setFullBusy(true);
    try {
      const { createFullBackup } = await import("@/lib/api/backup.functions");
      const result = await createFullBackup();
      const payload = {
        exported_at: result.exported_at,
        schema_version: result.schema_version,
        system: result.system,
        counts: result.counts,
        tables: JSON.parse(result.tables_json),
      };
      triggerDownload(
        JSON.stringify(payload, null, 2),
        `unza-tels-full-backup-${dateStamp()}.json`,
        "application/json",
      );
      setLastBackup(new Date().toLocaleString("en-GB"));
      toast.success("Full backup downloaded");
    } catch (err: any) {
      toast.error(err?.message ?? "Backup failed");
    } finally {
      setFullBusy(false);
    }
  }

  async function downloadTable(
    table: (typeof TABLES)[number]["key"],
    label: string,
  ) {
    setTableBusy(table);
    try {
      const { exportTableData } = await import("@/lib/api/backup.functions");
      const { rows_json } = await exportTableData({ data: { table } });
      const rows: Record<string, unknown>[] = JSON.parse(rows_json);
      triggerDownload(
        toCSV(rows),
        `unza-tels-${table}-${dateStamp()}.csv`,
        "text/csv",
      );
      toast.success(`${label} exported as CSV`);
    } catch (err: any) {
      toast.error(err?.message ?? "Export failed");
    } finally {
      setTableBusy(null);
    }
  }

  async function downloadTableJSON(
    table: (typeof TABLES)[number]["key"],
    label: string,
  ) {
    setTableBusy(`${table}-json`);
    try {
      const { exportTableData } = await import("@/lib/api/backup.functions");
      const { rows_json } = await exportTableData({ data: { table } });
      const rows = JSON.parse(rows_json);
      triggerDownload(
        JSON.stringify(rows, null, 2),
        `unza-tels-${table}-${dateStamp()}.json`,
        "application/json",
      );
      toast.success(`${label} exported as JSON`);
    } catch (err: any) {
      toast.error(err?.message ?? "Export failed");
    } finally {
      setTableBusy(null);
    }
  }

  async function loadManifest() {
    setStorageBusy(true);
    try {
      const { getStorageManifest } = await import("@/lib/api/backup.functions");
      const data = await getStorageManifest();
      setManifest(data as StorageManifest);
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to load storage inventory");
    } finally {
      setStorageBusy(false);
    }
  }

  function downloadManifestJSON() {
    if (!manifest) return;
    triggerDownload(
      JSON.stringify({ generated_at: new Date().toISOString(), ...manifest }, null, 2),
      `unza-tels-storage-manifest-${dateStamp()}.json`,
      "application/json",
    );
  }

  const totalFiles = manifest
    ? manifest.certificates.count + manifest.branding.count
    : null;
  const totalBytes = manifest
    ? manifest.certificates.total_bytes + manifest.branding.total_bytes
    : null;

  return (
    <div className="space-y-8">
      <AdminPageHeader
        eyebrow="Configuration"
        title="Backup & export"
        description="Export all system records and storage inventories for safekeeping, auditing, or disaster recovery."
      />

      {/* Summary stats */}
      {manifest && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <AdminStat label="Certificate PDFs" value={manifest.certificates.count} hint="Files in certificates bucket" />
          <AdminStat label="Branding assets" value={manifest.branding.count} hint="Files in branding bucket" />
          <AdminStat label="Total files" value={totalFiles ?? 0} hint="Across all storage buckets" />
          <AdminStat label="Storage used" value={fmtBytes(totalBytes ?? 0)} hint="Combined size of all stored files" />
        </div>
      )}

      {/* Full system backup */}
      <AdminPanel>
        <AdminPanelHeader
          title="Full system backup"
          description="Downloads every table as a single structured JSON file — suitable for disaster recovery or system migration."
        />
        <div className="px-6 pb-6">
          <div className="flex flex-wrap items-center gap-5 rounded-[1.35rem] border border-border/70 bg-muted/20 p-5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
              <Archive className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold">Complete data export · JSON</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Includes students, courses, enrolments, certificates, audit log, user roles and org settings.
              </p>
              {lastBackup && (
                <p className="mt-1 flex items-center gap-1.5 text-xs text-success">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Last downloaded {lastBackup}
                </p>
              )}
            </div>
            <Button onClick={downloadFullBackup} disabled={fullBusy}>
              {fullBusy ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              Download backup
            </Button>
          </div>
        </div>
      </AdminPanel>

      {/* Per-table exports */}
      <AdminPanel>
        <AdminPanelHeader
          title="Table-by-table export"
          description="Export individual tables as CSV or JSON for spreadsheet analysis, selective restore, or reporting."
        />
        <div className="divide-y divide-border/40 px-6 pb-2">
          {TABLES.map(({ key, label, description }) => (
            <div key={key} className="flex flex-wrap items-center gap-3 py-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted/60">
                <FileText className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium">{label}</p>
                <p className="text-sm text-muted-foreground">{description}</p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={tableBusy === key || tableBusy === `${key}-json`}
                  onClick={() => downloadTable(key, label)}
                >
                  {tableBusy === key ? (
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="mr-1 h-3.5 w-3.5" />
                  )}
                  CSV
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={tableBusy === key || tableBusy === `${key}-json`}
                  onClick={() => downloadTableJSON(key, label)}
                >
                  {tableBusy === `${key}-json` ? (
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <FileJson2 className="mr-1 h-3.5 w-3.5" />
                  )}
                  JSON
                </Button>
              </div>
            </div>
          ))}
        </div>
      </AdminPanel>

      {/* Storage inventory */}
      <AdminPanel>
        <AdminPanelHeader
          title="Storage inventory"
          description="Scan the certificates and branding buckets to see what files are stored and their sizes."
          actions={
            <div className="flex gap-2">
              {manifest && (
                <Button size="sm" variant="outline" onClick={downloadManifestJSON}>
                  <Download className="mr-1 h-4 w-4" /> Manifest JSON
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={loadManifest} disabled={storageBusy}>
                {storageBusy ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-1 h-4 w-4" />
                )}
                {manifest ? "Refresh" : "Scan storage"}
              </Button>
            </div>
          }
        />

        {manifest ? (
          <div className="px-6 pb-6 space-y-4">
            {[
              {
                label: "Certificate PDFs",
                icon: FileJson2,
                data: manifest.certificates,
                hint: "certificates bucket",
              },
              {
                label: "Branding assets",
                icon: HardDrive,
                data: manifest.branding,
                hint: "branding bucket",
              },
            ].map(({ label, icon: Icon, data, hint }) => (
              <div key={label} className="rounded-[1.35rem] border border-border/70 p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <p className="font-semibold">{label}</p>
                  <span className="text-xs text-muted-foreground">— {hint}</span>
                </div>
                <div className="flex gap-8 mb-4">
                  <div>
                    <p className="text-2xl font-bold">{data.count}</p>
                    <p className="text-xs text-muted-foreground">files</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{fmtBytes(data.total_bytes)}</p>
                    <p className="text-xs text-muted-foreground">total size</p>
                  </div>
                </div>
                {data.files.length > 0 && (
                  <div className="overflow-x-auto rounded-xl border border-border/60">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/40">
                        <tr>
                          <th className="p-2 text-left font-semibold text-muted-foreground">File name</th>
                          <th className="p-2 text-right font-semibold text-muted-foreground">Size</th>
                          <th className="p-2 text-right font-semibold text-muted-foreground">Last modified</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.files.map((f) => (
                          <tr key={f.name} className="border-t border-border/40">
                            <td className="p-2 font-mono">{f.name}</td>
                            <td className="p-2 text-right text-muted-foreground">{fmtBytes(f.size)}</td>
                            <td className="p-2 text-right text-muted-foreground">
                              {f.updated_at
                                ? new Date(f.updated_at).toLocaleDateString("en-GB")
                                : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="px-6 pb-6">
            <AdminEmptyState
              icon={Database}
              title="Storage not scanned"
              description="Click Scan storage to load a full inventory of certificate PDFs and branding files."
            />
          </div>
        )}
      </AdminPanel>
    </div>
  );
}
