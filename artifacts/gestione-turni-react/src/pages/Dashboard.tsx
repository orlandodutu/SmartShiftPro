import { useEffect, useState, useCallback } from "react";
import { Dipendente, Turno, Assenza } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { RoleBadge } from "@/components/ui/RoleBadge";
import { ShiftBadge } from "@/components/ui/ShiftBadge";
import { useToast } from "@/hooks/use-toast";
import {
  Clock, Moon, CalendarOff, Pill, ArrowLeftRight, User,
  Settings2, Sun, Sunset, BedDouble, Check, Trash2,
  PlusCircle, AlertTriangle, Palmtree, CalendarX, RotateCcw, ShieldAlert, UserPlus, KeyRound,
} from "lucide-react";
import type { Ruolo } from "@/lib/api";

/* ── Role theme ── */
const ROLE_THEME: Record<Ruolo, { bg: string; border: string; accent: string; avatar: string; dot: string }> = {
  OSS:        { bg: "bg-blue-950/40",    border: "border-blue-800/50",    accent: "text-blue-300",    avatar: "bg-blue-900/60 text-blue-300",    dot: "bg-blue-400"    },
  INFERMIERA: { bg: "bg-emerald-950/40", border: "border-emerald-800/50", accent: "text-emerald-300", avatar: "bg-emerald-900/60 text-emerald-300", dot: "bg-emerald-400" },
  AUSILIARIO: { bg: "bg-amber-950/40",   border: "border-amber-800/50",   accent: "text-amber-300",   avatar: "bg-amber-900/60 text-amber-300",   dot: "bg-amber-400"   },
  DEV:        { bg: "bg-indigo-950/40",  border: "border-indigo-800/50",  accent: "text-indigo-300",  avatar: "bg-indigo-900/60 text-indigo-300",  dot: "bg-indigo-400"  },
  CAPOSALA:   { bg: "bg-yellow-950/40",  border: "border-yellow-800/50",  accent: "text-yellow-300",  avatar: "bg-yellow-900/60 text-yellow-300",  dot: "bg-yellow-400"  },
};

type Pref = "MATTINO" | "POMERIGGIO" | "NOTTE";
const PREF_OPTIONS: { key: Pref; label: string; icon: typeof Sun; color: string }[] = [
  { key: "MATTINO",    label: "Mattino",    icon: Sun,       color: "bg-amber-500/15 text-amber-300 border-amber-500/30"    },
  { key: "POMERIGGIO", label: "Pomeriggio", icon: Sunset,    color: "bg-orange-500/15 text-orange-300 border-orange-500/30" },
  { key: "NOTTE",      label: "Notte",      icon: BedDouble, color: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30" },
];

function formatDate(d: string) {
  if (!d) return "";
  return new Date(d + "T00:00:00").toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" });
}

function isActiveToday(a: Assenza, today: string) {
  return a.data_inizio <= today && a.data_fine >= today;
}

export default function Dashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const role = (user?.ruolo ?? "OSS") as Ruolo;
  const theme = ROLE_THEME[role] ?? ROLE_THEME.OSS;
  const canManage = user?.is_admin || user?.ruolo === "CAPOSALA";
  const today = new Date().toISOString().split("T")[0];

  const [stats, setStats] = useState<Dipendente[]>([]);
  const [meiTurni, setMeiTurni] = useState<Turno[]>([]);
  const [loading, setLoading] = useState(true);
  const [dipendenti, setDipendenti] = useState<Dipendente[]>([]);
  const [tutteAssenze, setTutteAssenze] = useState<Assenza[]>([]);

  /* Add user (admin only) */
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [addUserLoading, setAddUserLoading] = useState(false);
  const [newUser, setNewUser] = useState<{ nome: string; ruolo: Ruolo; password: string }>({
    nome: "", ruolo: "OSS", password: "password123",
  });
  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUser.nome.trim()) { toast({ title: "Nome obbligatorio", variant: "destructive" }); return; }
    setAddUserLoading(true);
    try {
      const res = await fetch("/flask-api/api/dipendenti", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ nome: newUser.nome.trim(), ruolo: newUser.ruolo, password: newUser.password || "password123" }),
      });
      if (res.ok) {
        toast({ title: `${newUser.nome.trim()} aggiunto — accesso creato con password: ${newUser.password || "password123"}` });
        setAddUserOpen(false);
        setNewUser({ nome: "", ruolo: "OSS", password: "password123" });
        await fetchData();
      } else {
        const err = await res.json();
        toast({ title: err.errore || "Errore nella creazione", variant: "destructive" });
      }
    } finally { setAddUserLoading(false); }
  };

  /* Delete dipendente */
  const [deleteTarget, setDeleteTarget] = useState<Dipendente | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const handleDeleteDip = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      const res = await fetch(`/flask-api/api/dipendenti/${deleteTarget.id}`, {
        method: "DELETE", credentials: "include",
      });
      if (res.ok) {
        toast({ title: `${deleteTarget.nome} eliminato` });
        setDeleteTarget(null);
        await fetchData();
      } else {
        const err = await res.json();
        toast({ title: err.errore || "Errore", variant: "destructive" });
      }
    } finally { setDeleteLoading(false); }
  };

  /* Reset completo */
  const [resetOpen, setResetOpen] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const handleResetCompleto = async () => {
    setResetLoading(true);
    try {
      const res = await fetch("/flask-api/api/reset_completo", {
        method: "POST", credentials: "include",
      });
      if (res.ok) {
        toast({ title: "Sistema azzerato — turni, scambi e statistiche eliminati" });
        setResetOpen(false);
        await fetchData();
      } else {
        const err = await res.json();
        toast({ title: err.errore || "Errore nel reset", variant: "destructive" });
      }
    } finally { setResetLoading(false); }
  };

  /* Swap state */
  const [swapOpen, setSwapOpen] = useState(false);
  const [swapTurno, setSwapTurno] = useState<Turno | null>(null);
  const [colleagueId, setColleagueId] = useState("");
  const [colleagueTurni, setColleagueTurni] = useState<Turno[]>([]);
  const [colleagueTurnoId, setColleagueTurnoId] = useState("");
  const [swapNota, setSwapNota] = useState("");
  const [swapLoading, setSwapLoading] = useState(false);

  /* Staff profile modal */
  const [profileTarget, setProfileTarget] = useState<Dipendente | null>(null);
  const [profileTab, setProfileTab] = useState<"preferenze" | "assenze">("preferenze");

  /* Preferences */
  const [prefSelected, setPrefSelected] = useState<Pref[]>([]);
  const [prefLoading, setPrefLoading] = useState(false);

  /* Absences */
  const [assenze, setAssenze] = useState<Assenza[]>([]);
  const [assenzeLoading, setAssenzeLoading] = useState(false);
  const [newAssenza, setNewAssenza] = useState<{
    tipo: "MALATTIA" | "FERIE"; data_inizio: string; data_fine: string; note: string;
  }>({ tipo: "MALATTIA", data_inizio: today, data_fine: today, note: "" });
  const [addingAssenza, setAddingAssenza] = useState(false);

  const mese = new Date().getMonth() + 1;
  const anno = new Date().getFullYear();

  const fetchAllAssenze = async () => {
    const res = await fetch("/flask-api/api/assenze", { credentials: "include" });
    if (res.ok) setTutteAssenze(await res.json());
  };

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
        const todayStr = today;
        setMeiTurni(all.filter((t) => t.data >= todayStr).sort((a, b) => a.data.localeCompare(b.data)).slice(0, 10));
      }
      if (dipRes.ok) setDipendenti(await dipRes.json());
      if (canManage) await fetchAllAssenze();
    } finally { setLoading(false); }
  }, [user]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (!colleagueId) { setColleagueTurni([]); return; }
    fetch(`/flask-api/api/turni?dipendente_id=${colleagueId}&mese=${mese}&anno=${anno}`, { credentials: "include" })
      .then((r) => r.ok ? r.json() : []).then(setColleagueTurni);
  }, [colleagueId]);

  /* ── Staff profile open ── */
  const openProfile = (dip: Dipendente) => {
    if (!canManage) return;
    setProfileTarget(dip);
    setProfileTab("preferenze");
    setPrefSelected((dip.preferenze_turno ?? ["MATTINO", "POMERIGGIO", "NOTTE"]) as Pref[]);
    setAssenze([]);
    setNewAssenza({ tipo: "MALATTIA", data_inizio: today, data_fine: today, note: "" });
    setAddingAssenza(false);
  };

  /* Fetch absences for selected staff */
  useEffect(() => {
    if (!profileTarget || profileTab !== "assenze") return;
    setAssenzeLoading(true);
    fetch(`/flask-api/api/assenze?dipendente_id=${profileTarget.id}`, { credentials: "include" })
      .then((r) => r.ok ? r.json() : [])
      .then(setAssenze)
      .finally(() => setAssenzeLoading(false));
  }, [profileTarget, profileTab]);

  /* ── Preferences save ── */
  const savePref = async () => {
    if (!profileTarget || prefSelected.length === 0) {
      toast({ title: "Seleziona almeno un turno", variant: "destructive" }); return;
    }
    setPrefLoading(true);
    try {
      const res = await fetch(`/flask-api/api/dipendenti/${profileTarget.id}/preferenze`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ preferenze: prefSelected }),
      });
      if (res.ok) {
        const updated: Dipendente = await res.json();
        setStats((prev) => prev.map((d) => d.id === updated.id ? updated : d));
        setDipendenti((prev) => prev.map((d) => d.id === updated.id ? updated : d));
        toast({ title: `Preferenze di ${profileTarget.nome} aggiornate` });
      } else toast({ title: "Errore", variant: "destructive" });
    } finally { setPrefLoading(false); }
  };

  /* ── Add absence ── */
  const handleAddAssenza = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileTarget) return;
    if (newAssenza.data_inizio > newAssenza.data_fine) {
      toast({ title: "La data inizio deve precedere la data fine", variant: "destructive" }); return;
    }
    setAddingAssenza(true);
    try {
      const res = await fetch("/flask-api/api/assenze", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ dipendente_id: profileTarget.id, ...newAssenza }),
      });
      if (res.ok) {
        const nuova: Assenza = await res.json();
        setAssenze((prev) => [nuova, ...prev]);
        setTutteAssenze((prev) => [nuova, ...prev]);
        setNewAssenza({ tipo: "MALATTIA", data_inizio: today, data_fine: today, note: "" });
        toast({ title: `Assenza registrata per ${profileTarget.nome}` });
      } else {
        const err = await res.json();
        toast({ title: err.errore || "Errore", variant: "destructive" });
      }
    } finally { setAddingAssenza(false); }
  };

  /* ── Delete absence ── */
  const handleDeleteAssenza = async (id: number) => {
    if (!confirm("Eliminare questa assenza?")) return;
    const res = await fetch(`/flask-api/api/assenze/${id}`, { method: "DELETE", credentials: "include" });
    if (res.ok) {
      setAssenze((prev) => prev.filter((a) => a.id !== id));
      setTutteAssenze((prev) => prev.filter((a) => a.id !== id));
      toast({ title: "Assenza eliminata" });
    } else toast({ title: "Errore", variant: "destructive" });
  };

  /* ── Swap ── */
  const openSwap = (turno: Turno) => {
    setSwapTurno(turno); setColleagueId(""); setColleagueTurnoId(""); setSwapNota(""); setSwapOpen(true);
  };
  const submitSwap = async () => {
    if (!swapTurno || !colleagueId) { toast({ title: "Seleziona collega", variant: "destructive" }); return; }
    setSwapLoading(true);
    try {
      const res = await fetch("/flask-api/api/scambi", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ richiedente_id: user?.id, destinatario_id: parseInt(colleagueId), turno_richiedente_id: swapTurno.id, turno_destinatario_id: colleagueTurnoId ? parseInt(colleagueTurnoId) : null, nota: swapNota }),
      });
      if (res.ok) { toast({ title: "Richiesta inviata" }); setSwapOpen(false); }
      else { const err = await res.json(); toast({ title: err.errore || "Errore", variant: "destructive" }); }
    } finally { setSwapLoading(false); }
  };

  /* ── Helpers ── */
  const getAbsenceToday = (dipId: number) =>
    tutteAssenze.find((a) => a.dipendente_id === dipId && isActiveToday(a, today));

  const myStats = stats.find((s) => s.id === user?.id) ?? user;
  const statCards = [
    { label: "Ore Totali",  value: myStats?.ore_totali  ?? 0, icon: Clock,       color: "text-gold",        bg: "bg-amber-500/10"   },
    { label: "Notti Fatte", value: myStats?.notti_fatte ?? 0, icon: Moon,        color: "text-slate-300",   bg: "bg-slate-500/10"   },
    { label: "Ferie",       value: myStats?.ferie       ?? 0, icon: CalendarOff, color: "text-emerald-400", bg: "bg-emerald-500/10" },
    { label: "Malattia",    value: myStats?.malattia    ?? 0, icon: Pill,        color: "text-red-400",     bg: "bg-red-500/10"     },
  ];

  return (
    <div className="min-h-screen">
      {/* Profile header */}
      <div className={`${theme.bg} border-b ${theme.border} px-6 md:px-10 py-8`}>
        <div className="max-w-7xl mx-auto flex items-center gap-5">
          <div className={`h-16 w-16 rounded-2xl ${theme.avatar} flex items-center justify-center text-2xl font-black`}>
            {user?.nome.charAt(0)}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-bold text-foreground">{user?.nome}</h1>
              <RoleBadge role={role} />
            </div>
            <p className={`text-sm font-medium ${theme.accent}`}>
              {role === "CAPOSALA" ? "Coordinatrice — Area riservata disponibile nel menu" : "Dashboard personale"}
            </p>
          </div>
          {user?.is_admin && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setAddUserOpen(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm glow-gold min-h-[36px]"
                style={{ background: "linear-gradient(155deg, #B8860B 0%, #FFBF00 38%, #FFE566 52%, #FFBF00 75%, #B8860B 100%)", color: "#0f172a" }}
              >
                <UserPlus className="h-4 w-4" />
                <span className="hidden sm:inline">Nuovo Utente</span>
              </button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setResetOpen(true)}
                className="gap-2 border-red-500/30 text-red-400/70 hover:text-red-400 hover:bg-red-500/10 hover:border-red-500/50 transition-all"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Reset</span>
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-8">
        {/* Stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {statCards.map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className="glass rounded-2xl p-5 flex items-center gap-4">
              <div className={`p-3 ${bg} ${color} rounded-xl`}><Icon className="h-5 w-5" /></div>
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
                          {turno.ore > 0 && <span className="text-xs text-muted-foreground">{turno.ore}h</span>}
                        </div>
                        <Button size="sm" variant="outline" className="shrink-0 text-xs gap-1.5 border-white/10 hover:border-amber-500/50 hover:text-amber-400 hover:bg-amber-500/10" onClick={() => openSwap(turno)}>
                          <ArrowLeftRight className="h-3.5 w-3.5" />Scambio
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
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center justify-between">
                  Staff — Ore
                  {canManage && <span className="text-[10px] font-normal text-muted-foreground/50 normal-case">Clicca per gestire</span>}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="border-white/5 hover:bg-transparent">
                      <TableHead className="pl-6 text-muted-foreground text-xs">Nome</TableHead>
                      <TableHead className="text-muted-foreground text-xs">Stato</TableHead>
                      <TableHead className="text-right pr-2 text-muted-foreground text-xs">Ore</TableHead>
                      {user?.is_admin && <TableHead className="w-8 pr-3" />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stats.slice().filter(d => d.ruolo !== 'CAPOSALA').sort((a, b) => b.ore_totali - a.ore_totali).map((dip) => {
                      const absence = canManage ? getAbsenceToday(dip.id) : undefined;
                      const canDelete = user?.is_admin && !dip.is_admin && dip.id !== user?.id;
                      return (
                        <TableRow
                          key={dip.id}
                          className={`border-white/5 transition-colors ${dip.id === user?.id ? theme.bg : "hover:bg-white/3"} ${canManage ? "cursor-pointer" : ""}`}
                          onClick={() => canManage && openProfile(dip)}
                        >
                          <TableCell className="pl-6 font-medium text-foreground">
                            <div className="flex items-center gap-2">
                              {dip.id === user?.id && <User className="h-3.5 w-3.5 text-muted-foreground" />}
                              {dip.nome}
                            </div>
                            <RoleBadge role={dip.ruolo} className="mt-0.5 text-xs" />
                          </TableCell>
                          <TableCell>
                            {absence ? (
                              <span className={`inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                                absence.tipo === "MALATTIA"
                                  ? "bg-red-500/15 text-red-400 border-red-500/25"
                                  : "bg-emerald-500/15 text-emerald-400 border-emerald-500/25"
                              }`}>
                                {absence.tipo === "MALATTIA"
                                  ? <AlertTriangle className="h-2.5 w-2.5" />
                                  : <Palmtree className="h-2.5 w-2.5" />}
                                {absence.tipo === "MALATTIA" ? "Malattia" : "Ferie"}
                              </span>
                            ) : (
                              <span className="text-[9px] font-semibold text-emerald-400/70 bg-emerald-500/8 border border-emerald-500/15 px-1.5 py-0.5 rounded">Attivo</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right pr-2 font-mono text-sm text-gold font-bold">{dip.ore_totali}</TableCell>
                          {user?.is_admin && (
                            <TableCell className="pr-3 w-8">
                              {canDelete && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 text-red-400/30 hover:text-red-400 hover:bg-red-500/10"
                                  onClick={(e) => { e.stopPropagation(); setDeleteTarget(dip); }}
                                  data-testid={`dash-delete-${dip.id}`}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              )}
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* ── Staff Profile Dialog ── */}
      <Dialog open={!!profileTarget} onOpenChange={(open) => !open && setProfileTarget(null)}>
        <DialogContent className="glass-strong border-white/10 max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 text-foreground">
              <div className={`h-9 w-9 rounded-xl ${ROLE_THEME[(profileTarget?.ruolo ?? "OSS") as Ruolo]?.avatar ?? ""} flex items-center justify-center font-bold text-sm`}>
                {profileTarget?.nome.charAt(0)}
              </div>
              <div>
                <p className="font-bold">{profileTarget?.nome}</p>
                {profileTarget && <RoleBadge role={profileTarget.ruolo} className="text-xs" />}
              </div>
            </DialogTitle>
          </DialogHeader>

          {/* Tabs */}
          <div className="flex gap-1 bg-white/4 rounded-xl p-1 mt-1">
            {(["preferenze", "assenze"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setProfileTab(tab)}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold uppercase tracking-wide transition-all ${
                  profileTab === tab
                    ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab === "preferenze" ? <span className="flex items-center justify-center gap-1.5"><Settings2 className="h-3 w-3" />Preferenze</span>
                                      : <span className="flex items-center justify-center gap-1.5"><CalendarX className="h-3 w-3" />Assenze</span>}
              </button>
            ))}
          </div>

          {/* ── Tab: Preferenze ── */}
          {profileTab === "preferenze" && (
            <div className="space-y-4 mt-2">
              <p className="text-xs text-muted-foreground">Tipi di turno assegnabili nella generazione automatica.</p>
              <div className="space-y-2">
                {PREF_OPTIONS.map(({ key, label, icon: Icon, color }) => {
                  const active = prefSelected.includes(key);
                  return (
                    <button key={key} type="button" onClick={() => setPrefSelected((prev) => prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key])}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left ${active ? color : "bg-white/3 border-white/8 text-muted-foreground hover:bg-white/6"}`}>
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="font-semibold text-sm flex-1">{label}</span>
                      {active && <Check className="h-4 w-4 shrink-0" />}
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-3 pt-1">
                <Button variant="outline" className="flex-1 border-white/10 hover:bg-white/5" onClick={() => setProfileTarget(null)}>Chiudi</Button>
                <button onClick={savePref} disabled={prefLoading || prefSelected.length === 0}
                  className="flex-1 rounded-lg font-bold text-sm flex items-center justify-center gap-2 glow-gold py-2 disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg, #f59e0b, #d97706)", color: "#0f172a" }}>
                  {prefLoading ? "Salvo..." : "Salva Preferenze"}
                </button>
              </div>
            </div>
          )}

          {/* ── Tab: Assenze ── */}
          {profileTab === "assenze" && (
            <div className="space-y-5 mt-2">
              {/* Add new absence form */}
              <div className="rounded-2xl bg-white/3 border border-white/8 p-4 space-y-3">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                  <PlusCircle className="h-3.5 w-3.5 text-amber-400" />
                  Registra Assenza
                </p>
                <form onSubmit={handleAddAssenza} className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-muted-foreground text-xs">Tipo</Label>
                      <Select value={newAssenza.tipo} onValueChange={(v) => setNewAssenza({ ...newAssenza, tipo: v as "MALATTIA" | "FERIE" })}>
                        <SelectTrigger className="border-white/10 bg-white/5 h-9 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="MALATTIA">🤒 Malattia</SelectItem>
                          <SelectItem value="FERIE">🌴 Ferie</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-muted-foreground text-xs">Note (opzionale)</Label>
                      <Input value={newAssenza.note} onChange={(e) => setNewAssenza({ ...newAssenza, note: e.target.value })} placeholder="Es. certificato medico" className="border-white/10 bg-white/5 h-9 text-sm" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-muted-foreground text-xs">Dal</Label>
                      <Input type="date" value={newAssenza.data_inizio} onChange={(e) => setNewAssenza({ ...newAssenza, data_inizio: e.target.value })} required className="border-white/10 bg-white/5 h-9 text-sm" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-muted-foreground text-xs">Al</Label>
                      <Input type="date" value={newAssenza.data_fine} onChange={(e) => setNewAssenza({ ...newAssenza, data_fine: e.target.value })} min={newAssenza.data_inizio} required className="border-white/10 bg-white/5 h-9 text-sm" />
                    </div>
                  </div>
                  <button type="submit" disabled={addingAssenza}
                    className="w-full py-2 rounded-lg font-bold text-sm flex items-center justify-center gap-2 glow-gold disabled:opacity-50"
                    style={{ background: "linear-gradient(135deg, #f59e0b, #d97706)", color: "#0f172a" }}>
                    <PlusCircle className="h-4 w-4" />
                    {addingAssenza ? "Salvataggio..." : "Salva Assenza"}
                  </button>
                </form>
              </div>

              {/* Absence history */}
              <div className="space-y-2">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
                  Storico assenze — {profileTarget?.nome}
                </p>
                {assenzeLoading ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Caricamento...</p>
                ) : assenze.length === 0 ? (
                  <div className="rounded-xl bg-white/3 border border-white/8 p-6 text-center">
                    <CalendarX className="h-6 w-6 text-muted-foreground/20 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">Nessuna assenza registrata</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {assenze.map((a) => {
                      const active = isActiveToday(a, today);
                      return (
                        <div key={a.id} className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                          active
                            ? a.tipo === "MALATTIA"
                              ? "bg-red-500/8 border-red-500/20"
                              : "bg-emerald-500/8 border-emerald-500/20"
                            : "bg-white/3 border-white/8"
                        }`}>
                          <div className={`p-2 rounded-lg shrink-0 ${
                            a.tipo === "MALATTIA" ? "bg-red-500/15 text-red-400" : "bg-emerald-500/15 text-emerald-400"
                          }`}>
                            {a.tipo === "MALATTIA" ? <AlertTriangle className="h-4 w-4" /> : <Palmtree className="h-4 w-4" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={`text-xs font-bold ${a.tipo === "MALATTIA" ? "text-red-300" : "text-emerald-300"}`}>
                                {a.tipo === "MALATTIA" ? "Malattia" : "Ferie"}
                              </span>
                              {active && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 uppercase">In corso</span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {formatDate(a.data_inizio)} → {formatDate(a.data_fine)}
                            </p>
                            {a.note && <p className="text-xs text-muted-foreground/60 mt-0.5 truncate">{a.note}</p>}
                          </div>
                          <Button variant="ghost" size="icon" onClick={() => handleDeleteAssenza(a.id)}
                            className="h-7 w-7 shrink-0 text-red-400/40 hover:text-red-400 hover:bg-red-500/10">
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Delete Dipendente Dialog ── */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && !deleteLoading && setDeleteTarget(null)}>
        <DialogContent className="glass-strong border-white/10 max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-400">
              <Trash2 className="h-5 w-5" />
              Elimina Dipendente
            </DialogTitle>
          </DialogHeader>
          {deleteTarget && (
            <div className="space-y-4">
              <div className="rounded-xl bg-red-500/8 border border-red-500/20 p-4 space-y-2">
                <p className="text-sm font-semibold text-foreground">
                  Stai per eliminare <span className="text-red-300">{deleteTarget.nome}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  Questa azione è <strong className="text-red-400">irreversibile</strong>. Verranno eliminati:
                </p>
                <ul className="text-xs text-muted-foreground space-y-0.5 ml-3">
                  <li>• Tutti i turni assegnati</li>
                  <li>• Tutte le richieste di scambio</li>
                  <li>• Tutte le assenze registrate</li>
                  <li>• L'accesso all'app</li>
                </ul>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1 border-white/10 hover:bg-white/5" onClick={() => setDeleteTarget(null)} disabled={deleteLoading}>
                  Annulla
                </Button>
                <Button className="flex-1 bg-red-600 hover:bg-red-500 text-white gap-2" onClick={handleDeleteDip} disabled={deleteLoading}>
                  <Trash2 className="h-4 w-4" />
                  {deleteLoading ? "Eliminazione..." : "Elimina"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Reset Completo Dialog ── */}
      <Dialog open={resetOpen} onOpenChange={(open) => !open && !resetLoading && setResetOpen(false)}>
        <DialogContent className="glass-strong border-white/10 max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-400">
              <RotateCcw className="h-5 w-5" />
              Reset Completo Sistema
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-xl bg-red-500/8 border border-red-500/20 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-red-400 shrink-0" />
                <p className="text-sm font-semibold text-red-300">Azione irreversibile</p>
              </div>
              <p className="text-xs text-muted-foreground">Verranno eliminati permanentemente:</p>
              <ul className="text-xs text-muted-foreground space-y-0.5 ml-3">
                <li>• Tutti i turni (manuali e automatici)</li>
                <li>• Tutte le richieste di scambio</li>
                <li>• Tutte le assenze registrate</li>
                <li>• Contatori ore, notti, ferie e malattia</li>
              </ul>
              <p className="text-xs text-amber-400/80 mt-2 font-medium">Gli account e le preferenze dei dipendenti vengono mantenuti.</p>
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1 border-white/10 hover:bg-white/5"
                onClick={() => setResetOpen(false)}
                disabled={resetLoading}
              >
                Annulla
              </Button>
              <Button
                className="flex-1 bg-red-600 hover:bg-red-500 text-white gap-2"
                onClick={handleResetCompleto}
                disabled={resetLoading}
                data-testid="confirm-reset"
              >
                <RotateCcw className="h-4 w-4" />
                {resetLoading ? "Reset in corso..." : "Azzera Tutto"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Add User Dialog (admin only) ── */}
      <Dialog open={addUserOpen} onOpenChange={(open) => !open && !addUserLoading && setAddUserOpen(false)}>
        <DialogContent className="glass-strong border-white/10 max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <UserPlus className="h-4 w-4 text-amber-400" />Nuovo Utente
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddUser} className="space-y-4">
            <div className="space-y-2">
              <Label className="text-muted-foreground">Nome e Cognome</Label>
              <Input
                value={newUser.nome}
                onChange={(e) => setNewUser({ ...newUser, nome: e.target.value })}
                placeholder="Es. Maria Rossi"
                required
                className="border-white/10 bg-white/5"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground">Categoria</Label>
              <Select value={newUser.ruolo} onValueChange={(v) => setNewUser({ ...newUser, ruolo: v as Ruolo })}>
                <SelectTrigger className="border-white/10 bg-white/5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(["OSS", "INFERMIERA", "AUSILIARIO", "CAPOSALA"] as Ruolo[]).map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground flex items-center gap-2">
                <KeyRound className="h-3.5 w-3.5" />Password accesso
              </Label>
              <Input
                value={newUser.password}
                onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                placeholder="password123"
                className="border-white/10 bg-white/5 font-mono"
              />
              <p className="text-[10px] text-muted-foreground/60">L'utente dovrà cambiarla al primo accesso.</p>
            </div>
            <div className="rounded-xl bg-amber-500/8 border border-amber-500/20 p-3 text-xs text-amber-300/80 space-y-1">
              <p className="font-semibold">Accesso creato automaticamente</p>
              <p>L'utente potrà entrare con il proprio nome e la password impostata.</p>
            </div>
            <div className="flex gap-3 pt-1">
              <Button variant="outline" className="flex-1 border-white/10 hover:bg-white/5 min-h-[44px]"
                type="button" onClick={() => setAddUserOpen(false)} disabled={addUserLoading}>
                Annulla
              </Button>
              <button type="submit" disabled={addUserLoading}
                className="flex-1 py-2.5 rounded-xl font-bold text-sm glow-gold disabled:opacity-40 flex items-center justify-center gap-2 min-h-[44px]"
                style={{ background: "linear-gradient(155deg, #B8860B 0%, #FFBF00 38%, #FFE566 52%, #FFBF00 75%, #B8860B 100%)", color: "#0f172a" }}>
                <UserPlus className="h-4 w-4" />
                {addUserLoading ? "Creazione..." : "Crea Utente"}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Swap Dialog ── */}
      <Dialog open={swapOpen} onOpenChange={setSwapOpen}>
        <DialogContent className="max-w-md glass-strong border-white/10">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <ArrowLeftRight className="h-5 w-5 text-amber-400" />Richiedi Scambio Turno
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
              <Label className="text-muted-foreground">Collega</Label>
              <Select value={colleagueId} onValueChange={(v) => { setColleagueId(v); setColleagueTurnoId(""); }}>
                <SelectTrigger className="border-white/10 bg-white/5"><SelectValue placeholder="Seleziona..." /></SelectTrigger>
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
                  <SelectTrigger className="border-white/10 bg-white/5"><SelectValue placeholder="Nessuna preferenza" /></SelectTrigger>
                  <SelectContent>
                    {colleagueTurni.length === 0
                      ? <SelectItem value="__none" disabled>Nessun turno</SelectItem>
                      : colleagueTurni.map((t) => <SelectItem key={t.id} value={t.id.toString()}>{t.data} — {t.tipo}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label className="text-muted-foreground">Motivazione <span className="text-muted-foreground/60 font-normal">(opzionale)</span></Label>
              <Textarea placeholder="Es. Motivi famigliari..." value={swapNota} onChange={(e) => setSwapNota(e.target.value)} rows={3} className="border-white/10 bg-white/5 resize-none" />
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1 border-white/10 hover:bg-white/5" onClick={() => setSwapOpen(false)}>Annulla</Button>
              <button onClick={submitSwap} disabled={swapLoading || !colleagueId}
                className="flex-1 rounded-lg font-bold text-sm gap-2 flex items-center justify-center glow-gold py-2 disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #f59e0b, #d97706)", color: "#0f172a" }}>
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
