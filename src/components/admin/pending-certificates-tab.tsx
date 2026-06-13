import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { generateCertificate, markCertificateQueued } from '@/lib/api/certificates.functions';

export function PendingCertificatesTab() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const pending = useQuery({
    queryKey: ['pending-certificates'],
    queryFn: async () => {
      // enrolments completed/certified and not linked to a certificate
      const { data, error } = await supabase
        .from('enrolments')
        .select('id, status, student_id, course_id, students(id, full_name, email), courses(id, name, prefix)')
        .in('status', ['completed','certified'])
        .is('certificate_id', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const toggle = (id: string) => setSelected((s) => ({ ...s, [id]: !s[id] }));

  async function generateOne(enrolmentId: string) {
    try {
      const res = await generateCertificate({ data: { enrolmentId } });
      toast.success(`Certificate ${res.certificate_code} created`);
      qc.invalidateQueries({ queryKey: ['pending-certificates'] });
      qc.invalidateQueries({ queryKey: ['admin-student-profiles'] });
    } catch (e: any) {
      toast.error(e.message ?? 'Failed');
    }
  }

  async function generateSelected() {
    const ids = Object.keys(selected).filter((k) => selected[k]);
    if (!ids.length) return toast.error('No enrolments selected');
    try {
      for (const id of ids) {
        await generateCertificate({ data: { enrolmentId: id } });
      }
      toast.success('Certificates created');
      setSelected({});
      qc.invalidateQueries({ queryKey: ['pending-certificates'] });
      qc.invalidateQueries({ queryKey: ['admin-student-profiles'] });
    } catch (e: any) {
      toast.error(e.message ?? 'Failed');
    }
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
          <Button onClick={generateSelected}>Generate selected</Button>
        </div>
      </div>

      <div className="surface-panel rounded-xl overflow-hidden">
        {pending.isLoading ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Loading...</div>
        ) : (pending.data ?? []).length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">No pending certificates.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead></TableHead>
                <TableHead>Student</TableHead>
                <TableHead>Course</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(pending.data ?? []).map((e) => (
                <TableRow key={e.id}>
                  <TableCell>
                    <input type="checkbox" checked={!!selected[e.id]} onChange={() => toggle(e.id)} />
                  </TableCell>
                  <TableCell>{e.students?.full_name ?? '-'}<div className="text-xs text-muted-foreground">{e.students?.email ?? '-'}</div></TableCell>
                  <TableCell>{e.courses?.name ?? e.course_id}<div className="text-xs text-muted-foreground">{e.courses?.prefix ?? ''}</div></TableCell>
                  <TableCell className="text-muted-foreground">{e.status}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="ghost" onClick={() => generateOne(e.id)}>Generate</Button>
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

