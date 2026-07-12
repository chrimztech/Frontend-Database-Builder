import { createLazyFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, BadgeCheck, ShieldAlert, ShieldX } from "lucide-react";

import { ORG_NAME, ORG_FULL_NAME } from "@/lib/cert";
import unzaLogo from "@/assets/unza-logo.png.asset.json";
import type { CertRow } from "./verify.$certificateId";

type Variant = "valid" | "revoked" | "expired" | "invalid";

export const Route = createLazyFileRoute("/verify/$certificateId")({
  component: VerifyPage,
  errorComponent: ({ error, reset }) => (
    <PageShell>
      <div className="mx-auto max-w-xl">
        <StatusCard variant="invalid">
          <CenteredIcon variant="invalid" />
          <h1 className="mt-6 font-display text-3xl text-foreground">Verification unavailable</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{error.message}</p>
          <button
            onClick={reset}
            className="mt-6 inline-flex items-center justify-center rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:-translate-y-px hover:bg-primary/90"
          >
            Try again
          </button>
        </StatusCard>
      </div>
    </PageShell>
  ),
  notFoundComponent: () => (
    <PageShell>
      <NotFoundCard id="" />
    </PageShell>
  ),
});

function VerifyPage() {
  const { certificateId } = Route.useParams();
  const data = Route.useLoaderData() as CertRow;

  if (!data) {
    return (
      <PageShell>
        <NotFoundCard id={certificateId} />
      </PageShell>
    );
  }

  const expired = data.expiry_date ? new Date(data.expiry_date) < new Date() : false;
  const variant: Variant =
    data.status === "revoked" ? "revoked" : expired ? "expired" : "valid";
  const code = data.certificate_code || data.certificate_id;

  return (
    <PageShell>
      {/* ── Main certificate card ───────────────────────────────────────────── */}
      <div className="mx-auto max-w-2xl">
        <div
          className="overflow-hidden rounded-[2rem]"
          style={{
            border: "1px solid color-mix(in oklab, var(--border) 80%, white 20%)",
            boxShadow: "var(--shadow-elegant)",
            background: "white",
          }}
        >
          {/* Status banner */}
          <div
            className="relative px-8 py-6 text-white"
            style={{ background: variantGradient(variant) }}
          >
            <div className="mesh-overlay absolute inset-0 opacity-20" />
            <div className="relative flex items-center gap-4">
              <StatusIcon variant={variant} />
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.3em] opacity-80">
                  {variantKicker(variant)}
                </p>
                <p className="mt-0.5 font-display text-2xl leading-tight">
                  {variantHeading(variant)}
                </p>
              </div>
            </div>
          </div>

          {/* Certificate body */}
          <div className="px-8 py-8">
            {/* Recipient */}
            <div className="border-b border-dashed border-border pb-7 text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                This is to certify that
              </p>
              <h1
                className="mt-3 font-display text-4xl leading-snug text-foreground"
                style={{ color: "var(--color-foreground)" }}
              >
                {data.recipient_name}
              </h1>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                has been awarded a{" "}
                <span className="font-semibold text-foreground">Certificate of Completion</span> in
              </p>
              <p
                className="mt-1 font-display text-2xl"
                style={{ color: "oklch(0.34 0.13 150)" }}
              >
                {data.programme}
              </p>
            </div>

            {/* Details grid */}
            <div className="mt-7 grid gap-4 sm:grid-cols-2">
              <InfoCell label="Certificate Code">
                <span className="font-mono text-base font-bold tracking-wider" style={{ color: "oklch(0.34 0.13 150)" }}>
                  {code}
                </span>
              </InfoCell>
              <InfoCell label="Issue Date">{fmt(data.issue_date)}</InfoCell>
              <InfoCell label="Issuing Authority">{data.issuer_name}</InfoCell>
              <InfoCell label="Status">
                <VariantPill variant={variant} />
              </InfoCell>
              {data.expiry_date && (
                <InfoCell label="Expiry Date">{fmt(data.expiry_date)}</InfoCell>
              )}
            </div>

            {/* Revocation note */}
            {variant === "revoked" && data.revoke_reason && (
              <div
                className="mt-5 rounded-xl px-4 py-3 text-sm"
                style={{
                  background: "color-mix(in oklab, var(--destructive) 8%, white 92%)",
                  border: "1px solid color-mix(in oklab, var(--destructive) 22%, white 78%)",
                  color: "var(--color-destructive)",
                }}
              >
                <span className="font-semibold">Revocation reason: </span>
                {data.revoke_reason}
              </div>
            )}

            {/* Registry seal */}
            <div
              className="mt-7 flex items-center gap-3 rounded-xl px-4 py-3"
              style={{
                background: "color-mix(in oklab, oklch(0.34 0.13 150) 5%, white 95%)",
                border: "1px solid color-mix(in oklab, oklch(0.34 0.13 150) 18%, white 82%)",
              }}
            >
              <img
                src={unzaLogo.url}
                alt="UNZA"
                className="h-9 w-9 shrink-0 object-contain opacity-90"
              />
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em]" style={{ color: "oklch(0.34 0.13 150)" }}>
                  Verified Registry Record
                </p>
                <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                  This record was verified against the official {ORG_NAME} certificate registry.
                </p>
              </div>
              <BadgeCheck
                className="ml-auto h-7 w-7 shrink-0"
                style={{ color: variant === "valid" ? "var(--color-success)" : "var(--color-destructive)" }}
              />
            </div>
          </div>

          {/* Gold footer strip */}
          <div
            className="px-8 py-4 text-center text-xs"
            style={{
              borderTop: "1px solid color-mix(in oklab, var(--border) 70%, white 30%)",
              background: "color-mix(in oklab, white 96%, oklch(0.78 0.17 82) 4%)",
              color: "var(--color-muted-foreground)",
            }}
          >
            {ORG_FULL_NAME}
          </div>
        </div>

        {/* Back link */}
        <div className="mt-6 text-center">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to verification portal
          </Link>
        </div>
      </div>
    </PageShell>
  );
}

// ── Not-found state ────────────────────────────────────────────────────────────

function NotFoundCard({ id }: { id: string }) {
  return (
    <div className="mx-auto max-w-xl">
      <StatusCard variant="invalid">
        <CenteredIcon variant="invalid" />
        <h1 className="mt-6 font-display text-3xl text-foreground">Certificate not found</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          No certificate in the registry matches this identifier. Please confirm the code and try
          again, or contact the issuing office.
        </p>
        {id && (
          <div
            className="mx-auto mt-5 max-w-sm rounded-xl px-4 py-3 font-mono text-sm font-semibold text-foreground"
            style={{
              background: "color-mix(in oklab, var(--border) 25%, white 75%)",
              border: "1px solid var(--color-border)",
            }}
          >
            {id}
          </div>
        )}
        <Link
          to="/"
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:-translate-y-px hover:bg-primary/90"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to verification portal
        </Link>
      </StatusCard>
    </div>
  );
}

// ── Shared layout ──────────────────────────────────────────────────────────────

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      {/* Hero gradient */}
      <div
        className="absolute inset-x-0 top-0 h-64"
        style={{ background: "var(--gradient-hero)" }}
      />
      <div className="mesh-overlay absolute inset-x-0 top-0 h-64 opacity-40" />

      {/* Header */}
      <header className="relative z-10">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-6 py-6">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-white/70 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Verification Portal
          </Link>
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-xl"
              style={{
                background: "color-mix(in oklab, white 15%, transparent)",
                border: "1px solid color-mix(in oklab, white 20%, transparent)",
              }}
            >
              <img src={unzaLogo.url} alt="UNZA" className="h-7 w-7 object-contain" />
            </div>
            <div className="leading-tight">
              <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/50">
                Official Registry
              </p>
              <p className="text-sm font-semibold text-white">{ORG_NAME}</p>
            </div>
          </div>
        </div>
      </header>

      {/* Page content */}
      <main className="relative z-10 px-6 pb-16 pt-4">{children}</main>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatusCard({ variant, children }: { variant: Variant; children: React.ReactNode }) {
  return (
    <div
      className="overflow-hidden rounded-[2rem] px-8 py-10 text-center"
      style={{
        border: "1px solid color-mix(in oklab, var(--border) 80%, white 20%)",
        boxShadow: "var(--shadow-elegant)",
        background: "white",
      }}
    >
      {children}
    </div>
  );
}

function CenteredIcon({ variant }: { variant: Variant }) {
  const isOk = variant === "valid";
  const Icon = isOk ? BadgeCheck : ShieldX;
  const color = isOk ? "var(--color-success)" : "var(--color-destructive)";
  return (
    <div
      className="mx-auto flex h-20 w-20 items-center justify-center rounded-[1.5rem]"
      style={{
        background: `color-mix(in oklab, ${color} 10%, white 90%)`,
        border: `1px solid color-mix(in oklab, ${color} 20%, white 80%)`,
      }}
    >
      <Icon className="h-10 w-10" style={{ color }} />
    </div>
  );
}

function StatusIcon({ variant }: { variant: Variant }) {
  const Icon =
    variant === "valid" ? BadgeCheck : variant === "expired" ? ShieldAlert : ShieldX;
  return (
    <div
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
      style={{ background: "color-mix(in oklab, white 18%, transparent)" }}
    >
      <Icon className="h-6 w-6 text-white" />
    </div>
  );
}

function InfoCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-xl px-4 py-3"
      style={{
        background: "color-mix(in oklab, white 60%, oklch(0.985 0.008 95) 40%)",
        border: "1px solid color-mix(in oklab, var(--border) 70%, white 30%)",
      }}
    >
      <dt className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-semibold text-foreground">{children}</dd>
    </div>
  );
}

function VariantPill({ variant }: { variant: Variant }) {
  const styles: Record<Variant, { label: string; bg: string; color: string }> = {
    valid: { label: "Valid", bg: "color-mix(in oklab, var(--success) 12%, white 88%)", color: "var(--color-success)" },
    expired: { label: "Expired", bg: "color-mix(in oklab, var(--gold) 14%, white 86%)", color: "oklch(0.52 0.14 75)" },
    revoked: { label: "Revoked", bg: "color-mix(in oklab, var(--destructive) 12%, white 88%)", color: "var(--color-destructive)" },
    invalid: { label: "Not found", bg: "color-mix(in oklab, var(--destructive) 12%, white 88%)", color: "var(--color-destructive)" },
  };
  const s = styles[variant];
  return (
    <span
      className="inline-flex rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.18em]"
      style={{ background: s.bg, color: s.color }}
    >
      {s.label}
    </span>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function variantGradient(v: Variant) {
  if (v === "valid") return "linear-gradient(135deg, oklch(0.32 0.14 150) 0%, oklch(0.26 0.11 150) 100%)";
  if (v === "expired") return "linear-gradient(135deg, oklch(0.52 0.14 75) 0%, oklch(0.44 0.12 75) 100%)";
  return "linear-gradient(135deg, oklch(0.48 0.18 25) 0%, oklch(0.40 0.16 25) 100%)";
}

function variantKicker(v: Variant) {
  if (v === "valid") return "Verified — Official Record";
  if (v === "expired") return "Expired Certificate";
  if (v === "revoked") return "Revoked Certificate";
  return "Verification Failed";
}

function variantHeading(v: Variant) {
  if (v === "valid") return "Certificate Confirmed";
  if (v === "expired") return "Certificate Expired";
  if (v === "revoked") return "Certificate Revoked";
  return "No Record Found";
}

function fmt(value: string) {
  try {
    return new Date(`${value}T00:00:00`).toLocaleDateString("en-GB", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return value;
  }
}
