import { useEffect, useState, useCallback } from "react";
import { Dipendente } from "@/lib/api";
import { RoleBadge } from "@/components/ui/RoleBadge";
import { Activity, Clock, LogIn, Wifi, WifiOff } from "lucide-react";

function onlineStatus(lastSeen: string): "online" | "recent" | "offline" {
  if (!lastSeen) return "offline";
  const diff = (Date.now() - new Date(lastSeen).getTime()) / 1000;
  if (diff < 180) return "online";   // < 3 min
  if (diff < 1800) return "recent";  // < 30 min
  return "offline";
}

function formatRelative(ts: string): string {
  if (!ts) return "Mai";
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (diff < 60) return "Adesso";
  if (diff < 3600) return `${Math.floor(diff / 60)} min fa`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h fa`;
  return new Date(ts).toLocaleDateString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function Monitor() {
  const [utenti, setUtenti] = useState<Dipendente[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const fetchOnline = useCallback(async () => {
    const res = await fetch("/flask-api/api/online", { credentials: "include" });
    if (res.ok) setUtenti(await res.json());
    setLoading(false);
    setLastRefresh(new Date());
  }, []);

  useEffect(() => {
    fetchOnline();
    const id = setInterval(fetchOnline, 15_000);
    return () => clearInterval(id);
  }, [fetchOnline]);

  const online = utenti.filter((u) => onlineStatus(u.last_seen) === "online");
  const recent = utenti.filter((u) => onlineStatus(u.last_seen) === "recent");
  const offline = utenti.filter((u) => onlineStatus(u.last_seen) === "offline");

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="bg-indigo-950/40 border-b border-indigo-800/40 px-6 md:px-10 py-8">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-5">
            <div className="h-14 w-14 rounded-2xl bg-indigo-900/60 text-indigo-400 flex items-center justify-center">
              <Activity className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Monitor Accessi</h1>
              <p className="text-sm text-indigo-400 font-medium mt-0.5">Stato online del personale in tempo reale</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Aggiornato</p>
            <p className="text-sm font-mono text-foreground">
              {lastRefresh.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </p>
          </div>
        </div>
      </div>

      <div className="p-6 md:p-10 max-w-5xl mx-auto space-y-8">
        {/* Summary chips */}
        <div className="flex gap-4 flex-wrap">
          <div className="glass rounded-2xl px-5 py-3 flex items-center gap-3 border border-emerald-500/20">
            <div className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-sm font-bold text-emerald-400">{online.length}</span>
            <span className="text-sm text-muted-foreground">Online</span>
          </div>
          <div className="glass rounded-2xl px-5 py-3 flex items-center gap-3 border border-yellow-500/20">
            <div className="h-2.5 w-2.5 rounded-full bg-yellow-400" />
            <span className="text-sm font-bold text-yellow-400">{recent.length}</span>
            <span className="text-sm text-muted-foreground">Recentemente attivo</span>
          </div>
          <div className="glass rounded-2xl px-5 py-3 flex items-center gap-3 border border-white/8">
            <div className="h-2.5 w-2.5 rounded-full bg-slate-500" />
            <span className="text-sm font-bold text-slate-400">{offline.length}</span>
            <span className="text-sm text-muted-foreground">Offline</span>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground text-center py-10">Caricamento...</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {utenti.map((u) => {
              const status = onlineStatus(u.last_seen);
              const dotColor = status === "online" ? "bg-emerald-400 animate-pulse" : status === "recent" ? "bg-yellow-400" : "bg-slate-500";
              const borderColor = status === "online" ? "border-emerald-500/20" : status === "recent" ? "border-yellow-500/20" : "border-white/8";
              return (
                <div key={u.id} className={`glass rounded-2xl p-5 border ${borderColor} transition-all`}>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="h-10 w-10 rounded-xl bg-white/8 flex items-center justify-center font-bold text-foreground text-sm shrink-0">
                      {u.nome.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-foreground text-sm truncate">{u.nome}</p>
                        <div className={`h-2 w-2 rounded-full shrink-0 ${dotColor}`} />
                      </div>
                      <RoleBadge role={u.ruolo} className="mt-0.5" />
                    </div>
                    {status === "online"
                      ? <Wifi className="h-4 w-4 text-emerald-400 shrink-0" />
                      : <WifiOff className="h-4 w-4 text-muted-foreground/30 shrink-0" />}
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Activity className="h-3 w-3 shrink-0" />
                      <span>Visto: <span className="text-foreground font-medium">{formatRelative(u.last_seen)}</span></span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <LogIn className="h-3 w-3 shrink-0" />
                      <span>Login: <span className="text-foreground font-medium">{formatRelative(u.last_login)}</span></span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Clock className="h-3 w-3 shrink-0" />
                      <span>Password: <span className={u.password_changed ? "text-emerald-400 font-medium" : "text-amber-400 font-medium"}>
                        {u.password_changed ? "Impostata" : "Da cambiare"}
                      </span></span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
