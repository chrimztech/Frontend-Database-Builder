import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Send, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { sendCertificateEmail, updateCertificatesStatus } from '@/lib/api/certificates.functions';

type EmailStatus = 'not_sent' | 'queued' | 'sent' | 'failed';

const STATUS_BADGE: Record<EmailStatus, string> = {
  not_sent:  'bg-muted text-muted-foreground',
  queued:    'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  sent:      'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  failed:    'bg-destructive/15 text-destructive',
};
const STATUS_LABEL: Record<EmailStatus, string> = {
  not_sent: 'Not sent', queued: 'Queued', sent: 'Sent', failed: 'Failed',
};

export function CertificateQueueTab() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [sending, setSending] = useState<Record<string, boolean>>({});

  const q = useQuery({
    queryKey: ['certificate-queue'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('certificates')
        .select('id, certificate_id, certificate_code, email_status, recipient_name, recipient_email, programme, created_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['certificate-queue'] });
    qc.invalidateQueries({ queryKey: ['pending-certificates'] });
  };

  const toggle = (id: string) => setSelected((s) => ({ ...s, [id]: !s[id] }));
  const selectedIds = Object.keys(selected).filter((k) => selected[k]);

  async function sendOne(certificateId: string) {
    setSending((s) => ({ ...s, [certificateId]: true }));
    try {
      const result = await sendCertificateEmail({ data: { certificateId } });
      toast.success(`Certificate sent to ${(result as any).sentTo}`);
      refresh();
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to send');
      // Mark as failed in DB
      await updateCertificatesStatus({ data: { certificateIds: [certificateId], status: 'failed' } });
      refresh();
    } finally {
      setSending((s) => ({ ...s, [certificateId]: false }));
    }
  }

  async function sendSelected() {
    if (!selectedIds.length) return toast.error('No certificates selected');
    let ok = 0; let fail = 0;
    for (const id of selectedIds) {
      setSending((s) => ({ ...s, [id]: true }));
      try {
        await sendCertificateEmail({ data: { certificateId: id } });
        ok++;
      } catch (e: any) {
        fail++;
        await updateCertificatesStatus({ data: { certificateIds: [id], status: 'failed' } }).catch(() => {});
      } finally {
        setSending((s) => ({ ...s, [id]: false }));
      }
    }
    setSelected({});
    refresh();
    if (ok > 0) toast.success(`Sent ${ok} certificate${ok !== 1 ? 's' : ''}`);
    if (fail > 0) toast.error(`${fail} failed — check those rows`);
  }

  const unsent = (q.data ?? []).filter((c) => c.email_status !== 'sent');
  const allSelected = unsent.length > 0 && unsent.every((c) => selected[c.id]);

  function toggleAll() {
    if (allSelected) setSelected({});
    else setSelected(Object.fromEntries(unsent.map((c) => [c.id, true])));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-display">Certificate queue</h2>
          <p className="text-sm text-muted-foreground">
            Send certificates to students by email from <strong>train@unza.ac.zm</strong>.
            The PDF is attached automatically.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={refresh}>
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh
          </Button>
          <Button
            size="sm"
            disabled={selectedIds.length === 0 || Object.values(sending).some(Boolean)}
            onClick={sendSelected}
            className="bg-accent text-accent-foreground hover:bg-accent/90"
          >
            <Send className="h-4 w-4 mr-1" />
            Send {selectedIds.length > 0 ? `${selectedIds.length} selected` : 'selected'}
          </Button>
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
                <TableHead className="w-10">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} title="Select all unsent" />
                </TableHead>
                <TableHead>Recipient</TableHead>
                <TableHead>Programme</TableHead>
                <TableHead>Certificate code</TableHead>
                <TableHead>Email status</TableHead>
                <TableHead>Issued</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(q.data ?? []).map((c) => {
                const isBusy = !!sending[c.id];
                const code = c.certificate_code ?? c.certificate_id ?? '—';
                const status: EmailStatus = c.email_status ?? 'not_sent';
                return (
                  <TableRow key={c.id} className={status === 'sent' ? 'opacity-60' : ''}>
                    <TableCell>
                      {status !== 'sent' && (
                        <input type="checkbox" checked={!!selected[c.id]} onChange={() => toggle(c.id)} />
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{c.recipient_name ?? '—'}</div>
                      <div className="text-xs text-muted-foreground">{c.recipient_email ?? 'No email address'}</div>
                    </TableCell>
                    <TableCell className="text-sm">{c.programme ?? '—'}</TableCell>
                    <TableCell className="font-mono text-xs">{code}</TableCell>
                    <TableCell>
                      <span className={`inline-block text-xs px-2 py-0.5 rounded font-medium ${STATUS_BADGE[status]}`}>
                        {STATUS_LABEL[status]}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {c.created_at ? new Date(c.created_at).toLocaleDateString() : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      {status !== 'sent' ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isBusy || !c.recipient_email}
                          onClick={() => sendOne(c.id)}
                          title={!c.recipient_email ? 'No email address on record' : 'Send certificate email'}
                        >
                          {isBusy ? (
                            <RefreshCw className="h-3.5 w-3.5 mr-1 animate-spin" />
                          ) : (
                            <Send className="h-3.5 w-3.5 mr-1" />
                          )}
                          {isBusy ? 'Sending…' : 'Send'}
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">Delivered</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Email is sent from <strong>{'{SMTP_FROM}'}</strong> configured in .env.local.
        If sending fails, check your SMTP credentials and that <code>train@unza.ac.zm</code> is authorised on your mail server.
      </p>
    </div>
  );
}
