import { useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Search, ShieldCheck } from "lucide-react";

import { verifyCertificateByCode } from "@/lib/api/certificates.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/verify/code")({
  component: VerifyCodePage,
  head: () => ({ meta: [{ title: "Verify certificate by code" }] }),
});

function VerifyCodePage() {
  const [code, setCode] = useState("");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  async function onVerify(event?: FormEvent) {
    event?.preventDefault();
    setLoading(true);
    setResult(null);

    try {
      const response = await verifyCertificateByCode({
        data: { certificateCode: code.trim() },
      });
      setResult(response);
    } catch (error: any) {
      setResult({ error: error.message ?? String(error) });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-14">
      <div className="surface-panel rounded-[1.8rem] p-6 sm:p-8">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to public verification
        </Link>

        <div className="mt-6 max-w-2xl">
          <p className="kicker">Manual Verification</p>
          <h1 className="mt-3 text-4xl text-foreground">Verify certificate by code</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Use this fallback flow when you need to manually check a certificate code
            outside the standard certificate ID path.
          </p>
        </div>

        <form onSubmit={onVerify} className="mt-8 grid gap-3 md:grid-cols-[1fr_auto]">
          <Input
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="Enter certificate code"
            className="h-12"
          />
          <Button type="submit" size="lg" disabled={loading || !code.trim()}>
            <Search className="mr-1 h-4 w-4" />
            {loading ? "Verifying..." : "Verify code"}
          </Button>
        </form>

        {result && (
          <div className="mt-8 rounded-[1.35rem] border border-border/70 bg-white/72 p-5 shadow-[var(--shadow-soft)]">
            {result.error ? (
              <div className="flex items-start gap-3 text-destructive">
                <ShieldCheck className="mt-0.5 h-5 w-5" />
                <div>
                  <p className="text-sm font-semibold">Verification error</p>
                  <p className="mt-1 text-sm leading-6">{result.error}</p>
                </div>
              </div>
            ) : (
              <pre className="overflow-x-auto whitespace-pre-wrap text-sm leading-6 text-foreground">
                {JSON.stringify(result, null, 2)}
              </pre>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
