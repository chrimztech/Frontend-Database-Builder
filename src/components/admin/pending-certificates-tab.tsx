import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Award, CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { apiGet } from '@/lib/api';
import { generateCertificate as generateCertificateServer, markCertificateQueued } from '@/lib/api/certificates.functions';

type PendingEnrolment = {
  id: string;
  status: string;
  student: { id: string; full_name: string; email: string | null; national_id: string | null } | null;
  course: { id: string; name: string; prefix: string } | null;
};

async function generateCertificateWithPdf(enrolment: PendingEnrolment) {
  if (!enrolment.student || !enrolment.course) {
    throw new Error('Enrolment is missing a student or course');
  }

  const [cert] = await Promise.all([
    generateCertificateServer({ data: { enrolmentId: enrolment.id } }),
    import('@/lib/font-loader').then(({ preloadCustomFonts }) => preloadCustomFonts()),
  ]);
  await import('@/lib/branding').then(({ loadBranding }) =>
    loadBranding(cert.certificate_type).catch(() => null),
  );
  const { uploadCertificatePdf } = await import('@/lib/pdf');
  await uploadCertificatePdf({
    certificateId: cert.certificate_code,
    certificateType: cert.certificate_type,
    recipientName: enrolment.student.full_name,
    programme: enrolment.course.name,
    issueDate: new Date().toISOString().slice(0, 10),
    nrcNumber: enrolment.student.national_id ?? undefined,
  });

  return cert;
}

export function PendingCertificatesTab() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [busyOne, setBusyOne] = useState<Record<string, boolean>>({});
  const [bulkBusy, setBulkBusy] = useState(false);

  const pending = useQuery({
    queryKey: ['pending-certificates'],
    queryFn: async () => {
      // enrolments completed/certified and not linked to a certificate
      return apiGet<PendingEnrolment[]>(
        '/enrolments?statusIn=completed&statusIn=certified&noCertificate=true',
      );
    },
  });

  const rows = pending.data ?? [];
  const toggle = (id: string) => setSelected((s) => ({ ...s, [id]: !s[id] }));
  const selectedIds = Object.keys(selected).filter((k) => selected[k]);
  const allSelected = rows.length > 0 && rows.every((r) => selected[r.id]);

  function toggleSelectAll() {
    if (allSelected) {
      setSelected({});
    } else {
      setSelected(Object.fromEntries(rows.map((r) => [r.id, true])));
    }
  }

  function refresh() {
    qc.invalidateQueries({ queryKey: ['pending-certificates'] });
    qc.invalidateQueries({ queryKey: ['admin-certs'] });
    qc.invalidateQueries({ queryKey: ['admin-enrolments'] });
    qc.invalidateQueries({ queryKey: ['admin-student-profiles'] });
  }

  async function generateOne(enrolment: PendingEnrolment) {
    setBusyOne((s) => ({ ...s, [enrolment.id]: true }));
    try {
      const cert = await generateCertificateWithPdf(enrolment);
      toast.success(`Certificate ${cert.certificate_code} generated`);
      setSelected((s) => {
        const { [enrolment.id]: _drop, ...rest } = s;
        return rest;
      });
      refresh();
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to generate');
    } finally {
      setBusyOne((s) => ({ ...s, [enrolment.id]: false }));
    }
  }

  async function generateSelected() {
    const ids = selectedIds;
    if (!ids.length) return toast.error('No enrolments selected');
    setBulkBusy(true);
    let ok = 0;
    let fail = 0;
    for (const id of ids) {
      const enrolment = rows.find((r) => r.id === id);
      if (!enrolment) continue;
      setBusyOne((s) => ({ ...s, [id]: true }));
      try {
        await generateCertificateWithPdf(enrolment);
        ok++;
      } catch (e: any) {
        fail++;
        toast.error(`${enrolment.student?.full_name ?? 'Enrolment'}: ${e.message ?? 'failed'}`);
      } finally {
        setBusyOne((s) => ({ ...s, [id]: false }));
      }
    }
    setBulkBusy(false);
    setSelected({});
    if (ok > 0) toast.success(`Generated ${ok} certificate${ok === 1 ? '' : 's'}`);
    if (fail > 0 && ok === 0) return;
    refresh();
  }

  async function queueEmail(certificateId: string) {
    try {
      await markCertificateQueued({ data: { certificateId } });
      toast.success('Marked queued');
    } catch (e: any) {
      toast.error(e.message ?? 'Failed');
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="kicker">Pending certificates</p>
        <div className="flex items-center gap-2">
          <Button onClick={generateSelected} disabled={bulkBusy || selectedIds.length === 0}>
            <Award className="mr-1 h-4 w-4" />
            {bulkBusy ? 'Generating...' : `Generate selected${selectedIds.length ? ` (${selectedIds.length})` : ''}`}
          </Button>
        </div>
      </div>

      <div className="surface-panel rounded-xl overflow-hidden">
        {pending.isLoading ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Loading...</div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">No pending certificates.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={toggleSelectAll}
                    aria-label="Select all pending"
                  />
                </TableHead>
                <TableHead>Student</TableHead>
                <TableHead>Course</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((e) => (
                <TableRow key={e.id} className={selected[e.id] ? 'bg-primary/5' : undefined}>
                  <TableCell>
                    <Checkbox
                      checked={!!selected[e.id]}
                      onCheckedChange={() => toggle(e.id)}
                      aria-label="Select row"
                    />
                  </TableCell>
                  <TableCell>{e.student?.full_name ?? '-'}<div className="text-xs text-muted-foreground">{e.student?.email ?? '-'}</div></TableCell>
                  <TableCell>{e.course?.name ?? e.course?.id}<div className="text-xs text-muted-foreground">{e.course?.prefix ?? ''}</div></TableCell>
                  <TableCell className="text-muted-foreground">{e.status}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="ghost" disabled={!!busyOne[e.id]} onClick={() => generateOne(e)}>
                        {busyOne[e.id] ? 'Generating...' : 'Generate'}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
