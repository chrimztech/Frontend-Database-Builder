import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { updateCertificatesStatus } from '@/lib/api/certificates.functions';

export function CertificateQueueTab() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const q = useQuery({
    queryKey: ['certificate-queue'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('certificates')
        .select('id, certificate_code, email_status, student_id, students(id, full_name, email), course_id, courses(id, name, prefix), created_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const toggle = (id: string) => setSelected((s) => ({ ...s, [id]: !s[id] }));

  const selectedIds = Object.keys(selected).filter((k) => selected[k]);

  async function batchUpdate(status: string) {
    if (!selectedIds.length) return toast.error('No certificates selected');
    try {
      await updateCertificatesStatus({ data: { certificateIds: selectedIds, status } });
      toast.success(`Updated ${selectedIds.length} certificates to ${status}`);
      setSelected({});
      qc.invalidateQueries({ queryKey: ['certificate-queue'] });
      qc.invalidateQueries({ queryKey: ['pending-certificates'] });
    } catch (e: any) {
      toast.error(e.message ?? 'Failed');
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-display">Certificate queue</h2>
        <div className="flex items-center gap-2">
          <Button onClick={() => batchUpdate('queued')}>Mark queued</Button>
          <Button onClick={() => batchUpdate('sent')}>Mark sent</Button>
          <Button onClick={() => batchUpdate('failed')}>Mark failed</Button>
        </div>
      </div>

      <div className="rounded-lg border bg-card overflow-hidden">
        {q.isLoading ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Loading…</div>
        ) : (q.data ?? []).length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">No certificates found.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead></TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Student</TableHead>
                <TableHead>Course</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(q.data ?? []).map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <input type="checkbox" checked={!!selected[c.id]} onChange={() => toggle(c.id)} />
                  </TableCell>
                  <TableCell>{c.certificate_code ?? '—'}</TableCell>
                  <TableCell>{c.students?.full_name ?? '—'}<div className="text-xs text-muted-foreground">{c.students?.email ?? ''}</div></TableCell>
                  <TableCell>{c.courses?.name ?? c.course_id}</TableCell>
                  <TableCell className="text-muted-foreground">{c.email_status ?? 'pending'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
