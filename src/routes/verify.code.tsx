import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { verifyCertificateByCode } from '@/lib/api/certificates.functions';
import { Button } from '@/components/ui/button';

export const Route = createFileRoute('/verify/code')({
  component: VerifyCodePage,
  head: () => ({ meta: [{ title: 'Verify certificate' }] }),
});

function VerifyCodePage() {
  const [code, setCode] = useState('');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  async function onVerify(e?: any) {
    e?.preventDefault();
    setLoading(true);
    setResult(null);
    try {
      const res = await verifyCertificateByCode({ data: { certificateCode: code.trim() } });
      setResult(res);
    } catch (err: any) {
      setResult({ error: err.message ?? String(err) });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <div className="rounded-xl border bg-card p-8">
        <h1 className="text-2xl font-display mb-4">Verify certificate by code</h1>
        <form onSubmit={onVerify} className="flex gap-2">
          <input className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Enter certificate code" />
          <Button type="submit" disabled={loading || !code.trim()}>{loading ? 'Verifying…' : 'Verify'}</Button>
        </form>

        {result && (
          <div className="mt-6">
            {result.error ? (
              <div className="text-destructive">Error: {result.error}</div>
            ) : (
              <pre className="whitespace-pre-wrap text-sm">{JSON.stringify(result, null, 2)}</pre>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
