import { useEffect, useRef, useState } from "react";
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
      osc.frequency.setValueAtTime(1047, ctx.currentTime + delay);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + delay + 0.18);
      gain.gain.setValueAtTime(0, ctx.currentTime + delay);
      gain.gain.linearRampToValueAtTime(0.30, ctx.currentTime + delay + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.6);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.65);
    });
    setTimeout(() => ctx.close(), 2500);
  } catch { /* audio may be blocked */ }
}

/* ── Browser OS-level notification ── */
function showBrowserNotification(count: number) {
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  try {
    const n = new Notification("SmartShift Pro", {
      body: count === 1
        ? "1 nuova richiesta di scambio turno in attesa"
        : `${count} nuove richieste di scambio turno in attesa`,
      icon: "/favicon.svg",
      badge: "/favicon.svg",
      tag: "swap-request",
      renotify: true,
    });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch { /* ignore */ }
}

/* ── Request notification permission once ── */
async function requestNotificationPermission() {
  if (!("Notification" in window)) return;
  if (Notification.permission === "default") {
    await Notification.requestPermission();
  }
}

export function useSwapNotifications(): { pendingCount: number } {
  const { user } = useAuth();
  const isPrivileged = user?.is_admin || user?.ruolo === "CAPOSALA";
  const prevCountRef = useRef<number>(-1);
  const [pendingCount, setPendingCount] = useState(0);
  const permissionRequestedRef = useRef(false);

  useEffect(() => {
    if (!isPrivileged) return;

    /* Ask for OS notification permission once after first user interaction */
    if (!permissionRequestedRef.current) {
      permissionRequestedRef.current = true;
      requestNotificationPermission();
    }

    const check = async () => {
      try {
        const res = await fetch("/flask-api/api/scambi/count", { credentials: "include" });
        if (!res.ok) return;
        const { count } = await res.json() as { count: number };
        setPendingCount(count);
        if (prevCountRef.current >= 0 && count > prevCountRef.current) {
          const newOnes = count - prevCountRef.current;
          playDoublePing();
          showBrowserNotification(newOnes);
        }
        prevCountRef.current = count;
      } catch { /* network error */ }
    };

    check();
    const id = setInterval(check, 5_000);   // 5 s — near-instant
    return () => clearInterval(id);
  }, [isPrivileged]);

  return { pendingCount };
}
