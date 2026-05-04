import { useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";

/* ── Double-ping sound via Web Audio API (no file needed) ── */
function playDoublePing() {
  try {
    const AC = window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    [0, 0.32].forEach((delay) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(1047, ctx.currentTime + delay);          // C6
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + delay + 0.18); // A5
      gain.gain.setValueAtTime(0, ctx.currentTime + delay);
      gain.gain.linearRampToValueAtTime(0.30, ctx.currentTime + delay + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.6);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.65);
    });
    setTimeout(() => ctx.close(), 2500);
  } catch { /* audio may be blocked — ignore silently */ }
}

export function useSwapNotifications() {
  const { user } = useAuth();
  const isPrivileged = user?.is_admin || user?.ruolo === "CAPOSALA";
  const prevCountRef = useRef<number>(-1);

  useEffect(() => {
    if (!isPrivileged) return;

    const check = async () => {
      try {
        const res = await fetch("/flask-api/api/scambi/count", { credentials: "include" });
        if (!res.ok) return;
        const { count } = await res.json() as { count: number };
        if (prevCountRef.current >= 0 && count > prevCountRef.current) {
          playDoublePing();
        }
        prevCountRef.current = count;
      } catch { /* network error — ignore */ }
    };

    check();
    const id = setInterval(check, 10_000);
    return () => clearInterval(id);
  }, [isPrivileged]);
}
