import { useEffect, useState } from "react";
import { RichiestaScambio, Dipendente } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RoleBadge } from "@/components/ui/RoleBadge";
import { ShiftBadge } from "@/components/ui/ShiftBadge";
import { Check, X, CalendarRange, Calendar, ShieldAlert, ArrowLeftRight, MessageCircle } from "lucide-react";

const CRYSTAL = "linear-gradient(155deg, #B8860B 0%, #FFBF00 38%, #FFE566 52%, #FFBF00 75%, #B8860B 100%)";
const WA_GREEN = "linear-gradient(135deg, #128C7E, #25D366)";

interface ApprovedInfo {
  richiedente_nome: string;
  richiedente_telefono: string;
  destinatario_nome: string;
  destinatario_telefono: string;
}

function waMsg(nome: string, altro: string) {
  return encodeURIComponent(
    `SmartShift Pro: Ciao ${nome}! Il cambio turno con ${altro} è stato approvato dalla Caposala. Buon lavoro! 🌟`
  );
}

export default function Caposala() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [richieste, setRichieste] = useState<RichiestaScambio[]>([]);
  const [dipendenti, setDipendenti] = useState<Dipendente[]>([]);
  const [loading, setLoading] = useState(true);
  const [genLoading, setGenLoading] = useState<"settimana" | "mese" | null>(null);

  const [activeRequest, setActiveRequest] = useState<RichiestaScambio | null>(null);
  const [notaCaposala, setNotaCaposala] = useState("");
  const [azione, setAzione] = useState<"approva" | "rifiuta">("approva");
  const [actionLoading, setActionLoading] = useState(false);
  const [approvedInfo, setApprovedInfo] = useState<ApprovedInfo | null>(null);

  const fetchRichieste = async () => {
    try {
      const res = await fetch("/flask-api/api/scambi?stato=IN_ATTESA", { credentials: "include" });
      if (res.ok) setRichieste(await res.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRichieste();
    fetch("/flask-api/api/dipendenti", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then(setDipendenti);
  }, []);

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

  return (
    <div className="min-h-screen">
      <div className="bg-yellow-950/40 border-b border-yellow-800/40 px-6 md:px-10 py-8">
        <div className="max-w-5xl mx-auto flex items-center gap-5">
          <div className="h-14 w-14 rounded-2xl bg-yellow-900/60 text-yellow-400 flex items-center justify-center shadow-sm">
            <ShieldAlert className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Area Caposala</h1>
            <p className="text-sm text-yellow-400 font-medium mt-0.5">Gestione turni e approvazione scambi</p>
          </div>
        </div>
      </div>

      <div className="p-6 md:p-10 max-w-5xl mx-auto space-y-10">
        {/* Auto-generate */}
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

        {/* Swap requests */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Richieste in Attesa</h2>
            <span className="text-sm font-bold text-foreground bg-white/5 border border-white/10 px-3 py-0.5 rounded-full">
              {loading ? "—" : richieste.length}
            </span>
          </div>

          <div className="space-y-4">
            {loading ? (
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
      </div>

      {/* Confirmation Dialog */}
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
                Scambio tra <strong className="text-foreground">{activeRequest.richiedente_nome}</strong> e <strong className="text-foreground">{activeRequest.destinatario_nome}</strong>
              </div>
            )}
            <div className="space-y-2">
              <Label className="text-muted-foreground">Nota per lo staff <span className="text-muted-foreground/50 font-normal">(opzionale)</span></Label>
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

      {/* WhatsApp post-approval dialog */}
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
              <p className="text-sm text-muted-foreground">
                Notifica i dipendenti via WhatsApp:
              </p>

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

              <Button
                variant="outline"
                className="w-full border-white/10 hover:bg-white/5 mt-2"
                onClick={() => setApprovedInfo(null)}
              >
                Chiudi
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
