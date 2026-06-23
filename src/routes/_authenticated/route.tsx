import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { supabase } = await import("@/integrations/supabase/client");

    // getSession() reads from localStorage — no network call, safe on refresh.
    // getUser() requires a Supabase round-trip and can fail transiently on refresh,
    // which would incorrectly bounce authenticated users to /auth and lose their URL.
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth" });
    return { user: data.session.user };
  },
  component: () => <Outlet />,
});
