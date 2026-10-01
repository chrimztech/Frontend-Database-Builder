// Signs the user out after a period of inactivity, so an unattended session
// (e.g. an admin desk left unlocked) doesn't stay authenticated indefinitely.
// Activity is broadcast across tabs via localStorage so moving the mouse in
// one tab keeps every other open tab signed in too.
import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { auth } from "@/lib/api";

const IDLE_TIMEOUT_MS = 15 * 60 * 1000; // sign out after 15 minutes idle
const WARNING_BEFORE_MS = 60 * 1000; // warn 1 minute before signing out
const RESET_THROTTLE_MS = 5000; // ignore activity bursts (e.g. mousemove) tighter than this
const LAST_ACTIVITY_KEY = "cemis_last_activity";
const ACTIVITY_EVENTS = ["mousedown", "mousemove", "keydown", "touchstart", "wheel", "scroll"] as const;

export function useIdleLogout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    let warningTimer: ReturnType<typeof setTimeout> | undefined;
    let logoutTimer: ReturnType<typeof setTimeout> | undefined;
    let lastReset = 0;

    function clearTimers() {
      if (warningTimer) clearTimeout(warningTimer);
      if (logoutTimer) clearTimeout(logoutTimer);
    }

    async function doLogout() {
      clearTimers();
      await queryClient.cancelQueries();
      queryClient.clear();
      auth.logout();
      navigate({ to: "/auth", replace: true });
      toast.info("You were signed out due to inactivity");
    }

    function scheduleTimers() {
      clearTimers();
      warningTimer = setTimeout(() => {
        toast.warning(
          "You'll be signed out in 1 minute due to inactivity — move your mouse or press a key to stay signed in.",
        );
      }, IDLE_TIMEOUT_MS - WARNING_BEFORE_MS);
      logoutTimer = setTimeout(() => {
        void doLogout();
      }, IDLE_TIMEOUT_MS);
    }

    function handleActivity(broadcast: boolean) {
      const now = Date.now();
      if (now - lastReset < RESET_THROTTLE_MS) return;
      lastReset = now;
      scheduleTimers();
      if (broadcast) {
        try {
          localStorage.setItem(LAST_ACTIVITY_KEY, String(now));
        } catch {
          // Storage can throw (e.g. private browsing) — per-tab timeout still works
        }
      }
    }

    function onActivityEvent() {
      handleActivity(true);
    }

    function onStorage(event: StorageEvent) {
      if (event.key === LAST_ACTIVITY_KEY) handleActivity(false);
    }

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, onActivityEvent, { passive: true });
    }
    window.addEventListener("storage", onStorage);

    scheduleTimers();

    return () => {
      clearTimers();
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, onActivityEvent);
      }
      window.removeEventListener("storage", onStorage);
    };
  }, [navigate, queryClient]);
}
