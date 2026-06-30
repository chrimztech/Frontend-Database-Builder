import { createLazyFileRoute } from "@tanstack/react-router";
import { useState, type ComponentType } from "react";
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  FileBadge2,
  Lock,
  QrCode,
  Search,
  ShieldCheck,
} from "lucide-react";

import { ORG_NAME, ORG_FULL_NAME, ORG_EMAIL, ORG_WHATSAPP, ORG_WHATSAPP_URL } from "@/lib/cert";
import unzaLogo from "@/assets/unza-logo.png.asset.json";

const trustHighlights = [
  {
    icon: ShieldCheck,
    title: "Official registry result",
    body: "Each verification reads against the live university registry, not a screenshot or PDF copy.",
  },
  {
    icon: FileBadge2,
    title: "Unique certificate identity",
    body: "Every certificate carries a distinct identifier so records can be traced with confidence.",
  },
  {
    icon: Lock,
    title: "Revocation aware",
    body: "If a certificate is revoked or expires, the status shown here updates immediately.",
  },
];

const verificationSteps = [
  {
    step: "01",
    title: "Scan or enter the certificate ID",
    body: "Use the QR code printed on the document or type the certificate ID exactly as shown.",
  },
  {
    step: "02",
    title: "Review the official record",
    body: "We compare the ID with the institutional registry and return the recognised certificate record.",
  },
  {
    step: "03",
    title: "Confirm status before accepting it",
    body: "Valid, expired, revoked, and not-found outcomes are shown clearly so decisions are easy to make.",
  },
];

export const Route = createLazyFileRoute("/")({
  component: Home,
});

function Home() {
  const [id, setId] = useState("");

  return (
    <div className="min-h-screen">
      {/* ── Main nav bar (UNZA green) ── */}
      <header className="relative z-20" style={{ background: "var(--primary)" }}>
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-2.5">
          {/* Logo + institution name */}
          <a href="/" className="flex items-center gap-3">
            <img
              src={unzaLogo.url}
              alt="University of Zambia"
              className="h-16 w-16 object-contain drop-shadow"
            />
            <div className="leading-snug">
              <div className="font-display text-[20px] font-extrabold uppercase tracking-wide text-white drop-shadow-sm">
                University of Zambia
              </div>
              <div className="text-[12px] font-semibold text-white/90">
                Centre for Information and Communication Technologies (CICT)
              </div>
              <div className="text-[11.5px] font-medium uppercase tracking-[0.12em] text-white/80">
                Technology and e-Learning Support Unit (TeLS)
              </div>
            </div>
          </a>

          {/* Admin sign-in */}
          <a
            href="/auth"
            className="inline-flex h-9 items-center justify-center rounded border border-white/40 bg-white/15 px-4 text-sm font-semibold text-white transition-colors hover:bg-white/25"
          >
            Admin sign in
          </a>
        </div>
      </header>

      {/* Thin red separator — matches Zambian flag colours */}
      <div className="h-[3px] w-full" style={{ background: "#cc0000" }} />

      {/* White ribbon stripe */}
      <div className="h-3 w-full bg-white" />

      <main className="pb-16">
        <section className="relative overflow-hidden">
          <div
            className="absolute inset-0 rounded-b-[2.75rem]"
            style={{ background: "var(--gradient-hero)" }}
          />
          <div className="mesh-overlay absolute inset-0 opacity-45" />

          <div className="relative mx-auto max-w-6xl px-6 pb-16 pt-8 lg:pt-14">
            <div className="grid gap-10 lg:grid-cols-[1.08fr_0.92fr] lg:items-center">
              <div className="text-white">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/18 bg-white/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.24em] text-white/80 backdrop-blur-sm">
                  <BadgeCheck className="h-3.5 w-3.5" />
                  Official Verification Portal
                </div>

                <h1 className="mt-6 max-w-3xl text-5xl leading-tight text-white sm:text-6xl">
                  Professional certificate verification,
                  <span className="block text-gold">backed by the live registry.</span>
                </h1>

                <p className="mt-5 max-w-2xl text-base leading-7 text-white/76 sm:text-lg">
                  Confirm whether a certificate was genuinely issued by {ORG_NAME}. This portal is
                  designed for employers, institutions, regulators, and any reviewer who needs a
                  quick, trustworthy answer.
                </p>

                <div className="mt-8 flex flex-wrap gap-3">
                  <div className="rounded-full border border-white/16 bg-white/10 px-4 py-2 text-sm text-white/80 backdrop-blur-sm">
                    Instant result status
                  </div>
                  <div className="rounded-full border border-white/16 bg-white/10 px-4 py-2 text-sm text-white/80 backdrop-blur-sm">
                    QR-enabled certificates
                  </div>
                  <div className="rounded-full border border-white/16 bg-white/10 px-4 py-2 text-sm text-white/80 backdrop-blur-sm">
                    Revocation and expiry aware
                  </div>
                </div>

                <div className="mt-10 grid gap-4 sm:grid-cols-3">
                  <MetricCard icon={ShieldCheck} value="Live" label="registry lookup" />
                  <MetricCard icon={Building2} value="Institution" label="issued records only" />
                  <MetricCard icon={QrCode} value="QR" label="ready verification flow" />
                </div>
              </div>

              <div className="surface-panel rounded-[1.9rem] p-6 sm:p-8">
                <p className="kicker">Verification Portal</p>
                <h2 className="mt-3 text-3xl text-foreground">Check a certificate ID</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  If you arrived here from a QR code, confirm the address matches the
                  university&apos;s official verification page before you rely on the result.
                </p>

                <form
                  className="mt-6 space-y-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const value = id.trim();
                    if (!value) {
                      return;
                    }

                    window.location.assign(`/verify/${encodeURIComponent(value)}`);
                  }}
                >
                  <input
                    value={id}
                    onChange={(event) => setId(event.target.value.toUpperCase())}
                    placeholder="SCM20260000001"
                    className="flex h-12 w-full rounded-xl border border-input bg-white/82 px-3.5 py-2 font-mono text-sm uppercase tracking-[0.18em] shadow-[var(--shadow-soft)] backdrop-blur-sm placeholder:text-muted-foreground/85 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25"
                  />
                  <button
                    type="submit"
                    className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-soft)] transition-all duration-200 hover:-translate-y-px hover:bg-primary/95 active:translate-y-px"
                  >
                    <Search className="mr-1 h-4 w-4" />
                    Verify certificate
                    <ArrowRight className="ml-1 h-4 w-4" />
                  </button>
                </form>

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <InfoTile
                    icon={QrCode}
                    title="QR code friendly"
                    body="Printed certificates can route directly into the same official verification flow."
                  />
                  <InfoTile
                    icon={Lock}
                    title="Decision-ready output"
                    body="Status is shown clearly so reviewers can move quickly without guesswork."
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-10">
          <div className="grid gap-4 md:grid-cols-3">
            {trustHighlights.map(({ icon: Icon, title, body }) => (
              <div key={title} className="surface-panel rounded-[1.6rem] p-6">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/8 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-xl text-foreground">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 pb-16">
          <div className="grid gap-6 lg:grid-cols-[0.92fr_1.08fr]">
            <div className="surface-panel rounded-[1.75rem] p-6 sm:p-8">
              <p className="kicker">Need Assistance?</p>
              <h3 className="mt-3 text-3xl text-foreground">Contact the issuing team</h3>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                If a certificate cannot be located, looks suspicious, or needs a manual review,
                contact the issuing office before accepting or rejecting it.
              </p>

              <div className="mt-6 space-y-3 text-sm">
                <a
                  href={`mailto:${ORG_EMAIL}`}
                  className="flex items-center justify-between rounded-2xl border border-border/70 bg-white/72 px-4 py-3 font-medium text-foreground shadow-[var(--shadow-soft)] backdrop-blur-sm hover:bg-white"
                >
                  <span>Email support</span>
                  <span className="text-muted-foreground">{ORG_EMAIL}</span>
                </a>
                <a
                  href={ORG_WHATSAPP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between rounded-2xl border border-border/70 bg-white/72 px-4 py-3 font-medium text-foreground shadow-[var(--shadow-soft)] backdrop-blur-sm hover:bg-white"
                >
                  <span>WhatsApp</span>
                  <span className="text-muted-foreground">{ORG_WHATSAPP}</span>
                </a>
              </div>
            </div>

            <div className="surface-panel rounded-[1.75rem] p-6 sm:p-8">
              <p className="kicker">How It Works</p>
              <h3 className="mt-3 text-3xl text-foreground">A simple, trustworthy review path</h3>
              <div className="mt-6 grid gap-4 md:grid-cols-3">
                {verificationSteps.map(({ step, title, body }) => (
                  <div
                    key={step}
                    className="rounded-[1.35rem] border border-border/70 bg-white/70 p-5 shadow-[var(--shadow-soft)]"
                  >
                    <div className="text-sm font-semibold text-primary">{step}</div>
                    <h4 className="mt-3 text-lg text-foreground">{title}</h4>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  value,
  label,
}: {
  icon: ComponentType<{ className?: string }>;
  value: string;
  label: string;
}) {
  return (
    <div className="rounded-[1.4rem] border border-white/14 bg-white/10 p-4 backdrop-blur-sm">
      <Icon className="h-5 w-5 text-gold" />
      <div className="mt-4 text-lg font-semibold text-white">{value}</div>
      <div className="text-sm text-white/70">{label}</div>
    </div>
  );
}

function InfoTile({
  icon: Icon,
  title,
  body,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-[1.35rem] border border-border/70 bg-white/70 p-4 shadow-[var(--shadow-soft)]">
      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/8 text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <h3 className="mt-3 text-sm font-semibold text-foreground">{title}</h3>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">{body}</p>
    </div>
  );
}
