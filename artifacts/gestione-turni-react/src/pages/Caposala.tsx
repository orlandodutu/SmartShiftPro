import { useEffect, useRef, useState } from "react";
import { RichiestaScambio, Dipendente } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RoleBadge } from "@/components/ui/RoleBadge";
import { ShiftBadge } from "@/components/ui/ShiftBadge";
import {
  Check, X, CalendarRange, Calendar, ShieldAlert, ArrowLeftRight,
  MessageCircle, UserPlus, Pencil, KeyRound, Phone, Users, Copy, Trash2,
  Sun, Sunset, BedDouble,
} from "lucide-react";

type Pref = "MATTINO" | "POMERIGGIO" | "NOTTE";
const PREF_OPTIONS: { key: Pref; label: string; icon: typeof Sun; color: string }[] = [
  { key: "MATTINO",    label: "Mattino",    icon: Sun,       color: "bg-amber-500/15 text-amber-300 border-amber-500/30"    },
  { key: "POMERIGGIO", label: "Pomeriggio", icon: Sunset,    color: "bg-orange-500/15 text-orange-300 border-orange-500/30" },
  { key: "NOTTE",      label: "Notte",      icon: BedDouble, color: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30" },
];

const CRYSTAL = "linear-gradient(155deg, #B8860B 0%, #FFBF00 38%, #FFE566 52%, #FFBF00 75%, #B8860B 100%)";
const WA_GREEN = "linear-gradient(135deg, #128C7E, #25D366)";

const RUOLI = ["OSS", "INFERMIERA", "AUSILIARIO", "CAPOSALA"] as const;

interface ApprovedInfo {
  richiedente_nome: string;
  richiedente_telefono: string;
  destinatario_nome: string;
  destinatario_telefono: string;
}

interface CreatedCreds {
  nome: string;
  ruolo: string;
}

function waMsg(nome: string, altro: string) {
  return encodeURIComponent(
    `SmartShift Pro: Ciao ${nome}! Il cambio turno con ${altro} è stato approvato dalla Caposala. Buon lavoro! 🌟`
  );
}

export default function Caposala() {
  const { user } = useAuth();
  const { toast } = useToast();

  // Swap state
  const [richieste, setRichieste] = useState<RichiestaScambio[]>([]);
  const [loadingRichieste, setLoadingRichieste] = useState(true);
  const [genLoading, setGenLoading] = useState<"settimana" | "mese" | null>(null);
  const [activeRequest, setActiveRequest] = useState<RichiestaScambio | null>(null);
  const [notaCaposala, setNotaCaposala] = useState("");
  const [azione, setAzione] = useState<"approva" | "rifiuta">("approva");
  const [actionLoading, setActionLoading] = useState(false);
  const [approvedInfo, setApprovedInfo] = useState<ApprovedInfo | null>(null);

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
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchRichieste = async () => {
    setLoadingRichieste(true);
    try {
      const res = await fetch("/flask-api/api/scambi?stato=IN_ATTESA", { credentials: "include" });
      if (res.ok) setRichieste(await res.json());
    } finally {
      setLoadingRichieste(false);
    }
  };

  const fetchDipendenti = () =>
    fetch("/flask-api/api/dipendenti", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then(setDipendenti);

  useEffect(() => {
    fetchRichieste();
    fetchDipendenti();
    /* Polling ogni 5s per aggiornamento in tempo reale */
    pollingRef.current = setInterval(fetchRichieste, 5_000);
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
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

  // ─── Swap approval ───
  const openAction = (r: RichiestaScambio, a: "approva" | "rifiuta") => {
    setActiveRequest(r);
    setAzione(a);
    setNotaCaposala("");
  };

  const handleConfirm = async () => {
    if (!activeRequest) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/flask-api/api/scambi/${activeRequest.id}/approva`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ azione, nota_caposala: notaCaposala }),
      });
      if (res.ok) {
        toast({
          title: azione === "approva" ? "Scambio approvato" : "Scambio rifiutato",
          description:
            azione === "approva"
              ? `Approvato tra ${activeRequest.richiedente_nome} e ${activeRequest.destinatario_nome}`
              : `Rifiutata la richiesta di ${activeRequest.richiedente_nome}`,
        });
        if (azione === "approva") {
          const richDip = dipendenti.find((d) => d.id === activeRequest.richiedente_id);
          const destDip = dipendenti.find((d) => d.id === activeRequest.destinatario_id);
          setApprovedInfo({
            richiedente_nome: activeRequest.richiedente_nome,
            richiedente_telefono: richDip?.telefono || "",
            destinatario_nome: activeRequest.destinatario_nome,
            destinatario_telefono: destDip?.telefono || "",
          });
        }
        setActiveRequest(null);
        fetchRichieste();
      } else {
        toast({ title: "Errore", variant: "destructive" });
      }
    } finally {
      setActionLoading(false);
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
        <div className="max-w-5xl mx-auto flex items-center gap-5">
          <div className="h-14 w-14 rounded-2xl bg-yellow-900/60 text-yellow-400 flex items-center justify-center shadow-sm">
            <ShieldAlert className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Area Caposala</h1>
            <p className="text-sm text-yellow-400 font-medium mt-0.5">Gestione turni, scambi e staff</p>
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

        {/* ─── Swap requests ─── */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Richieste Scambio in Attesa</h2>
            <span className="text-sm font-bold text-foreground bg-white/5 border border-white/10 px-3 py-0.5 rounded-full">
              {loadingRichieste ? "—" : richieste.length}
            </span>
          </div>

          <div className="space-y-4">
            {loadingRichieste ? (
              <p className="text-sm text-muted-foreground text-center py-10">Caricamento...</p>
            ) : richieste.length === 0 ? (
              <div className="glass rounded-2xl border border-white/8 p-10 text-center">
                <ArrowLeftRight className="h-8 w-8 text-muted-foreground/20 mx-auto mb-3" />
                <p className="text-muted-foreground font-medium">Nessuna richiesta in sospeso</p>
                <p className="text-sm text-muted-foreground/50 mt-1">Tutte le richieste sono state gestite</p>
              </div>
            ) : (
              richieste.map((r) => (
                <Card key={r.id} className="glass border-white/8 shadow-none overflow-hidden">
                  <CardContent className="p-0">
                    <div className="p-6 flex flex-col md:flex-row gap-6">
                      <div className="flex-1 space-y-4 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-foreground">{r.richiedente_nome}</span>
                          <RoleBadge role={r.richiedente_ruolo} />
                          <ArrowLeftRight className="h-4 w-4 text-muted-foreground/50 shrink-0" />
                          <span className="font-semibold text-foreground">{r.destinatario_nome}</span>
                          <RoleBadge role={r.destinatario_ruolo} />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="rounded-xl bg-white/4 border border-white/8 p-3">
                            <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide mb-2">Turno ceduto</p>
                            {r.turno_richiedente ? (
                              <div className="flex items-center gap-2 flex-wrap">
                                <ShiftBadge type={r.turno_richiedente.tipo} />
                                <span className="text-sm font-medium text-foreground">
                                  {new Date(r.turno_richiedente.data + "T00:00:00").toLocaleDateString("it-IT", { day: "numeric", month: "short" })}
                                </span>
                              </div>
                            ) : <span className="text-sm text-muted-foreground">Non specificato</span>}
                          </div>
                          {r.turno_destinatario && (
                            <div className="rounded-xl bg-white/4 border border-white/8 p-3">
                              <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide mb-2">Turno ricevuto</p>
                              <div className="flex items-center gap-2 flex-wrap">
                                <ShiftBadge type={r.turno_destinatario.tipo} />
                                <span className="text-sm font-medium text-foreground">
                                  {new Date(r.turno_destinatario.data + "T00:00:00").toLocaleDateString("it-IT", { day: "numeric", month: "short" })}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>

                        {r.nota && (
                          <p className="text-sm text-amber-300/80 bg-amber-500/8 border border-amber-500/15 rounded-lg px-3 py-2">
                            <span className="font-semibold">Motivazione:</span> {r.nota}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground/50">
                          Richiesta il {new Date(r.creata_il).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })}
                        </p>
                      </div>

                      <div className="flex flex-row md:flex-col gap-3 md:w-32 shrink-0 md:justify-center">
                        <Button
                          size="lg"
                          className="flex-1 md:flex-none md:w-full bg-emerald-600 hover:bg-emerald-500 text-white gap-2 py-5 rounded-xl font-bold"
                          onClick={() => openAction(r, "approva")}
                          data-testid={`approva-${r.id}`}
                        >
                          <Check className="h-5 w-5" />
                          Approva
                        </Button>
                        <Button
                          size="lg"
                          variant="outline"
                          className="flex-1 md:flex-none md:w-full border-2 border-red-500/30 text-red-400 hover:bg-red-500/10 hover:border-red-400/50 gap-2 py-5 rounded-xl font-bold"
                          onClick={() => openAction(r, "rifiuta")}
                          data-testid={`rifiuta-${r.id}`}
                        >
                          <X className="h-5 w-5" />
                          Rifiuta
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
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

      {/* ─── Swap confirmation dialog ─── */}
      <Dialog open={!!activeRequest} onOpenChange={(open) => !open && setActiveRequest(null)}>
        <DialogContent className="glass-strong border-white/10 max-w-md">
          <DialogHeader>
            <DialogTitle className={`flex items-center gap-2 ${azione === "approva" ? "text-emerald-400" : "text-red-400"}`}>
              {azione === "approva"
                ? <><Check className="h-5 w-5" /> Conferma Approvazione</>
                : <><X className="h-5 w-5" /> Conferma Rifiuto</>}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {activeRequest && (
              <div className="rounded-xl bg-white/5 border border-white/8 p-3 text-sm text-muted-foreground">
                Scambio tra <strong className="text-foreground">{activeRequest.richiedente_nome}</strong> e{" "}
                <strong className="text-foreground">{activeRequest.destinatario_nome}</strong>
              </div>
            )}
            <div className="space-y-2">
              <Label className="text-muted-foreground">
                Nota per lo staff <span className="text-muted-foreground/50 font-normal">(opzionale)</span>
              </Label>
              <Textarea
                placeholder={azione === "approva" ? "Es. Ricordate di coprire la mattina..." : "Es. Non è possibile per mancanza di copertura..."}
                value={notaCaposala}
                onChange={(e) => setNotaCaposala(e.target.value)}
                rows={3}
                className="border-white/10 bg-white/5 resize-none"
                data-testid="caposala-note"
              />
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1 border-white/10 hover:bg-white/5" onClick={() => setActiveRequest(null)} disabled={actionLoading}>
                Annulla
              </Button>
              <Button
                className={`flex-1 gap-2 ${azione === "approva" ? "bg-emerald-600 hover:bg-emerald-500" : "bg-red-600 hover:bg-red-500"} text-white`}
                onClick={handleConfirm}
                disabled={actionLoading}
                data-testid="confirm-action"
              >
                {azione === "approva" ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                {actionLoading ? "..." : azione === "approva" ? "Approva" : "Rifiuta"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── WhatsApp post-approval dialog ─── */}
      <Dialog open={!!approvedInfo} onOpenChange={(open) => !open && setApprovedInfo(null)}>
        <DialogContent className="glass-strong border-white/10 max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-400">
              <Check className="h-5 w-5" />
              Scambio Approvato!
            </DialogTitle>
          </DialogHeader>
          {approvedInfo && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Notifica i dipendenti via WhatsApp:</p>

              {approvedInfo.richiedente_telefono ? (
                <a
                  href={`https://wa.me/39${approvedInfo.richiedente_telefono}?text=${waMsg(approvedInfo.richiedente_nome, approvedInfo.destinatario_nome)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-xl font-semibold text-sm text-white"
                  style={{ background: WA_GREEN }}
                >
                  <MessageCircle className="h-4 w-4" />
                  WhatsApp a {approvedInfo.richiedente_nome}
                </a>
              ) : (
                <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm text-muted-foreground border border-white/10 bg-white/5">
                  <MessageCircle className="h-4 w-4" />
                  {approvedInfo.richiedente_nome} — nessun numero
                </div>
              )}

              {approvedInfo.destinatario_telefono ? (
                <a
                  href={`https://wa.me/39${approvedInfo.destinatario_telefono}?text=${waMsg(approvedInfo.destinatario_nome, approvedInfo.richiedente_nome)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-xl font-semibold text-sm text-white"
                  style={{ background: WA_GREEN }}
                >
                  <MessageCircle className="h-4 w-4" />
                  WhatsApp a {approvedInfo.destinatario_nome}
                </a>
              ) : (
                <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm text-muted-foreground border border-white/10 bg-white/5">
                  <MessageCircle className="h-4 w-4" />
                  {approvedInfo.destinatario_nome} — nessun numero
                </div>
              )}

              <Button variant="outline" className="w-full border-white/10 hover:bg-white/5 mt-2" onClick={() => setApprovedInfo(null)}>
                Chiudi
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

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
