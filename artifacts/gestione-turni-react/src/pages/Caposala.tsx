import { useEffect, useState } from "react";
import { Dipendente } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RoleBadge } from "@/components/ui/RoleBadge";
import {
  Check, CalendarRange, Calendar, ShieldAlert,
  UserPlus, Pencil, KeyRound, Phone, Users, Copy, Trash2,
  Sun, Sunset, BedDouble, ArrowLeftRight,
} from "lucide-react";

type Pref = "MATTINO" | "POMERIGGIO" | "NOTTE";
const PREF_OPTIONS: { key: Pref; label: string; icon: typeof Sun; color: string }[] = [
  { key: "MATTINO",    label: "Mattino",    icon: Sun,       color: "bg-amber-500/15 text-amber-300 border-amber-500/30"    },
  { key: "POMERIGGIO", label: "Pomeriggio", icon: Sunset,    color: "bg-orange-500/15 text-orange-300 border-orange-500/30" },
  { key: "NOTTE",      label: "Notte",      icon: BedDouble, color: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30" },
];

const CRYSTAL = "linear-gradient(155deg, #B8860B 0%, #FFBF00 38%, #FFE566 52%, #FFBF00 75%, #B8860B 100%)";

const RUOLI = ["OSS", "INFERMIERA", "AUSILIARIO", "CAPOSALA"] as const;

interface CreatedCreds {
  nome: string;
  ruolo: string;
}

export default function Caposala() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [genLoading, setGenLoading] = useState<"settimana" | "mese" | null>(null);
  const [scambiCount, setScambiCount] = useState(0);

  // Staff management state
  const [dipendenti, setDipendenti] = useState<Dipendente[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [nuovoNome, setNuovoNome] = useState("");
  const [nuovoRuolo, setNuovoRuolo] = useState("OSS");
  const [addLoading, setAddLoading] = useState(false);
  const [createdCreds, setCreatedCreds] = useState<CreatedCreds | null>(null);
  const [editDip, setEditDip] = useState<Dipendente | null>(null);
  const [editRuolo, setEditRuolo] = useState("");
  const [editPrefs, setEditPrefs] = useState<Pref[]>(["MATTINO", "POMERIGGIO", "NOTTE"]);
  const [editLoading, setEditLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Dipendente | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const fetchDipendenti = () =>
    fetch("/flask-api/api/dipendenti", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then(setDipendenti);

  const fetchScambiCount = () =>
    fetch("/flask-api/api/scambi/count", { credentials: "include" })
      .then((r) => r.ok ? r.json() : { count: 0 })
      .then((d) => setScambiCount(d.count ?? 0))
      .catch(() => {});

  useEffect(() => {
    fetchDipendenti();
    fetchScambiCount();
    const interval = setInterval(fetchScambiCount, 30_000);
    return () => clearInterval(interval);
  }, []);

  // ─── Generation ───
  const handleGenera = async (modalita: "settimana" | "mese") => {
    setGenLoading(modalita);
    const today = new Date().toISOString().split("T")[0];
    try {
      const res = await fetch("/flask-api/api/genera_programmazione", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ modalita, data_inizio: today }),
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

  // ─── Add dipendente ───
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
        setNuovoNome("");
        setNuovoRuolo("OSS");
        setShowAdd(false);
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

  // ─── Edit dipendente ───
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
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ ruolo: editRuolo }),
        }),
        fetch(`/flask-api/api/dipendenti/${editDip.id}/preferenze`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ preferenze: editPrefs }),
        }),
      ]);
      if (ruoloRes.ok && prefRes.ok) {
        const prefData = await prefRes.json();
        const riadattati: number = prefData.riadattati ?? 0;
        const tipiRimossi: string[] = prefData.tipi_rimossi ?? [];
        if (riadattati > 0 && tipiRimossi.length > 0) {
          toast({
            title: `${editDip.nome} aggiornato`,
            description: `${riadattati} turno/i futuri di tipo ${tipiRimossi.join(", ")} spostati automaticamente.`,
          });
        } else {
          toast({ title: `${editDip.nome} aggiornato` });
        }
        setEditDip(null);
        fetchDipendenti();
      } else {
        toast({ title: "Errore nel salvataggio", variant: "destructive" });
      }
    } finally {
      setEditLoading(false);
    }
  };

  // ─── Delete dipendente ───
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      const res = await fetch(`/flask-api/api/dipendenti/${deleteTarget.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        toast({
          title: `${deleteTarget.nome} rimosso`,
          description: "Tutti i turni e le richieste associate sono stati eliminati.",
        });
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

  // ─── Reset password ───
  const handleResetPw = async (d: Dipendente) => {
    const res = await fetch(`/flask-api/api/dipendenti/${d.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ password: "password123", password_changed: false }),
    });
    if (res.ok) {
      toast({ title: `Password di ${d.nome} reimpostata a "password123"` });
      fetchDipendenti();
    } else {
      toast({ title: "Errore reset password", variant: "destructive" });
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

  // Staff list: exclude DEV/Orlando from editable list for caposala (admin can see all)
  const staffVisibile = dipendenti.filter((d) => user?.is_admin ? true : !d.is_admin);

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="bg-yellow-950/40 border-b border-yellow-800/40 px-6 md:px-10 py-8">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-5">
          <div className="flex items-center gap-5">
            <div className="h-14 w-14 rounded-2xl bg-yellow-900/60 text-yellow-400 flex items-center justify-center shadow-sm">
              <ShieldAlert className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Area Caposala</h1>
              <p className="text-sm text-yellow-400 font-medium mt-0.5">Gestione turni e staff</p>
            </div>
          </div>

          {/* Badge notifiche scambi in attesa */}
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-white/5 border border-white/10">
            <div className="relative">
              <ArrowLeftRight className="h-5 w-5 text-muted-foreground" />
              {scambiCount > 0 && (
                <span className="absolute -top-2 -right-2 h-4 w-4 rounded-full bg-amber-500 text-[9px] font-black text-slate-900 flex items-center justify-center leading-none">
                  {scambiCount > 9 ? "9+" : scambiCount}
                </span>
              )}
            </div>
            <div>
              <p className="text-xs font-bold text-foreground leading-tight">
                {scambiCount === 0 ? "Nessuno" : scambiCount} scamb{scambiCount === 1 ? "io" : "i"}
              </p>
              <p className="text-[10px] text-muted-foreground leading-tight">in attesa</p>
            </div>
          </div>
        </div>
      </div>

      <div className="p-6 md:p-10 max-w-5xl mx-auto space-y-10">

        {/* ─── Auto-generate ─── */}
        <section>
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-4">Generazione Automatica Turni</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              onClick={() => handleGenera("settimana")}
              disabled={genLoading !== null}
              data-testid="btn-genera-settimana"
              className="group relative overflow-hidden rounded-2xl border border-blue-500/20 bg-blue-950/40 p-6 text-left transition-all hover:bg-blue-950/60 hover:border-blue-400/40 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="flex items-start gap-4">
                <div className="rounded-xl bg-blue-500 p-3 shadow-sm">
                  <CalendarRange className="h-6 w-6 text-white" />
                </div>
                <div>
                  <p className="font-bold text-foreground text-lg leading-tight">
                    {genLoading === "settimana" ? "Generazione..." : "Genera Turni Settimanali"}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">Pianifica i prossimi 7 giorni</p>
                </div>
              </div>
            </button>

            <button
              onClick={() => handleGenera("mese")}
              disabled={genLoading !== null}
              data-testid="btn-genera-mese"
              className="group relative overflow-hidden rounded-2xl border border-emerald-500/20 bg-emerald-950/40 p-6 text-left transition-all hover:bg-emerald-950/60 hover:border-emerald-400/40 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="flex items-start gap-4">
                <div className="rounded-xl bg-emerald-500 p-3 shadow-sm">
                  <Calendar className="h-6 w-6 text-white" />
                </div>
                <div>
                  <p className="font-bold text-foreground text-lg leading-tight">
                    {genLoading === "mese" ? "Generazione..." : "Genera Turni Mensili"}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">Pianifica i prossimi 30 giorni</p>
                </div>
              </div>
            </button>
          </div>
        </section>

        {/* ─── Staff management ─── */}
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
                    <div className="flex items-center gap-3 mt-0.5">
                      {d.telefono ? (
                        <span className="text-xs text-muted-foreground/60 flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          +39 {d.telefono}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground/30">Nessun telefono</span>
                      )}
                      {!d.password_changed && (
                        <span className="text-[9px] text-orange-400/80 bg-orange-500/10 border border-orange-500/20 px-1.5 py-0.5 rounded uppercase tracking-wide font-bold">
                          Primo accesso
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      title="Modifica ruolo"
                      onClick={() => openEdit(d)}
                      className="h-8 w-8 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                      data-testid={`edit-${d.id}`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      title="Reset password a password123"
                      onClick={() => handleResetPw(d)}
                      className="h-8 w-8 rounded-lg bg-white/5 hover:bg-amber-500/15 border border-white/10 hover:border-amber-500/30 flex items-center justify-center text-muted-foreground hover:text-amber-400 transition-colors"
                      data-testid={`reset-pw-${d.id}`}
                    >
                      <KeyRound className="h-3.5 w-3.5" />
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

      {/* ─── Add dipendente dialog ─── */}
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
              <Input
                value={nuovoNome}
                onChange={(e) => setNuovoNome(e.target.value)}
                placeholder="Es. Maria Rossi"
                required
                className="bg-black/20 border-white/10 focus:border-amber-400"
                data-testid="nuovo-nome"
              />
              <p className="text-[10px] text-muted-foreground/50">
                Il nome diventa anche lo <strong className="text-muted-foreground/70">username</strong> di accesso
              </p>
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

            {/* Credential preview */}
            <div className="rounded-xl bg-amber-500/8 border border-amber-500/20 p-3 space-y-1">
              <p className="text-[10px] text-amber-400/70 font-semibold uppercase tracking-wide">Credenziali di accesso iniziali</p>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Username:</span>
                <span className="font-mono text-foreground">{nuovoNome.trim() || "—"}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Password:</span>
                <span className="font-mono text-amber-300">password123</span>
              </div>
              <p className="text-[10px] text-muted-foreground/50 mt-1">Al primo accesso verrà richiesto di cambiarla</p>
            </div>

            <div className="flex gap-3">
              <Button type="button" variant="outline" className="flex-1 border-white/10 hover:bg-white/5" onClick={() => setShowAdd(false)}>
                Annulla
              </Button>
              <button
                type="submit"
                disabled={addLoading}
                className="flex-1 py-2 rounded-xl font-bold text-sm glow-gold disabled:opacity-50"
                style={{ background: CRYSTAL, color: "#0f172a" }}
                data-testid="confirm-aggiungi"
              >
                {addLoading ? "Salvataggio..." : "Aggiungi"}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ─── Created credentials dialog ─── */}
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
              <p className="text-sm text-muted-foreground">
                <strong className="text-foreground">{createdCreds.nome}</strong> è stato aggiunto come{" "}
                <strong className="text-foreground">{createdCreds.ruolo}</strong>.
              </p>

              <div className="rounded-xl bg-white/5 border border-white/10 overflow-hidden">
                <div className="px-4 py-2 border-b border-white/10 bg-white/3">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Credenziali di accesso</p>
                </div>
                <div className="p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">Username</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm text-foreground">{createdCreds.nome}</span>
                      <button
                        onClick={() => { navigator.clipboard.writeText(createdCreds.nome); toast({ title: "Copiato!" }); }}
                        className="text-muted-foreground/50 hover:text-muted-foreground"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">Password</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm text-amber-300">password123</span>
                      <button
                        onClick={() => { navigator.clipboard.writeText("password123"); toast({ title: "Copiato!" }); }}
                        className="text-muted-foreground/50 hover:text-muted-foreground"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <p className="text-xs text-muted-foreground/60">
                Al primo accesso il sistema chiederà di impostare una password personale e il numero di cellulare.
              </p>

              <Button className="w-full bg-emerald-600 hover:bg-emerald-500 text-white" onClick={() => setCreatedCreds(null)}>
                Perfetto
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Delete confirmation dialog ─── */}
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
                <Button
                  variant="outline"
                  className="flex-1 border-white/10 hover:bg-white/5"
                  onClick={() => setDeleteTarget(null)}
                  disabled={deleteLoading}
                >
                  Annulla
                </Button>
                <Button
                  className="flex-1 bg-red-600 hover:bg-red-500 text-white gap-2"
                  onClick={handleDelete}
                  disabled={deleteLoading}
                  data-testid="confirm-delete"
                >
                  <Trash2 className="h-4 w-4" />
                  {deleteLoading ? "Eliminazione..." : "Elimina"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Edit dipendente dialog ─── */}
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
                      <button
                        key={key}
                        type="button"
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
                <Button variant="outline" className="flex-1 border-white/10 hover:bg-white/5" onClick={() => setEditDip(null)} disabled={editLoading}>
                  Annulla
                </Button>
                <Button
                  className="flex-1 bg-blue-600 hover:bg-blue-500 text-white gap-2"
                  onClick={handleSaveEdit}
                  disabled={editLoading || editPrefs.length === 0}
                  data-testid="confirm-edit"
                >
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
