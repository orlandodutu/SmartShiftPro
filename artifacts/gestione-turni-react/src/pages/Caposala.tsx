import { useEffect, useState } from "react";
import { Dipendente, Assenza } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RoleBadge } from "@/components/ui/RoleBadge";
import {
  Check, CalendarRange, Calendar, ShieldAlert,
  UserPlus, Pencil, Phone, Users, Copy, Trash2,
  Sun, Sunset, BedDouble, Stethoscope, Palmtree,
  ChevronRight,
} from "lucide-react";

type Pref = "MATTINO" | "POMERIGGIO" | "NOTTE";
const PREF_OPTIONS: { key: Pref; label: string; icon: typeof Sun; color: string }[] = [
  { key: "MATTINO",    label: "Mattino",    icon: Sun,       color: "bg-amber-500/15 text-amber-300 border-amber-500/30"    },
  { key: "POMERIGGIO", label: "Pomeriggio", icon: Sunset,    color: "bg-orange-500/15 text-orange-300 border-orange-500/30" },
  { key: "NOTTE",      label: "Notte",      icon: BedDouble, color: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30" },
];

const CRYSTAL = "linear-gradient(155deg, #B8860B 0%, #FFBF00 38%, #FFE566 52%, #FFBF00 75%, #B8860B 100%)";
const RUOLI = ["OSS", "INFERMIERA", "AUSILIARIO", "CAPOSALA"] as const;

function formatDate(d: string) {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

function dayCount(inizio: string, fine: string) {
  const ms = new Date(fine).getTime() - new Date(inizio).getTime();
  return Math.round(ms / 86400000) + 1;
}

interface CreatedCreds { nome: string; ruolo: string; }

export default function Caposala() {
  const { user } = useAuth();
  const { toast } = useToast();
  const today = new Date().toISOString().split("T")[0];

  const [genLoading, setGenLoading] = useState<"settimana" | "mese" | null>(null);

  // ── Assenze state ──
  const [dipendenti, setDipendenti] = useState<Dipendente[]>([]);
  const [assenze, setAssenze]       = useState<Assenza[]>([]);
  const [assenzaForm, setAssenzaForm] = useState<{
    dipendente_id: string; tipo: "FERIE" | "MALATTIA"; data_inizio: string; data_fine: string;
  }>({ dipendente_id: "", tipo: "MALATTIA", data_inizio: today, data_fine: today });
  const [assenzaLoading, setAssenzaLoading] = useState(false);
  const [deleteAssenzaId, setDeleteAssenzaId] = useState<number | null>(null);
  const [deleteAssenzaLoading, setDeleteAssenzaLoading] = useState(false);

  // ── Staff management state ──
  const [showAdd, setShowAdd]         = useState(false);
  const [nuovoNome, setNuovoNome]     = useState("");
  const [nuovoRuolo, setNuovoRuolo]   = useState("OSS");
  const [addLoading, setAddLoading]   = useState(false);
  const [createdCreds, setCreatedCreds] = useState<CreatedCreds | null>(null);
  const [editDip, setEditDip]         = useState<Dipendente | null>(null);
  const [editRuolo, setEditRuolo]     = useState("");
  const [editPrefs, setEditPrefs]     = useState<Pref[]>(["MATTINO", "POMERIGGIO", "NOTTE"]);
  const [editLoading, setEditLoading] = useState(false);
  const [deleteTarget, setDeleteTarget]   = useState<Dipendente | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const fetchDipendenti = () =>
    fetch("/flask-api/api/dipendenti", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then(setDipendenti);

  const fetchAssenze = () =>
    fetch("/flask-api/api/assenze", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Assenza[]) => {
        // Show upcoming + ongoing, sorted by start date desc
        setAssenze(data);
      });

  useEffect(() => {
    fetchDipendenti();
    fetchAssenze();
  }, []);

  // ── Aggiungi assenza ──
  const handleAddAssenza = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assenzaForm.dipendente_id) {
      toast({ title: "Seleziona un dipendente", variant: "destructive" }); return;
    }
    if (assenzaForm.data_inizio > assenzaForm.data_fine) {
      toast({ title: "La data inizio deve precedere la data fine", variant: "destructive" }); return;
    }
    setAssenzaLoading(true);
    try {
      const res = await fetch("/flask-api/api/assenze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          dipendente_id: Number(assenzaForm.dipendente_id),
          tipo: assenzaForm.tipo,
          data_inizio: assenzaForm.data_inizio,
          data_fine: assenzaForm.data_fine,
          note: "",
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const dip = dipendenti.find((d) => d.id === Number(assenzaForm.dipendente_id));
        const aggiornati = (data.turni_aggiornati ?? 0) + (data.turni_creati ?? 0);
        toast({
          title: `${assenzaForm.tipo === "FERIE" ? "Ferie" : "Malattia"} registrata`,
          description: `${dip?.nome ?? ""} — ${formatDate(assenzaForm.data_inizio)} → ${formatDate(assenzaForm.data_fine)}. ${aggiornati} turni aggiornati automaticamente.`,
        });
        setAssenzaForm({ dipendente_id: "", tipo: "MALATTIA", data_inizio: today, data_fine: today });
        fetchAssenze();
      } else {
        const err = await res.json();
        toast({ title: err.errore || "Errore", variant: "destructive" });
      }
    } catch {
      toast({ title: "Errore di rete", variant: "destructive" });
    } finally {
      setAssenzaLoading(false);
    }
  };

  // ── Elimina assenza ──
  const handleDeleteAssenza = async () => {
    if (!deleteAssenzaId) return;
    setDeleteAssenzaLoading(true);
    try {
      const res = await fetch(`/flask-api/api/assenze/${deleteAssenzaId}`, {
        method: "DELETE", credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        toast({
          title: "Assenza eliminata",
          description: data.turni_rimossi > 0
            ? `${data.turni_rimossi} turni FERIE/MALATTIA rimossi — pronti per rigenerazione.`
            : "Assenza rimossa.",
        });
        setDeleteAssenzaId(null);
        fetchAssenze();
      } else {
        toast({ title: "Errore eliminazione", variant: "destructive" });
      }
    } finally {
      setDeleteAssenzaLoading(false);
    }
  };

  // ── Generation ──
  const handleGenera = async (modalita: "settimana" | "mese") => {
    setGenLoading(modalita);
    const todayStr = new Date().toISOString().split("T")[0];
    try {
      const res = await fetch("/flask-api/api/genera_programmazione", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ modalita, data_inizio: todayStr }),
      });
      if (res.ok) {
        const data = await res.json();
        toast({
          title: "Turni generati",
          description: `${data.generati} turni creati su ${data.giorni} giorni (${data.saltati} saltati)`,
        });
      } else {
        toast({ title: "Errore nella generazione", variant: "destructive" });
      }
    } catch {
      toast({ title: "Errore di rete", variant: "destructive" });
    } finally {
      setGenLoading(null);
    }
  };

  // ── Add staff ──
  const handleAddDipendente = async (e: React.FormEvent) => {
    e.preventDefault();
    const nome = nuovoNome.trim();
    if (!nome) { toast({ title: "Inserisci un nome", variant: "destructive" }); return; }
    setAddLoading(true);
    try {
      const res = await fetch("/flask-api/api/dipendenti", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ nome, ruolo: nuovoRuolo }),
      });
      if (res.ok) {
        setNuovoNome(""); setNuovoRuolo("OSS"); setShowAdd(false);
        setCreatedCreds({ nome, ruolo: nuovoRuolo });
        fetchDipendenti();
      } else {
        const err = await res.json();
        toast({ title: err.errore || "Errore", variant: "destructive" });
      }
    } finally {
      setAddLoading(false);
    }
  };

  // ── Edit staff ──
  const openEdit = (d: Dipendente) => {
    setEditDip(d);
    setEditRuolo(d.ruolo);
    setEditPrefs((d.preferenze_turno ?? ["MATTINO", "POMERIGGIO", "NOTTE"]) as Pref[]);
  };

  const handleSaveEdit = async () => {
    if (!editDip) return;
    if (editPrefs.length === 0) {
      toast({ title: "Seleziona almeno un tipo di turno", variant: "destructive" }); return;
    }
    setEditLoading(true);
    try {
      const [ruoloRes, prefRes] = await Promise.all([
        fetch(`/flask-api/api/dipendenti/${editDip.id}`, {
          method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "include",
          body: JSON.stringify({ ruolo: editRuolo }),
        }),
        fetch(`/flask-api/api/dipendenti/${editDip.id}/preferenze`, {
          method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "include",
          body: JSON.stringify({ preferenze: editPrefs }),
        }),
      ]);
      if (ruoloRes.ok && prefRes.ok) {
        const prefData = await prefRes.json();
        const riadattati: number = prefData.riadattati ?? 0;
        const tipiRimossi: string[] = prefData.tipi_rimossi ?? [];
        toast({
          title: `${editDip.nome} aggiornato`,
          description: riadattati > 0 && tipiRimossi.length > 0
            ? `${riadattati} turno/i futuri di tipo ${tipiRimossi.join(", ")} spostati automaticamente.`
            : undefined,
        });
        setEditDip(null);
        fetchDipendenti();
      } else {
        toast({ title: "Errore nel salvataggio", variant: "destructive" });
      }
    } finally {
      setEditLoading(false);
    }
  };

  // ── Delete staff ──
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      const res = await fetch(`/flask-api/api/dipendenti/${deleteTarget.id}`, {
        method: "DELETE", credentials: "include",
      });
      if (res.ok) {
        toast({ title: `${deleteTarget.nome} rimosso` });
        setDeleteTarget(null);
        fetchDipendenti();
      } else {
        const err = await res.json();
        toast({ title: err.errore || "Errore", variant: "destructive" });
      }
    } finally {
      setDeleteLoading(false);
    }
  };

  if (user?.ruolo !== "CAPOSALA" && !user?.is_admin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-2">
          <ShieldAlert className="h-12 w-12 text-red-400/60 mx-auto" />
          <p className="text-lg font-semibold text-foreground">Accesso negato</p>
          <p className="text-sm text-muted-foreground">Quest'area è riservata alla Caposala.</p>
        </div>
      </div>
    );
  }

  const staffVisibile = dipendenti.filter((d) => user?.is_admin ? true : !d.is_admin);

  // Assenze: split upcoming/active vs past
  const assenzeAttive = assenze.filter((a) => a.data_fine >= today).sort((a, b) => a.data_inizio.localeCompare(b.data_inizio));
  const assenzePast   = assenze.filter((a) => a.data_fine < today).sort((a, b) => b.data_inizio.localeCompare(a.data_inizio)).slice(0, 5);

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="bg-yellow-950/40 border-b border-yellow-800/40 px-6 md:px-10 py-8">
        <div className="max-w-5xl mx-auto flex items-center gap-5">
          <div className="h-14 w-14 rounded-2xl bg-yellow-900/60 text-yellow-400 flex items-center justify-center shadow-sm">
            <ShieldAlert className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Area Gestione</h1>
            <p className="text-sm text-yellow-400 font-medium mt-0.5">Assenze, turni e staff</p>
          </div>
        </div>
      </div>

      <div className="p-6 md:p-10 max-w-5xl mx-auto space-y-12">

        {/* ════════════════════════════════════════════
            SEZIONE 1 — REGISTRA ASSENZA
        ════════════════════════════════════════════ */}
        <section>
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-5">
            Registra Assenza
          </h2>

          {/* Form card */}
          <form onSubmit={handleAddAssenza}>
            <div className="rounded-2xl border border-white/10 bg-white/3 p-6 space-y-5">

              {/* Tipo toggle */}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setAssenzaForm((f) => ({ ...f, tipo: "MALATTIA" }))}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border font-semibold text-sm transition-all ${
                    assenzaForm.tipo === "MALATTIA"
                      ? "bg-red-500/15 border-red-500/40 text-red-300"
                      : "bg-white/3 border-white/8 text-muted-foreground hover:bg-white/6"
                  }`}
                >
                  <Stethoscope className="h-4 w-4" />
                  Malattia
                </button>
                <button
                  type="button"
                  onClick={() => setAssenzaForm((f) => ({ ...f, tipo: "FERIE" }))}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border font-semibold text-sm transition-all ${
                    assenzaForm.tipo === "FERIE"
                      ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300"
                      : "bg-white/3 border-white/8 text-muted-foreground hover:bg-white/6"
                  }`}
                >
                  <Palmtree className="h-4 w-4" />
                  Ferie
                </button>
              </div>

              {/* Dipendente */}
              <div className="space-y-1.5">
                <Label className="text-muted-foreground text-xs">Dipendente</Label>
                <Select
                  value={assenzaForm.dipendente_id}
                  onValueChange={(v) => setAssenzaForm((f) => ({ ...f, dipendente_id: v }))}
                >
                  <SelectTrigger className="bg-black/20 border-white/10 focus:border-amber-400">
                    <SelectValue placeholder="Seleziona dipendente..." />
                  </SelectTrigger>
                  <SelectContent className="glass-strong border-white/10">
                    {staffVisibile
                      .filter((d) => !d.is_admin)
                      .sort((a, b) => a.nome.localeCompare(b.nome))
                      .map((d) => (
                        <SelectItem key={d.id} value={String(d.id)}>
                          <span className="flex items-center gap-2">
                            {d.nome}
                            <span className="text-[10px] text-muted-foreground">({d.ruolo})</span>
                          </span>
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Date range */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-muted-foreground text-xs">Data inizio</Label>
                  <Input
                    type="date"
                    value={assenzaForm.data_inizio}
                    onChange={(e) => setAssenzaForm((f) => ({ ...f, data_inizio: e.target.value }))}
                    className="bg-black/20 border-white/10 focus:border-amber-400 text-foreground"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-muted-foreground text-xs">Data fine</Label>
                  <Input
                    type="date"
                    value={assenzaForm.data_fine}
                    min={assenzaForm.data_inizio}
                    onChange={(e) => setAssenzaForm((f) => ({ ...f, data_fine: e.target.value }))}
                    className="bg-black/20 border-white/10 focus:border-amber-400 text-foreground"
                    required
                  />
                </div>
              </div>

              {/* Duration preview */}
              {assenzaForm.data_inizio && assenzaForm.data_fine && assenzaForm.data_inizio <= assenzaForm.data_fine && (
                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium ${
                  assenzaForm.tipo === "MALATTIA"
                    ? "bg-red-500/8 border border-red-500/20 text-red-300"
                    : "bg-emerald-500/8 border border-emerald-500/20 text-emerald-300"
                }`}>
                  {assenzaForm.tipo === "MALATTIA" ? <Stethoscope className="h-3.5 w-3.5" /> : <Palmtree className="h-3.5 w-3.5" />}
                  {dayCount(assenzaForm.data_inizio, assenzaForm.data_fine)} giorn{dayCount(assenzaForm.data_inizio, assenzaForm.data_fine) === 1 ? "o" : "i"} di {assenzaForm.tipo === "MALATTIA" ? "malattia" : "ferie"}
                  <ChevronRight className="h-3 w-3 opacity-50" />
                  <span className="text-muted-foreground">i turni esistenti verranno sostituiti automaticamente</span>
                </div>
              )}

              <button
                type="submit"
                disabled={assenzaLoading || !assenzaForm.dipendente_id}
                className="w-full h-11 rounded-xl font-bold text-sm uppercase tracking-widest transition-all disabled:opacity-50 glow-gold"
                style={{ background: CRYSTAL, color: "#0f172a" }}
              >
                {assenzaLoading ? "Salvataggio..." : "Registra e aggiorna turni"}
              </button>
            </div>
          </form>

          {/* Assenze attive / future */}
          {assenzeAttive.length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 px-1">
                Assenze in corso e future
              </p>
              {assenzeAttive.map((a) => {
                const isActive = a.data_inizio <= today && a.data_fine >= today;
                const isMalattia = a.tipo === "MALATTIA";
                return (
                  <div
                    key={a.id}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors ${
                      isMalattia
                        ? "border-red-500/20 bg-red-500/5"
                        : "border-emerald-500/20 bg-emerald-500/5"
                    }`}
                  >
                    <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${
                      isMalattia ? "bg-red-500/15 text-red-400" : "bg-emerald-500/15 text-emerald-400"
                    }`}>
                      {isMalattia ? <Stethoscope className="h-4 w-4" /> : <Palmtree className="h-4 w-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-foreground">{a.nome_dipendente}</span>
                        {isActive && (
                          <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/20 animate-pulse">
                            in corso
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatDate(a.data_inizio)} → {formatDate(a.data_fine)}
                        <span className="mx-1 opacity-40">·</span>
                        {dayCount(a.data_inizio, a.data_fine)} gg
                      </p>
                    </div>
                    <button
                      onClick={() => setDeleteAssenzaId(a.id)}
                      className="h-7 w-7 rounded-lg bg-white/5 hover:bg-red-500/15 border border-white/10 hover:border-red-500/30 flex items-center justify-center text-muted-foreground hover:text-red-400 transition-colors shrink-0"
                      title="Elimina assenza"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Assenze passate recenti */}
          {assenzePast.length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/40 px-1">
                Assenze recenti (storico)
              </p>
              {assenzePast.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center gap-3 px-4 py-2.5 rounded-xl border border-white/6 bg-white/2 opacity-60"
                >
                  <div className={`h-6 w-6 rounded-lg flex items-center justify-center shrink-0 ${
                    a.tipo === "MALATTIA" ? "text-red-400/50" : "text-emerald-400/50"
                  }`}>
                    {a.tipo === "MALATTIA" ? <Stethoscope className="h-3.5 w-3.5" /> : <Palmtree className="h-3.5 w-3.5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-sm text-foreground/70">{a.nome_dipendente}</span>
                    <span className="text-xs text-muted-foreground ml-2">
                      {formatDate(a.data_inizio)} → {formatDate(a.data_fine)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {assenze.length === 0 && (
            <div className="mt-4 rounded-2xl border border-white/8 bg-white/3 p-6 text-center">
              <Calendar className="h-6 w-6 text-muted-foreground/20 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Nessuna assenza registrata</p>
            </div>
          )}
        </section>

        {/* ════════════════════════════════════════════
            SEZIONE 2 — GENERAZIONE AUTOMATICA
        ════════════════════════════════════════════ */}
        <section>
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-4">
            Generazione Automatica Turni
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              onClick={() => handleGenera("settimana")}
              disabled={genLoading !== null}
              data-testid="btn-genera-settimana"
              className="group rounded-2xl border border-blue-500/20 bg-blue-950/40 p-6 text-left transition-all hover:bg-blue-950/60 hover:border-blue-400/40 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="flex items-start gap-4">
                <div className="rounded-xl bg-blue-500 p-3 shadow-sm">
                  <CalendarRange className="h-6 w-6 text-white" />
                </div>
                <div>
                  <p className="font-bold text-foreground text-lg leading-tight">
                    {genLoading === "settimana" ? "Generazione..." : "Genera Settimana"}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">Pianifica i prossimi 7 giorni</p>
                </div>
              </div>
            </button>

            <button
              onClick={() => handleGenera("mese")}
              disabled={genLoading !== null}
              data-testid="btn-genera-mese"
              className="group rounded-2xl border border-emerald-500/20 bg-emerald-950/40 p-6 text-left transition-all hover:bg-emerald-950/60 hover:border-emerald-400/40 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="flex items-start gap-4">
                <div className="rounded-xl bg-emerald-500 p-3 shadow-sm">
                  <Calendar className="h-6 w-6 text-white" />
                </div>
                <div>
                  <p className="font-bold text-foreground text-lg leading-tight">
                    {genLoading === "mese" ? "Generazione..." : "Genera Mese"}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">Pianifica i prossimi 30 giorni</p>
                </div>
              </div>
            </button>
          </div>
        </section>

        {/* ════════════════════════════════════════════
            SEZIONE 3 — GESTIONE STAFF
        ════════════════════════════════════════════ */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Gestione Staff</h2>
              <span className="text-sm font-bold text-foreground bg-white/5 border border-white/10 px-3 py-0.5 rounded-full">
                {staffVisibile.length}
              </span>
            </div>
            <button
              onClick={() => { setNuovoNome(""); setNuovoRuolo("OSS"); setShowAdd(true); }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm glow-gold"
              style={{ background: CRYSTAL, color: "#0f172a" }}
              data-testid="btn-aggiungi-dipendente"
            >
              <UserPlus className="h-4 w-4" />
              Aggiungi
            </button>
          </div>

          <div className="space-y-2">
            {staffVisibile.length === 0 ? (
              <div className="glass rounded-2xl border border-white/8 p-8 text-center">
                <Users className="h-8 w-8 text-muted-foreground/20 mx-auto mb-3" />
                <p className="text-muted-foreground">Nessun dipendente trovato</p>
              </div>
            ) : (
              staffVisibile.map((d) => (
                <div
                  key={d.id}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl border border-white/8 bg-white/3 hover:bg-white/6 transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-white/8 flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0">
                    {d.nome.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-foreground text-sm">{d.nome}</span>
                      <RoleBadge role={d.ruolo} />
                      {d.is_admin && (
                        <span className="text-[9px] font-bold uppercase tracking-widest text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded">
                          Admin
                        </span>
                      )}
                    </div>
                    {d.telefono && (
                      <span className="text-xs text-muted-foreground/60 flex items-center gap-1 mt-0.5">
                        <Phone className="h-3 w-3" />
                        +39 {d.telefono}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      title="Modifica ruolo e preferenze"
                      onClick={() => openEdit(d)}
                      className="h-8 w-8 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                      data-testid={`edit-${d.id}`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    {!d.is_admin && (
                      <button
                        title="Elimina dipendente"
                        onClick={() => setDeleteTarget(d)}
                        className="h-8 w-8 rounded-lg bg-white/5 hover:bg-red-500/15 border border-white/10 hover:border-red-500/30 flex items-center justify-center text-muted-foreground hover:text-red-400 transition-colors"
                        data-testid={`delete-${d.id}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {/* ═══ DIALOGS ═══ */}

      {/* Delete assenza */}
      <Dialog open={!!deleteAssenzaId} onOpenChange={(open) => !open && setDeleteAssenzaId(null)}>
        <DialogContent className="glass-strong border-white/10 max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-400">
              <Trash2 className="h-5 w-5" />
              Elimina Assenza
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-xl bg-red-500/8 border border-red-500/20 p-4">
              <p className="text-sm text-muted-foreground">
                I turni FERIE/MALATTIA creati automaticamente in questo periodo verranno rimossi
                e potranno essere rigenerati.
              </p>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1 border-white/10 hover:bg-white/5"
                onClick={() => setDeleteAssenzaId(null)} disabled={deleteAssenzaLoading}>
                Annulla
              </Button>
              <Button className="flex-1 bg-red-600 hover:bg-red-500 text-white gap-2"
                onClick={handleDeleteAssenza} disabled={deleteAssenzaLoading}>
                <Trash2 className="h-4 w-4" />
                {deleteAssenzaLoading ? "..." : "Elimina"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add staff */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="glass-strong border-white/10 max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-400">
              <UserPlus className="h-5 w-5" />
              Aggiungi Dipendente
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddDipendente} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-xs">Nome completo <span className="text-amber-400">*</span></Label>
              <Input value={nuovoNome} onChange={(e) => setNuovoNome(e.target.value)}
                placeholder="Es. Maria Rossi" required
                className="bg-black/20 border-white/10 focus:border-amber-400"
                data-testid="nuovo-nome" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-xs">Ruolo <span className="text-amber-400">*</span></Label>
              <Select value={nuovoRuolo} onValueChange={setNuovoRuolo}>
                <SelectTrigger className="bg-black/20 border-white/10" data-testid="nuovo-ruolo">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="glass-strong border-white/10">
                  {RUOLI.map((r) => (
                    <SelectItem key={r} value={r}>{r === "INFERMIERA" ? "Infermiere/a" : r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-3">
              <Button type="button" variant="outline" className="flex-1 border-white/10 hover:bg-white/5"
                onClick={() => setShowAdd(false)}>Annulla</Button>
              <button type="submit" disabled={addLoading}
                className="flex-1 py-2 rounded-xl font-bold text-sm glow-gold disabled:opacity-50"
                style={{ background: CRYSTAL, color: "#0f172a" }}
                data-testid="confirm-aggiungi">
                {addLoading ? "Salvataggio..." : "Aggiungi"}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Created confirmation */}
      <Dialog open={!!createdCreds} onOpenChange={(open) => !open && setCreatedCreds(null)}>
        <DialogContent className="glass-strong border-white/10 max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-400">
              <Check className="h-5 w-5" />
              Dipendente Aggiunto!
            </DialogTitle>
          </DialogHeader>
          {createdCreds && (
            <div className="space-y-4">
              <div className="rounded-xl bg-white/5 border border-white/10 p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">Nome</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm text-foreground">{createdCreds.nome}</span>
                    <button onClick={() => { navigator.clipboard.writeText(createdCreds.nome); toast({ title: "Copiato!" }); }}
                      className="text-muted-foreground/50 hover:text-muted-foreground">
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">Ruolo</span>
                  <span className="font-mono text-sm text-foreground">{createdCreds.ruolo}</span>
                </div>
              </div>
              <Button className="w-full bg-emerald-600 hover:bg-emerald-500 text-white"
                onClick={() => setCreatedCreds(null)}>Perfetto</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete staff */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
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
                  Azione <strong className="text-red-400">irreversibile</strong>. Verranno eliminati tutti i turni e le assenze associate.
                </p>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1 border-white/10 hover:bg-white/5"
                  onClick={() => setDeleteTarget(null)} disabled={deleteLoading}>Annulla</Button>
                <Button className="flex-1 bg-red-600 hover:bg-red-500 text-white gap-2"
                  onClick={handleDelete} disabled={deleteLoading} data-testid="confirm-delete">
                  <Trash2 className="h-4 w-4" />
                  {deleteLoading ? "Eliminazione..." : "Elimina"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit staff */}
      <Dialog open={!!editDip} onOpenChange={(open) => !open && setEditDip(null)}>
        <DialogContent className="glass-strong border-white/10 max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <Pencil className="h-5 w-5" />
              Modifica {editDip?.nome}
            </DialogTitle>
          </DialogHeader>
          {editDip && (
            <div className="space-y-5">
              <div className="space-y-1.5">
                <Label className="text-muted-foreground text-xs">Ruolo</Label>
                <Select value={editRuolo} onValueChange={setEditRuolo}>
                  <SelectTrigger className="bg-black/20 border-white/10" data-testid="edit-ruolo">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="glass-strong border-white/10">
                    {RUOLI.map((r) => (
                      <SelectItem key={r} value={r}>{r === "INFERMIERA" ? "Infermiere/a" : r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground text-xs">Turni assegnabili nella generazione automatica</Label>
                <div className="space-y-1.5">
                  {PREF_OPTIONS.map(({ key, label, icon: Icon, color }) => {
                    const active = editPrefs.includes(key);
                    return (
                      <button key={key} type="button"
                        onClick={() => setEditPrefs((prev) =>
                          prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]
                        )}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all text-left ${
                          active ? color : "bg-white/3 border-white/8 text-muted-foreground hover:bg-white/6"
                        }`}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="font-semibold text-sm flex-1">{label}</span>
                        {active && <Check className="h-4 w-4 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1 border-white/10 hover:bg-white/5"
                  onClick={() => setEditDip(null)} disabled={editLoading}>Annulla</Button>
                <Button className="flex-1 bg-blue-600 hover:bg-blue-500 text-white gap-2"
                  onClick={handleSaveEdit} disabled={editLoading || editPrefs.length === 0}
                  data-testid="confirm-edit">
                  <Check className="h-4 w-4" />
                  {editLoading ? "Salvataggio..." : "Salva"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
