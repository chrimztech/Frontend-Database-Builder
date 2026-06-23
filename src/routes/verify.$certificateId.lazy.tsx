import { createLazyFileRoute, Link } from "@tanstack/react-router";
import { type ReactNode } from "react";
import { AlertCircle, ArrowLeft, CheckCircle2, ShieldCheck, XCircle } from "lucide-react";

import { ORG_NAME } from "@/lib/cert";
import unzaLogo from "@/assets/unza-logo.png.asset.json";
import type { CertRow } from "./verify.$certificateId";

type Variant = "valid" | "revoked" | "expired" | "invalid";

export const Route = createLazyFileRoute("/verify/$certificateId")({
  component: VerifyPage,
  errorComponent: ({ error, reset }) => (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="surface-panel max-w-md rounded-[1.75rem] px-8 py-10 text-center">
        <p className="kicker">Verification Unavailable</p>
        <h1 className="mt-3 text-xl font-semibold">We could not load this certificate</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{error.message}</p>
        <button
          onClick={reset}
          className="mt-5 inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-soft)] hover:-translate-y-px hover:bg-primary/95"
        >
          Try again
        </button>
      </div>
    </div>
  ),
  notFoundComponent: () => <ResultShell variant="invalid" id="" />,
});

function VerifyPage() {
  const { certificateId } = Route.useParams();
  const data = Route.useLoaderData() as CertRow;

  if (!data) {
    return <ResultShell variant="invalid" id={certificateId} />;
  }

  const now = new Date();
  const expired = data.expiry_date ? new Date(data.expiry_date) < now : false;
  const variant: Variant = data.status === "revoked" ? "revoked" : expired ? "expired" : "valid";

  return <ResultShell variant={variant} id={certificateId} cert={data} />;
}

function ResultShell({
  variant,
  id,
  cert,
}: {
  variant: Variant;
  id: string;
  cert?: NonNullable<CertRow>;
}) {
  const config = {
    valid: {
      Icon: CheckCircle2,
      color: "var(--success)",
      badge: "Valid certificate",
      title: "Certificate confirmed",
      blurb: "The registry recognises this certificate as authentic and currently active.",
    },
    expired: {
      Icon: AlertCircle,
      color: "var(--gold)",
      badge: "Expired certificate",
      title: "Certificate confirmed but expired",
      blurb: "This certificate was genuinely issued, but its validity period has ended.",
    },
    revoked: {
      Icon: XCircle,
      color: "var(--destructive)",
      badge: "Revoked certificate",
      title: "Certificate was revoked",
      blurb:
        "The issuer has revoked this certificate, so it should no longer be accepted as valid.",
    },
    invalid: {
      Icon: XCircle,
      color: "var(--destructive)",
      badge: "No match found",
      title: "Certificate not found",
      blurb:
        "No certificate in the registry matches this identifier. Please confirm the ID before relying on the document.",
    },
  }[variant];

  const { Icon, color, badge, title, blurb } = config;
  const certificateCode = cert ? cert.certificate_code || cert.certificate_id : id;

  return (
    <div className="min-h-screen">
      <div
        className="absolute inset-x-0 top-0 h-72"
        style={{ background: "var(--gradient-hero)" }}
      />
      <div className="mesh-overlay absolute inset-x-0 top-0 h-72 opacity-45" />

      <header className="relative z-10 border-b border-white/10">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5 text-white">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-white/74 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to verification
          </Link>

          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/16 bg-white/10 backdrop-blur-sm">
              <img
                src={unzaLogo.url}
                alt="University of Zambia"
                className="h-8 w-8 object-contain"
              />
            </div>
            <div className="leading-tight">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/52">
                Official Registry
              </p>
              <p className="font-display text-lg text-white">{ORG_NAME}</p>
            </div>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-6xl px-6 py-10 sm:py-14">
        <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <section className="surface-panel rounded-[1.8rem] p-6 sm:p-8">
            <div
              className="inline-flex rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.24em]"
              style={{
                background: `color-mix(in oklab, ${color} 12%, white 88%)`,
                color,
              }}
            >
              {badge}
            </div>

            <div
              className="mt-6 flex h-16 w-16 items-center justify-center rounded-[1.4rem]"
              style={{
                background: `color-mix(in oklab, ${color} 12%, transparent)`,
              }}
            >
              <Icon className="h-8 w-8" style={{ color }} />
            </div>

            <h1 className="mt-5 text-4xl text-foreground">{title}</h1>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">{blurb}</p>

            <div className="mt-8 grid gap-3">
              <SummaryItem label="Certificate ID" value={certificateCode || "Unavailable"} />
              <SummaryItem
                label="Programme"
                value={cert?.programme ?? "No verified programme available"}
              />
              <SummaryItem
                label="Issue date"
                value={cert?.issue_date ? fmt(cert.issue_date) : "No verified issue date"}
              />
            </div>
          </section>

          <section className="surface-panel rounded-[1.8rem] p-6 sm:p-8">
            <p className="kicker">Registry Details</p>

            {cert ? (
              <>
                <h2 className="mt-3 text-3xl text-foreground">{cert.recipient_name}</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Verified against the official {ORG_NAME} certificate registry.
                </p>

                <dl className="mt-8 space-y-3">
                  <DetailRow label="Programme" value={cert.programme} />
                  <DetailRow label="Issue date" value={fmt(cert.issue_date)} />
                  {cert.expiry_date && (
                    <DetailRow label="Expiry date" value={fmt(cert.expiry_date)} />
                  )}
                  <DetailRow label="Issuer" value={cert.issuer_name} />
                  <DetailRow
                    label="Certificate ID"
                    value={<span className="font-mono text-sm">{certificateCode}</span>}
                  />
                  <DetailRow label="Status" value={<StatusPill variant={variant} />} />
                  {cert.status === "revoked" && cert.revoke_reason && (
                    <DetailRow label="Revocation note" value={cert.revoke_reason} />
                  )}
                </dl>
              </>
            ) : (
              <>
                <h2 className="mt-3 text-3xl text-foreground">No registry match</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  We searched for the following identifier:
                </p>
                <div className="mt-5 rounded-[1.35rem] border border-border/70 bg-white/72 px-4 py-4 font-mono text-sm text-foreground shadow-[var(--shadow-soft)]">
                  {id || "Unavailable"}
                </div>

                <div className="mt-8 rounded-[1.35rem] border border-border/70 bg-white/72 p-5 shadow-[var(--shadow-soft)]">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/8 text-primary">
                      <ShieldCheck className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">What to do next</p>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        Confirm the ID carefully, then contact the issuing office if the certificate
                        should exist but cannot be found here.
                      </p>
                    </div>
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.35rem] border border-border/70 bg-white/72 px-4 py-4 shadow-[var(--shadow-soft)]">
      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 text-sm font-semibold text-foreground">{value}</div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-[1.35rem] border border-border/70 bg-white/72 px-4 py-4 shadow-[var(--shadow-soft)]">
      <dt className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-2 text-sm font-semibold text-foreground">{value}</dd>
    </div>
  );
}

function StatusPill({ variant }: { variant: Variant }) {
  const tone = {
    valid: {
      label: "Valid",
      className: "bg-emerald-100 text-emerald-800",
    },
    expired: {
      label: "Expired",
      className: "bg-amber-100 text-amber-800",
    },
    revoked: {
      label: "Revoked",
      className: "bg-rose-100 text-rose-800",
    },
    invalid: {
      label: "Not found",
      className: "bg-rose-100 text-rose-800",
    },
  }[variant];

  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${tone.className}`}
    >
      {tone.label}
    </span>
  );
}

function fmt(value: string) {
  try {
    return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return value;
  }
}
