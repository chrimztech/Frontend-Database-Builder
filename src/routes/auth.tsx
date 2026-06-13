import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  ShieldCheck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { ORG_NAME, ORG_FULL_NAME } from "@/lib/cert";
import unzaLogo from "@/assets/unza-logo.png.asset.json";

type Stage = "signin" | "must-change";

const securityNotes = [
  "Role-based access to certificate, student, and template administration.",
  "Mandatory password update support for newly provisioned accounts.",
  "Live access to the same registry used for public certificate verification.",
];

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: `Staff sign in - ${ORG_NAME}` },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage>("signin");
  const [loading, setLoading] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        return;
      }

      const mustChange = await checkMustChangePassword(data.session.user.id);
      if (mustChange) {
        setStage("must-change");
        return;
      }

      navigate({ to: "/admin", replace: true });
    });
  }, [navigate]);

  async function checkMustChangePassword(userId: string): Promise<boolean> {
    const { data } = await (supabase as any)
      .from("user_settings")
      .select("must_change_password")
      .eq("user_id", userId)
      .maybeSingle();

    return data?.must_change_password === true;
  }

  async function handleSignIn(event: FormEvent) {
    event.preventDefault();
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        throw error;
      }

      const mustChange = await checkMustChangePassword(data.user.id);
      if (mustChange) {
        setStage("must-change");
        return;
      }

      navigate({ to: "/admin", replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Sign-in failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleChangePassword(event: FormEvent) {
    event.preventDefault();

    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    if (newPassword.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }

    setLoading(true);

    try {
      const { error: passwordError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (passwordError) {
        throw passwordError;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        await (supabase as any)
          .from("user_settings")
          .update({ must_change_password: false })
          .eq("user_id", user.id);
      }

      toast.success("Password updated. Welcome.");
      navigate({ to: "/admin", replace: true });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to update password",
      );
    } finally {
      setLoading(false);
    }
  }

  const passwordsMatch = confirmPassword.length > 0 && newPassword === confirmPassword;

  return (
    <div className="min-h-screen px-4 py-4 sm:px-6 sm:py-6">
      <div className="mx-auto grid min-h-[calc(100vh-2rem)] max-w-6xl overflow-hidden rounded-[2rem] border border-white/55 bg-white/55 shadow-[var(--shadow-elegant)] backdrop-blur-xl xl:grid-cols-[1.05fr_0.95fr]">
        <section className="surface-panel-strong relative flex flex-col justify-between gap-10 overflow-hidden px-6 py-8 text-white sm:px-8 sm:py-10">
          <div className="mesh-overlay absolute inset-0 opacity-35" />
          <div className="absolute -right-12 top-8 h-56 w-56 rounded-full bg-gold/14 blur-3xl" />
          <div className="absolute -left-12 bottom-0 h-48 w-48 rounded-full bg-white/8 blur-3xl" />

          <div className="relative flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/16 bg-white/10 backdrop-blur-sm">
              <img
                src={unzaLogo.url}
                alt="UNZA logo"
                className="h-9 w-9 object-contain"
              />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/55">
                Certificate Operations
              </p>
              <h1 className="font-display text-2xl text-white">{ORG_NAME}</h1>
            </div>
          </div>

          <div className="relative max-w-xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/18 bg-white/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.24em] text-white/75 backdrop-blur-sm">
              <ShieldCheck className="h-3.5 w-3.5" />
              Staff Access Portal
            </div>
            <h2 className="mt-6 text-5xl leading-tight text-white">
              Professional control over certificate issuance and verification.
            </h2>
            <p className="mt-4 max-w-lg text-base leading-7 text-white/72">
              Access the secure administration workspace for students, enrolments,
              certificate generation, branding, and audit review across {ORG_FULL_NAME}.
            </p>
          </div>

          <div className="relative grid gap-4 md:grid-cols-3">
            {securityNotes.map((note) => (
              <div
                key={note}
                className="rounded-[1.4rem] border border-white/14 bg-white/10 p-4 backdrop-blur-sm"
              >
                <CheckCircle2 className="h-5 w-5 text-gold" />
                <p className="mt-3 text-sm leading-6 text-white/72">{note}</p>
              </div>
            ))}
          </div>

          <div className="relative">
            <Link
              to="/"
              className="inline-flex items-center gap-2 text-sm font-medium text-white/70 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              Return to public verification
            </Link>
          </div>
        </section>

        <section className="flex items-center justify-center px-6 py-10 sm:px-10">
          <div className="w-full max-w-md">
            <p className="kicker">
              {stage === "signin" ? "Staff Sign In" : "Security Update"}
            </p>
            <h2 className="mt-3 text-4xl text-foreground">
              {stage === "signin"
                ? "Welcome back"
                : "Set your permanent password"}
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              {stage === "signin"
                ? "Use your staff credentials to access certificate administration."
                : "Your account was created with a temporary password. Choose a secure permanent password to continue."}
            </p>

            {stage === "signin" ? (
              <form className="mt-8 space-y-5" onSubmit={handleSignIn}>
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-sm font-semibold">
                    Email address
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    autoComplete="email"
                    placeholder="you@unza.ac.zm"
                    className="h-11"
                  />
                </div>

                <PasswordField
                  id="password"
                  label="Password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  show={showPassword}
                  onToggle={() => setShowPassword((current) => !current)}
                />

                <Button type="submit" size="lg" className="mt-2 w-full" disabled={loading}>
                  <Lock className="mr-1 h-4 w-4" />
                  {loading ? "Signing in..." : "Sign in to admin"}
                </Button>
              </form>
            ) : (
              <form className="mt-8 space-y-5" onSubmit={handleChangePassword}>
                <PasswordField
                  id="new-password"
                  label="New password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  show={showNew}
                  onToggle={() => setShowNew((current) => !current)}
                />

                <PasswordField
                  id="confirm-password"
                  label="Confirm new password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  autoComplete="new-password"
                  placeholder="Repeat your password"
                  show={showConfirm}
                  onToggle={() => setShowConfirm((current) => !current)}
                />

                {confirmPassword && (
                  <p
                    className={`text-sm ${
                      passwordsMatch ? "text-green-700" : "text-destructive"
                    }`}
                  >
                    {passwordsMatch
                      ? "Passwords match."
                      : "Passwords do not match."}
                  </p>
                )}

                <div className="rounded-[1.35rem] border border-border/70 bg-white/72 p-4 shadow-[var(--shadow-soft)]">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-2xl bg-primary/8 text-primary">
                      <KeyRound className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        Password guidance
                      </p>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        Choose a password with at least 8 characters that is not reused
                        elsewhere.
                      </p>
                    </div>
                  </div>
                </div>

                <Button
                  type="submit"
                  size="lg"
                  className="w-full"
                  disabled={
                    loading ||
                    !newPassword ||
                    !confirmPassword ||
                    newPassword !== confirmPassword
                  }
                >
                  <ShieldCheck className="mr-1 h-4 w-4" />
                  {loading ? "Saving..." : "Set password and continue"}
                </Button>
              </form>
            )}

            <div className="mt-8 rounded-[1.35rem] border border-border/70 bg-white/72 p-4 text-sm leading-6 text-muted-foreground shadow-[var(--shadow-soft)]">
              Access is limited to authorised university personnel. If you need access,
              contact an administrator to create your account and assign the correct role.
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  placeholder,
  show,
  onToggle,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  autoComplete: string;
  placeholder: string;
  show: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-sm font-semibold">
        {label}
      </Label>
      <div className="relative">
        <Input
          id={id}
          type={show ? "text" : "password"}
          required
          minLength={id === "password" ? undefined : 8}
          value={value}
          onChange={onChange}
          autoComplete={autoComplete}
          placeholder={placeholder}
          className="h-11 pr-12"
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={onToggle}
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
