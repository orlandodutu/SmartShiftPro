import { useEffect, useState, useCallback } from "react";
import { Dipendente, Turno } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { RoleBadge } from "@/components/ui/RoleBadge";
import { ShiftBadge } from "@/components/ui/ShiftBadge";
import { useToast } from "@/hooks/use-toast";
import { Clock, Moon, CalendarOff, Pill, ArrowLeftRight, User } from "lucide-react";
import type { Ruolo } from "@/lib/api";

const ROLE_THEME: Record<Ruolo, { bg: string; border: string; accent: string; avatar: string; dot: string }> = {
  OSS:        { bg: "bg-blue-950/40",    border: "border-blue-800/50",    accent: "text-blue-300",    avatar: "bg-blue-900/60 text-blue-300",    dot: "bg-blue-400"    },
  INFERMIERA: { bg: "bg-emerald-950/40", border: "border-emerald-800/50", accent: "text-emerald-300", avatar: "bg-emerald-900/60 text-emerald-300", dot: "bg-emerald-400" },
  PULIZIE:    { bg: "bg-amber-950/40",   border: "border-amber-800/50",   accent: "text-amber-300",   avatar: "bg-amber-900/60 text-amber-300",   dot: "bg-amber-400"   },
  DEV:        { bg: "bg-indigo-950/40",  border: "border-indigo-800/50",  accent: "text-indigo-300",  avatar: "bg-indigo-900/60 text-indigo-300",  dot: "bg-indigo-400"  },
  CAPOSALA:   { bg: "bg-yellow-950/40",  border: "border-yellow-800/50",  accent: "text-yellow-300",  avatar: "bg-yellow-900/60 text-yellow-300",  dot: "bg-yellow-400"  },
};

export default function Dashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const role = (user?.ruolo ?? "OSS") as Ruolo;
  const theme = ROLE_THEME[role] ?? ROLE_THEME.OSS;

  const [stats, setStats] = useState<Dipendente[]>([]);
  const [meiTurni, setMeiTurni] = useState<Turno[]>([]);
  const [loading, setLoading] = useState(true);

  const [swapOpen, setSwapOpen] = useState(false);
  const [swapTurno, setSwapTurno] = useState<Turno | null>(null);
  const [dipendenti, setDipendenti] = useState<Dipendente[]>([]);
  const [colleagueId, setColleagueId] = useState("");
  const [colleagueTurni, setColleagueTurni] = useState<Turno[]>([]);
  const [colleagueTurnoId, setColleagueTurnoId] = useState("");
  const [swapNota, setSwapNota] = useState("");
  const [swapLoading, setSwapLoading] = useState(false);

  const today = new Date();
  const mese = today.getMonth() + 1;
  const anno = today.getFullYear();

  const fetchData = useCallback(async () => {
    if (!user) return;
    try {
      const [statsRes, turniRes, dipRes] = await Promise.all([
        fetch("/flask-api/api/statistiche", { credentials: "include" }),
        fetch(`/flask-api/api/turni?dipendente_id=${user.id}&mese=${mese}&anno=${anno}`, { credentials: "include" }),
        fetch("/flask-api/api/dipendenti", { credentials: "include" }),
      ]);
      if (statsRes.ok) setStats(await statsRes.json());
      if (turniRes.ok) {
        const all: Turno[] = await turniRes.json();
        const todayStr = today.toISOString().split("T")[0];
        const upcoming = all.filter((t) => t.data >= todayStr).sort((a, b) => a.data.localeCompare(b.data));
        setMeiTurni(upcoming.slice(0, 10));
      }
      if (dipRes.ok) setDipendenti(await dipRes.json());
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (!colleagueId) { setColleagueTurni([]); return; }
    fetch(`/flask-api/api/turni?dipendente_id=${colleagueId}&mese=${mese}&anno=${anno}`, { credentials: "include" })
      .then((r) => r.ok ? r.json() : [])
      .then(setColleagueTurni);
  }, [colleagueId]);

  const openSwap = (turno: Turno) => {
    setSwapTurno(turno);
    setColleagueId("");
    setColleagueTurnoId("");
    setSwapNota("");
    setSwapOpen(true);
  };

  const submitSwap = async () => {
    if (!swapTurno || !colleagueId) {
      toast({ title: "Seleziona collega e turno", variant: "destructive" });
      return;
    }
    setSwapLoading(true);
    try {
      const res = await fetch("/flask-api/api/scambi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          richiedente_id: user?.id,
          destinatario_id: parseInt(colleagueId),
          turno_richiedente_id: swapTurno.id,
          turno_destinatario_id: colleagueTurnoId ? parseInt(colleagueTurnoId) : null,
          nota: swapNota,
        }),
      });
      if (res.ok) {
        toast({ title: "Richiesta di scambio inviata" });
        setSwapOpen(false);
      } else {
        const err = await res.json();
        toast({ title: err.errore || "Errore", variant: "destructive" });
      }
    } finally {
      setSwapLoading(false);
    }
  };

  const myStats = stats.find((s) => s.id === user?.id) ?? user;

  const statCards = [
    { label: "Ore Totali",  value: myStats?.ore_totali  ?? 0, icon: Clock,        color: "text-gold",        bg: "bg-amber-500/10"   },
    { label: "Notti Fatte", value: myStats?.notti_fatte ?? 0, icon: Moon,         color: "text-slate-300",   bg: "bg-slate-500/10"   },
    { label: "Ferie",       value: myStats?.ferie       ?? 0, icon: CalendarOff,  color: "text-emerald-400", bg: "bg-emerald-500/10" },
    { label: "Malattia",    value: myStats?.malattia    ?? 0, icon: Pill,         color: "text-red-400",     bg: "bg-red-500/10"     },
  ];

  return (
    <div className="min-h-screen">
      {/* Role-tinted hero */}
      <div className={`${theme.bg} border-b ${theme.border} px-6 md:px-10 py-8`}>
        <div className="max-w-7xl mx-auto flex items-center gap-5">
          <div className={`h-16 w-16 rounded-2xl ${theme.avatar} flex items-center justify-center text-2xl font-black`}>
            {user?.nome.charAt(0)}
          </div>
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-bold text-foreground">{user?.nome}</h1>
              <RoleBadge role={role} />
            </div>
            <p className={`text-sm font-medium ${theme.accent}`}>
              {role === "CAPOSALA" ? "Coordinatrice — Area riservata disponibile nel menu" : "Dashboard personale"}
            </p>
          </div>
        </div>
      </div>

      <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-8">
        {/* Stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {statCards.map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className="glass rounded-2xl p-5 flex items-center gap-4">
              <div className={`p-3 ${bg} ${color} rounded-xl`}>
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>
                <p className={`text-2xl font-black mt-0.5 ${color}`}>{value}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          {/* My upcoming shifts */}
          <div className="lg:col-span-3">
            <Card className="glass border-white/8 shadow-none">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">I miei prossimi turni</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">Caricamento...</p>
                ) : meiTurni.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">Nessun turno in programma</p>
                ) : (
                  <div className="divide-y divide-white/5">
                    {meiTurni.map((turno) => (
                      <div key={turno.id} className="flex items-center justify-between py-3 gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="text-center shrink-0 w-12">
                            <p className="text-[10px] text-muted-foreground font-semibold uppercase">
                              {new Date(turno.data + "T00:00:00").toLocaleDateString("it-IT", { weekday: "short" })}
                            </p>
                            <p className="text-sm font-bold text-foreground">
                              {new Date(turno.data + "T00:00:00").toLocaleDateString("it-IT", { day: "numeric", month: "short" })}
                            </p>
                          </div>
                          <ShiftBadge type={turno.tipo} />
                          {turno.ore > 0 && (
                            <span className="text-xs text-muted-foreground">{turno.ore}h</span>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="shrink-0 text-xs gap-1.5 border-white/10 hover:border-amber-500/50 hover:text-amber-400 hover:bg-amber-500/10"
                          onClick={() => openSwap(turno)}
                          data-testid={`swap-btn-${turno.id}`}
                        >
                          <ArrowLeftRight className="h-3.5 w-3.5" />
                          Richiedi Scambio
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Staff table */}
          <div className="lg:col-span-2">
            <Card className="glass border-white/8 shadow-none">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Staff — Ore</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="border-white/5 hover:bg-transparent">
                      <TableHead className="pl-6 text-muted-foreground text-xs">Nome</TableHead>
                      <TableHead className="text-muted-foreground text-xs">Ruolo</TableHead>
                      <TableHead className="text-right pr-6 text-muted-foreground text-xs">Ore</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stats.slice().sort((a, b) => b.ore_totali - a.ore_totali).map((dip) => (
                      <TableRow key={dip.id} className={`border-white/5 ${dip.id === user?.id ? theme.bg : "hover:bg-white/3"}`}>
                        <TableCell className="pl-6 font-medium text-foreground flex items-center gap-2">
                          {dip.id === user?.id && <User className="h-3.5 w-3.5 text-muted-foreground" />}
                          {dip.nome}
                        </TableCell>
                        <TableCell><RoleBadge role={dip.ruolo} /></TableCell>
                        <TableCell className="text-right pr-6 font-mono text-sm text-gold font-bold">{dip.ore_totali}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Swap Dialog */}
      <Dialog open={swapOpen} onOpenChange={setSwapOpen}>
        <DialogContent className="max-w-md glass-strong border-white/10">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <ArrowLeftRight className="h-5 w-5 text-amber-400" />
              Richiedi Scambio Turno
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            <div className="rounded-xl bg-white/5 border border-white/10 p-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Turno da cedere</p>
              {swapTurno && (
                <div className="flex items-center gap-3">
                  <ShiftBadge type={swapTurno.tipo} />
                  <span className="font-medium text-foreground">
                    {new Date(swapTurno.data + "T00:00:00").toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}
                  </span>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-muted-foreground">Collega con cui scambiare</Label>
              <Select value={colleagueId} onValueChange={(v) => { setColleagueId(v); setColleagueTurnoId(""); }}>
                <SelectTrigger className="border-white/10 bg-white/5" data-testid="select-colleague">
                  <SelectValue placeholder="Seleziona un collega..." />
                </SelectTrigger>
                <SelectContent>
                  {dipendenti.filter((d) => d.id !== user?.id).map((d) => (
                    <SelectItem key={d.id} value={d.id.toString()}>{d.nome} — {d.ruolo}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {colleagueId && (
              <div className="space-y-2">
                <Label className="text-muted-foreground">Turno del collega <span className="text-muted-foreground/60 font-normal">(opzionale)</span></Label>
                <Select value={colleagueTurnoId} onValueChange={setColleagueTurnoId}>
                  <SelectTrigger className="border-white/10 bg-white/5" data-testid="select-colleague-shift">
                    <SelectValue placeholder="Nessuna preferenza" />
                  </SelectTrigger>
                  <SelectContent>
                    {colleagueTurni.length === 0
                      ? <SelectItem value="__none" disabled>Nessun turno disponibile</SelectItem>
                      : colleagueTurni.map((t) => (
                        <SelectItem key={t.id} value={t.id.toString()}>{t.data} — {t.tipo}</SelectItem>
                      ))
                    }
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-muted-foreground">Motivazione <span className="text-muted-foreground/60 font-normal">(opzionale)</span></Label>
              <Textarea
                placeholder="Es. Motivi famigliari..."
                value={swapNota}
                onChange={(e) => setSwapNota(e.target.value)}
                rows={3}
                className="border-white/10 bg-white/5 resize-none"
                data-testid="swap-note"
              />
            </div>

            <div className="flex gap-3 pt-1">
              <Button variant="outline" className="flex-1 border-white/10 hover:bg-white/5" onClick={() => setSwapOpen(false)}>
                Annulla
              </Button>
              <button
                onClick={submitSwap}
                disabled={swapLoading || !colleagueId}
                data-testid="submit-swap"
                className="flex-1 rounded-lg font-bold text-sm gap-2 flex items-center justify-center transition-all disabled:opacity-50 glow-gold py-2"
                style={{ background: "linear-gradient(135deg, #f59e0b, #d97706)", color: "#0f172a" }}
              >
                <ArrowLeftRight className="h-4 w-4" />
                {swapLoading ? "Invio..." : "Invia Richiesta"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
