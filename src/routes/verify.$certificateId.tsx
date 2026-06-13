import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, XCircle, AlertCircle, ArrowLeft, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { ORG_NAME } from "@/lib/cert";

type CertRow = {
  certificate_id: string;
  recipient_name: string;
  programme: string;
  issue_date: string;
  expiry_date: string | null;
  status: "valid" | "revoked";
  issuer_name: string;
  revoked_at: string | null;
  revoke_reason: string | null;
} | null;

const certQuery = (id: string) =>
  queryOptions({
    queryKey: ["verify", id],
    queryFn: async (): Promise<CertRow> => {
      const { data, error } = await supabase
        .from("certificates")
        .select("certificate_id,recipient_name,programme,issue_date,expiry_date,status,issuer_name,revoked_at,revoke_reason")
        .eq("certificate_id", id)
        .maybeSingle();
      if (error) throw error;
      return data as CertRow;
    },
  });

export const Route = createFileRoute("/verify/$certificateId")({
  head: ({ params }) => ({
    meta: [
      { title: `Verify ${params.certificateId} — ${ORG_NAME}` },
      { name: "description", content: `Verify certificate ${params.certificateId} issued by ${ORG_NAME}.` },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: ({ context, params }) => context.queryClient.ensureQueryData(certQuery(params.certificateId)),
  component: VerifyPage,
  errorComponent: ({ error, reset }) => (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">Verification unavailable</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <button onClick={reset} className="mt-4 text-sm underline">Try again</button>
      </div>
    </div>
  ),
  notFoundComponent: () => <ResultShell variant="invalid" id="" />,
});

function VerifyPage() {
  const { certificateId } = Route.useParams();
  const { data } = useSuspenseQuery(certQuery(certificateId));

  if (!data) return <ResultShell variant="invalid" id={certificateId} />;

  const now = new Date();
  const expired = data.expiry_date && new Date(data.expiry_date) < now;
  const variant: Variant =
    data.status === "revoked" ? "revoked" : expired ? "expired" : "valid";

  return <ResultShell variant={variant} id={certificateId} cert={data} />;
}

type Variant = "valid" | "revoked" | "expired" | "invalid";

function ResultShell({ variant, id, cert }: { variant: Variant; id: string; cert?: NonNullable<CertRow> }) {
  const config = {
    valid:   { Icon: CheckCircle2, color: "var(--success)", label: "VALID CERTIFICATE", blurb: "This certificate is authentic and active." },
    expired: { Icon: AlertCircle,  color: "var(--gold)",    label: "EXPIRED",            blurb: "This certificate was genuinely issued but has passed its expiry date." },
    revoked: { Icon: XCircle,      color: "var(--destructive)", label: "REVOKED",       blurb: "This certificate was revoked by the issuer and is no longer valid." },
    invalid: { Icon: XCircle,      color: "var(--destructive)", label: "NOT FOUND",     blurb: "No certificate matches this ID. It may be fake or mistyped." },
  }[variant];
  const { Icon, color, label, blurb } = config;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto max-w-4xl px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
          <div className="flex items-center gap-2 text-sm">
            <ShieldCheck className="h-4 w-4 text-accent" />
            <span className="font-display">{ORG_NAME}</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-16">
        <div className="rounded-xl border bg-card p-8 shadow-[var(--shadow-elegant)]">
          <div className="flex flex-col items-center text-center">
            <div className="rounded-full p-4" style={{ background: `color-mix(in oklab, ${color} 12%, transparent)` }}>
              <Icon className="h-12 w-12" style={{ color }} />
            </div>
            <div className="mt-4 text-xs uppercase tracking-[0.3em]" style={{ color }}>{label}</div>
            <p className="mt-2 text-muted-foreground">{blurb}</p>
          </div>

          {cert ? (
            <dl className="mt-8 divide-y border-t border-b">
              <Row label="Recipient" value={cert.recipient_name} />
              <Row label="Programme" value={cert.programme} />
              <Row label="Issue date" value={fmt(cert.issue_date)} />
              {cert.expiry_date && <Row label="Expiry date" value={fmt(cert.expiry_date)} />}
              <Row label="Issuer" value={cert.issuer_name} />
              <Row label="Certificate ID" value={<span className="font-mono">{cert.certificate_id}</span>} />
              {cert.status === "revoked" && cert.revoke_reason && (
                <Row label="Revoke reason" value={cert.revoke_reason} />
              )}
            </dl>
          ) : (
            <div className="mt-8 text-center text-sm text-muted-foreground">
              Searched for: <span className="font-mono">{id}</span>
            </div>
          )}

          <p className="mt-6 text-center text-xs text-muted-foreground">
            Verified against the official {ORG_NAME} certificate registry.
          </p>
        </div>
      </main>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-4 py-3 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="col-span-2 font-medium">{value}</dd>
    </div>
  );
}

function fmt(d: string) {
  try {
    return new Date(d + "T00:00:00").toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  } catch { return d; }
}
