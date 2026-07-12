import { useState, type FormEvent } from "react";
import { createLazyFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createLazyFileRoute("/verify/code")({
  component: VerifyCodePage,
});

function VerifyCodePage() {
  const [code, setCode] = useState("");
  const navigate = useNavigate();

  function onVerify(event?: FormEvent) {
    event?.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) return;
    navigate({ to: "/verify/$certificateId", params: { certificateId: trimmed } });
  }

  return (
    <div className="min-h-screen">
      <div
        className="absolute inset-x-0 top-0 h-72"
        style={{ background: "var(--gradient-hero)" }}
      />
      <div className="mesh-overlay absolute inset-x-0 top-0 h-72 opacity-45" />

      <header className="relative z-10 border-b border-white/10">
        <div className="mx-auto flex max-w-6xl items-center px-6 py-5 text-white">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-white/74 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to verification
          </Link>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-2xl px-6 py-14">
        <div className="surface-panel rounded-[1.8rem] p-8">
          <p className="kicker">Certificate Verification</p>
          <h1 className="mt-3 text-4xl text-foreground">Verify by certificate code</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Enter the certificate code printed on the document to view its verified details.
          </p>

          <form onSubmit={onVerify} className="mt-8 grid gap-3 md:grid-cols-[1fr_auto]">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g. PMP202607483921"
              className="h-12"
              autoFocus
            />
            <Button type="submit" size="lg" disabled={!code.trim()}>
              <Search className="mr-1 h-4 w-4" />
              Verify
            </Button>
          </form>
        </div>
      </main>
    </div>
  );
}
