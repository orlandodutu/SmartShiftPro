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

const ROLE_THEME: Record<Ruolo, { bg: string; border: string; accent: string; avatar: string }> = {
  OSS:        { bg: "bg-blue-50",    border: "border-blue-200",    accent: "text-blue-700",   avatar: "bg-blue-100 text-blue-700" },
  INFERMIERA: { bg: "bg-emerald-50", border: "border-emerald-200", accent: "text-emerald-700", avatar: "bg-emerald-100 text-emerald-700" },
  PULIZIE:    { bg: "bg-amber-50",   border: "border-amber-200",   accent: "text-amber-700",   avatar: "bg-amber-100 text-amber-700" },
  DEV:        { bg: "bg-indigo-50",  border: "border-indigo-200",  accent: "text-indigo-700",  avatar: "bg-indigo-100 text-indigo-700" },
  CAPOSALA:   { bg: "bg-yellow-50",  border: "border-yellow-200",  accent: "text-yellow-700",  avatar: "bg-yellow-100 text-yellow-700" },
};

export default function Dashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const role = (user?.ruolo ?? "OSS") as Ruolo;
  const theme = ROLE_THEME[role] ?? ROLE_THEME.OSS;

  const [stats, setStats] = useState<Dipendente[]>([]);
  const [meiTurni, setMeiTurni] = useState<Turno[]>([]);
  const [loading, setLoading] = useState(true);

  // swap dialog state
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
        const upcoming = all
          .filter((t) => t.data >= todayStr)
          .sort((a, b) => a.data.localeCompare(b.data));
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
    { label: "Ore Totali",   value: myStats?.ore_totali  ?? 0, icon: Clock,       bg: "bg-blue-100",   text: "text-blue-600"   },
    { label: "Notti Fatte",  value: myStats?.notti_fatte ?? 0, icon: Moon,        bg: "bg-slate-100",  text: "text-slate-700"  },
    { label: "Ferie",        value: myStats?.ferie       ?? 0, icon: CalendarOff, bg: "bg-emerald-100",text: "text-emerald-600" },
    { label: "Malattia",     value: myStats?.malattia    ?? 0, icon: Pill,        bg: "bg-red-100",    text: "text-red-600"    },
  ];

  return (
    <div className="min-h-screen">
      {/* Role-tinted hero header */}
      <div className={`${theme.bg} border-b ${theme.border} px-6 md:px-10 py-8`}>
        <div className="max-w-7xl mx-auto flex items-center gap-5">
          <div className={`h-16 w-16 rounded-2xl ${theme.avatar} flex items-center justify-center text-2xl font-bold shadow-sm`}>
            {user?.nome.charAt(0)}
          </div>
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-bold text-gray-900">{user?.nome}</h1>
              <RoleBadge role={role} />
            </div>
            <p className={`text-sm font-medium ${theme.accent}`}>
              {role === "CAPOSALA" ? "Coordinatrice — Area Riservata disponibile nel menu" : "Dashboard personale"}
            </p>
          </div>
        </div>
      </div>

      <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-8">
        {/* Stats cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {statCards.map(({ label, value, icon: Icon, bg, text }) => (
            <Card key={label} className="shadow-sm">
              <CardContent className="p-5 flex items-center gap-4">
                <div className={`p-3 ${bg} ${text} rounded-xl`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
                  <p className="text-2xl font-bold text-gray-900 mt-0.5">{value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          {/* My upcoming shifts */}
          <div className="lg:col-span-3">
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold">I miei prossimi turni</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <p className="text-sm text-gray-400 py-4 text-center">Caricamento...</p>
                ) : meiTurni.length === 0 ? (
                  <p className="text-sm text-gray-400 py-6 text-center">Nessun turno in programma</p>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {meiTurni.map((turno) => (
                      <div key={turno.id} className="flex items-center justify-between py-3 gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="text-center shrink-0">
                            <p className="text-xs text-gray-400 font-medium uppercase">
                              {new Date(turno.data + "T00:00:00").toLocaleDateString("it-IT", { weekday: "short" })}
                            </p>
                            <p className="text-sm font-bold text-gray-900">
                              {new Date(turno.data + "T00:00:00").toLocaleDateString("it-IT", { day: "numeric", month: "short" })}
                            </p>
                          </div>
                          <ShiftBadge type={turno.tipo} />
                          {turno.ore > 0 && (
                            <span className="text-xs text-gray-400">{turno.ore}h</span>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="shrink-0 text-xs gap-1.5"
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

          {/* Staff ranking */}
          <div className="lg:col-span-2">
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold">Staff — Ore</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-6">Nome</TableHead>
                      <TableHead>Ruolo</TableHead>
                      <TableHead className="text-right pr-6">Ore</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stats
                      .slice()
                      .sort((a, b) => b.ore_totali - a.ore_totali)
                      .map((dip) => (
                        <TableRow key={dip.id} className={dip.id === user?.id ? `${theme.bg}` : ""}>
                          <TableCell className="pl-6 font-medium flex items-center gap-2">
                            {dip.id === user?.id && <User className="h-3.5 w-3.5 text-gray-400" />}
                            {dip.nome}
                          </TableCell>
                          <TableCell><RoleBadge role={dip.ruolo} /></TableCell>
                          <TableCell className="text-right pr-6 font-mono text-sm">{dip.ore_totali}</TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Swap Request Dialog */}
      <Dialog open={swapOpen} onOpenChange={setSwapOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowLeftRight className="h-5 w-5 text-primary" />
              Richiedi Scambio Turno
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            {/* Turno ceduto (pre-selected, read-only) */}
            <div className="rounded-xl border bg-gray-50 p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Il tuo turno da cedere</p>
              {swapTurno && (
                <div className="flex items-center gap-3">
                  <ShiftBadge type={swapTurno.tipo} />
                  <span className="font-medium text-gray-800">
                    {new Date(swapTurno.data + "T00:00:00").toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}
                  </span>
                </div>
              )}
            </div>

            {/* Choose colleague */}
            <div className="space-y-2">
              <Label>Collega con cui scambiare</Label>
              <Select value={colleagueId} onValueChange={(v) => { setColleagueId(v); setColleagueTurnoId(""); }}>
                <SelectTrigger data-testid="select-colleague">
                  <SelectValue placeholder="Seleziona un collega..." />
                </SelectTrigger>
                <SelectContent>
                  {dipendenti
                    .filter((d) => d.id !== user?.id)
                    .map((d) => (
                      <SelectItem key={d.id} value={d.id.toString()}>
                        {d.nome} — {d.ruolo}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {/* Choose colleague's shift (optional) */}
            {colleagueId && (
              <div className="space-y-2">
                <Label>Turno del collega da ricevere <span className="text-gray-400 font-normal">(opzionale)</span></Label>
                <Select value={colleagueTurnoId} onValueChange={setColleagueTurnoId}>
                  <SelectTrigger data-testid="select-colleague-shift">
                    <SelectValue placeholder="Nessuna preferenza" />
                  </SelectTrigger>
                  <SelectContent>
                    {colleagueTurni.length === 0 ? (
                      <SelectItem value="__none" disabled>Nessun turno disponibile</SelectItem>
                    ) : (
                      colleagueTurni.map((t) => (
                        <SelectItem key={t.id} value={t.id.toString()}>
                          {t.data} — {t.tipo}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Note */}
            <div className="space-y-2">
              <Label>Motivazione <span className="text-gray-400 font-normal">(opzionale)</span></Label>
              <Textarea
                placeholder="Es. Motivi famigliari, impegno personale..."
                value={swapNota}
                onChange={(e) => setSwapNota(e.target.value)}
                rows={3}
                data-testid="swap-note"
              />
            </div>

            <div className="flex gap-3 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setSwapOpen(false)}>
                Annulla
              </Button>
              <Button
                className="flex-1 gap-2"
                onClick={submitSwap}
                disabled={swapLoading || !colleagueId}
                data-testid="submit-swap"
              >
                <ArrowLeftRight className="h-4 w-4" />
                {swapLoading ? "Invio..." : "Invia Richiesta"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
