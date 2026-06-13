import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Eye, EyeOff, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { ORG_NAME, ORG_FULL_NAME } from "@/lib/cert";
import unzaLogo from "@/assets/unza-logo.png.asset.json";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: `Staff sign in — ${ORG_NAME}` }, { name: "robots", content: "noindex" }] }),
  component: AuthPage,
});

type Stage = "signin" | "must-change";

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
      if (!data.session) return;
      const mustChange = await checkMustChangePassword(data.session.user.id);
      if (mustChange) { setStage("must-change"); return; }
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

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      const mustChange = await checkMustChangePassword(data.user.id);
      if (mustChange) { setStage("must-change"); return; }
      navigate({ to: "/admin", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign-in failed");
    } finally { setLoading(false); }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) { toast.error("Passwords do not match"); return; }
    if (newPassword.length < 8) { toast.error("Password must be at least 8 characters"); return; }
    setLoading(true);
    try {
      const { error: pwErr } = await supabase.auth.updateUser({ password: newPassword });
      if (pwErr) throw pwErr;
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await (supabase as any)
          .from("user_settings")
          .update({ must_change_password: false })
          .eq("user_id", user.id);
      }
      toast.success("Password updated. Welcome!");
      navigate({ to: "/admin", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update password");
    } finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen flex">
      {/* ── Left branding panel ─────────────────────────────── */}
      <div
        className="hidden lg:flex lg:w-[55%] flex-col items-center justify-center relative overflow-hidden p-12"
        style={{ background: "var(--gradient-hero)" }}
      >
        {/* subtle dot-grid overlay */}
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
            backgroundSize: "28px 28px",
          }}
        />
        {/* decorative gold ring behind logo */}
        <div
          className="absolute w-[420px] h-[420px] rounded-full opacity-10"
          style={{
            background: "radial-gradient(circle, var(--gold) 0%, transparent 70%)",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -60%)",
          }}
        />

        <div className="relative flex flex-col items-center text-center gap-8 max-w-md">
          {/* Logo */}
          <div className="w-40 h-40 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center shadow-2xl p-3">
            <img
              src={unzaLogo.url}
              alt="UNZA logo"
              className="w-full h-full object-contain drop-shadow-lg"
            />
          </div>

          <div>
            <h1 className="text-4xl font-display font-semibold text-white tracking-tight leading-tight">
              {ORG_NAME}
            </h1>
            <p className="mt-3 text-sm text-white/60 leading-relaxed">
              {ORG_FULL_NAME}
            </p>
          </div>

          <div className="w-16 h-px" style={{ background: "var(--gold)" }} />

          <p className="text-xs text-white/40 uppercase tracking-widest">
            Certificate Management System
          </p>
        </div>

        {/* bottom attribution */}
        <div className="absolute bottom-6 text-[11px] text-white/25">
          <Link to="/" className="hover:text-white/50 transition-colors">
            ← Return to public verification
          </Link>
        </div>
      </div>

      {/* ── Right form panel ────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 bg-background">
        {/* Mobile-only logo */}
        <div className="flex lg:hidden flex-col items-center gap-3 mb-10">
          <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20">
            <img src={unzaLogo.url} alt="UNZA logo" className="w-14 h-14 object-contain" />
          </div>
          <span className="font-display text-xl font-semibold">{ORG_NAME}</span>
        </div>

        <div className="w-full max-w-sm">
          {stage === "signin" ? (
            <>
              <div className="mb-8">
                <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 mb-4">
                  <Lock className="h-5 w-5 text-primary" />
                </div>
                <h2 className="text-2xl font-display font-semibold">Staff sign in</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Authorised personnel only. Contact your administrator if you need access.
                </p>
              </div>

              <form className="space-y-5" onSubmit={handleSignIn}>
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-sm font-medium">
                    Email address
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    placeholder="you@unza.ac.zm"
                    className="h-11"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password" className="text-sm font-medium">
                    Password
                  </Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                      placeholder="••••••••"
                      className="h-11 pr-10"
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <Button
                  type="submit"
                  className="w-full h-11 text-sm font-medium"
                  disabled={loading}
                >
                  {loading ? "Signing in…" : "Sign in"}
                </Button>
              </form>
            </>
          ) : (
            <>
              <div className="mb-8">
                <div
                  className="inline-flex items-center justify-center w-10 h-10 rounded-full mb-4"
                  style={{ background: "color-mix(in oklab, var(--gold) 20%, transparent)" }}
                >
                  <Lock className="h-5 w-5" style={{ color: "var(--gold)" }} />
                </div>
                <h2 className="text-2xl font-display font-semibold">Set your password</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Your account was created with a temporary password. Choose a permanent one to continue.
                </p>
              </div>

              <form className="space-y-5" onSubmit={handleChangePassword}>
                <div className="space-y-1.5">
                  <Label htmlFor="new-password" className="text-sm font-medium">
                    New password
                  </Label>
                  <div className="relative">
                    <Input
                      id="new-password"
                      type={showNew ? "text" : "password"}
                      required
                      minLength={8}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      autoComplete="new-password"
                      placeholder="At least 8 characters"
                      className="h-11 pr-10"
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowNew(!showNew)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="confirm-password" className="text-sm font-medium">
                    Confirm new password
                  </Label>
                  <div className="relative">
                    <Input
                      id="confirm-password"
                      type={showConfirm ? "text" : "password"}
                      required
                      minLength={8}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      autoComplete="new-password"
                      placeholder="Repeat your password"
                      className="h-11 pr-10"
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowConfirm(!showConfirm)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {/* password match indicator */}
                {confirmPassword && (
                  <p className={`text-xs ${newPassword === confirmPassword ? "text-green-600" : "text-destructive"}`}>
                    {newPassword === confirmPassword ? "✓ Passwords match" : "Passwords do not match"}
                  </p>
                )}

                <Button
                  type="submit"
                  className="w-full h-11 text-sm font-medium"
                  disabled={loading || !newPassword || !confirmPassword || newPassword !== confirmPassword}
                >
                  {loading ? "Saving…" : "Set password & continue"}
                </Button>
              </form>
            </>
          )}

          <p className="mt-8 text-center text-xs text-muted-foreground">
            <Link to="/" className="hover:text-foreground transition-colors underline underline-offset-4">
              ← Back to certificate verification
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
