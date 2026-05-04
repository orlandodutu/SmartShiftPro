import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";

/* ── WhatsApp-style notification sound via Web Audio API ── */
function playWhatsAppSound() {
  try {
    const AC = window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.55, ctx.currentTime);
    master.connect(ctx.destination);

    /* Layer 1 — warm "ding" principale (sine, scende da 1318→880 Hz) */
    const osc1 = ctx.createOscillator();
    const env1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(1318, ctx.currentTime);
    osc1.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.08);
    osc1.frequency.exponentialRampToValueAtTime(698, ctx.currentTime + 0.55);
    env1.gain.setValueAtTime(0, ctx.currentTime);
    env1.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.008);
    env1.gain.exponentialRampToValueAtTime(0.6, ctx.currentTime + 0.12);
    env1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.75);
    osc1.connect(env1); env1.connect(master);
    osc1.start(ctx.currentTime); osc1.stop(ctx.currentTime + 0.8);

    /* Layer 2 — secondo armonico (ottava sopra, volume basso → corpo) */
    const osc2 = ctx.createOscillator();
    const env2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(2637, ctx.currentTime);
    osc2.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.06);
    env2.gain.setValueAtTime(0, ctx.currentTime);
    env2.gain.linearRampToValueAtTime(0.25, ctx.currentTime + 0.006);
    env2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
    osc2.connect(env2); env2.connect(master);
    osc2.start(ctx.currentTime); osc2.stop(ctx.currentTime + 0.22);

    /* Layer 3 — "pop" iniziale (rumore breve) */
    const bufSize = ctx.sampleRate * 0.025;
    const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1);
    const noise = ctx.createBufferSource();
    const noiseFilter = ctx.createBiquadFilter();
    const noiseEnv = ctx.createGain();
    noiseFilter.type = "bandpass";
    noiseFilter.frequency.value = 1200;
    noiseFilter.Q.value = 0.8;
    noise.buffer = buf;
    noiseEnv.gain.setValueAtTime(0.18, ctx.currentTime);
    noiseEnv.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.025);
    noise.connect(noiseFilter); noiseFilter.connect(noiseEnv); noiseEnv.connect(master);
    noise.start(ctx.currentTime); noise.stop(ctx.currentTime + 0.03);

    setTimeout(() => ctx.close(), 1800);
  } catch { /* audio may be blocked */ }
}

/* ── Browser OS-level notification ── */
function showBrowserNotification(count: number) {
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  try {
    const opts: NotificationOptions = {
      body: count === 1
        ? "1 nuova richiesta di scambio turno in attesa"
        : `${count} nuove richieste di scambio turno in attesa`,
      icon: "/favicon.svg",
      tag: "swap-request",
    };
    const n = new Notification("SmartShift Pro", opts);
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
          playWhatsAppSound();
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
