import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ShieldCheck, Search, FileBadge2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ORG_NAME, ORG_FULL_NAME, ORG_EMAIL, ORG_WHATSAPP, ORG_WHATSAPP_URL } from "@/lib/cert";
import unzaLogo from "@/assets/unza-logo.png.asset.json";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: `${ORG_NAME} — Verify a Certificate` },
      { name: "description", content: "Verify the authenticity of certificates issued by " + ORG_NAME + "." },
    ],
  }),
  component: Home,
});

function Home() {
  const navigate = useNavigate();
  const [id, setId] = useState("");

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <img src={unzaLogo.url} alt="University of Zambia" className="h-10 w-10 object-contain" />
            <div className="leading-tight">
              <div className="font-display text-lg font-semibold tracking-tight">{ORG_NAME}</div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground hidden sm:block">{ORG_FULL_NAME}</div>
            </div>
          </Link>
          <Link to="/auth" className="text-sm text-muted-foreground hover:text-foreground">Admin sign in</Link>
        </div>
      </header>

      <section className="relative overflow-hidden" style={{ background: "var(--gradient-hero)" }}>
        <div className="absolute inset-0 opacity-[0.05]" style={{
          backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
          backgroundSize: "24px 24px",
        }} />
        <div className="relative mx-auto max-w-3xl px-6 py-24 text-center text-navy-foreground">
          <div className="inline-flex items-center gap-2 rounded-full border border-accent/30 px-3 py-1 text-xs uppercase tracking-[0.2em] text-accent">
            <Lock className="h-3 w-3" /> Official Verification
          </div>
          <h1 className="mt-6 text-5xl md:text-6xl font-display leading-tight">
            Verify a <span className="italic text-accent">certificate</span>
          </h1>
          <p className="mt-4 text-base md:text-lg text-navy-foreground/80">
            Scan the QR code on the certificate, or enter the certificate ID below to confirm it
            was officially issued by {ORG_NAME}.
          </p>

          <form
            className="mt-10 mx-auto flex max-w-xl gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const v = id.trim();
              if (v) navigate({ to: "/verify/$certificateId", params: { certificateId: v } });
            }}
          >
            <Input
              value={id}
              onChange={(e) => setId(e.target.value.toUpperCase())}
              placeholder="ORG-2026-XXXX-XXXX"
              className="h-12 bg-white/95 text-navy placeholder:text-navy/40 font-mono tracking-wider"
            />
            <Button type="submit" size="lg" className="h-12 bg-accent text-accent-foreground hover:bg-accent/90">
              <Search className="h-4 w-4 mr-1" /> Verify
            </Button>
          </form>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-20 grid md:grid-cols-3 gap-8">
        {[
          { icon: FileBadge2, title: "Unique ID per certificate", body: "Every certificate carries a random, non-sequential identifier that's nearly impossible to guess." },
          { icon: ShieldCheck, title: "Database-backed verification", body: "The QR code links to our official records — not a copy of the certificate itself." },
          { icon: Lock, title: "Revocation supported", body: "Issuers can revoke a certificate, and verification will immediately reflect the change." },
        ].map(({ icon: Icon, title, body }) => (
          <div key={title} className="rounded-lg border bg-card p-6 shadow-sm">
            <Icon className="h-7 w-7 text-accent" />
            <h3 className="mt-3 text-lg font-semibold">{title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{body}</p>
          </div>
        ))}
      </section>

      <footer className="border-t">
        <div className="mx-auto max-w-6xl px-6 py-6 text-xs text-muted-foreground flex flex-col sm:flex-row items-center justify-between gap-3">
          <span>© {new Date().getFullYear()} {ORG_NAME}</span>
          <div className="flex items-center gap-4">
            <a href={`mailto:${ORG_EMAIL}`} className="hover:text-foreground transition-colors">
              {ORG_EMAIL}
            </a>
            <a href={ORG_WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">
              WhatsApp {ORG_WHATSAPP}
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
