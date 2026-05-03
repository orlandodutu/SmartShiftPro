import { useEffect, useState } from "react";
import { RichiestaScambio } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RoleBadge } from "@/components/ui/RoleBadge";
import { ShiftBadge } from "@/components/ui/ShiftBadge";
import { Check, X, CalendarRange, Calendar, ShieldAlert, ArrowLeftRight } from "lucide-react";

export default function Caposala() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [richieste, setRichieste] = useState<RichiestaScambio[]>([]);
  const [loading, setLoading] = useState(true);
  const [genLoading, setGenLoading] = useState<"settimana" | "mese" | null>(null);

  const [activeRequest, setActiveRequest] = useState<RichiestaScambio | null>(null);
  const [notaCaposala, setNotaCaposala] = useState("");
  const [azione, setAzione] = useState<"approva" | "rifiuta">("approva");
  const [actionLoading, setActionLoading] = useState(false);

  const fetchRichieste = async () => {
    try {
      const res = await fetch("/flask-api/api/scambi?stato=IN_ATTESA", { credentials: "include" });
      if (res.ok) setRichieste(await res.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRichieste(); }, []);

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
          title: `Turni generati con successo`,
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
          description: azione === "approva"
            ? `Lo scambio tra ${activeRequest.richiedente_nome} e ${activeRequest.destinatario_nome} è stato approvato.`
            : `La richiesta di ${activeRequest.richiedente_nome} è stata rifiutata.`,
        });
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
          <ShieldAlert className="h-12 w-12 text-red-400 mx-auto" />
          <p className="text-lg font-semibold text-gray-700">Accesso negato</p>
          <p className="text-sm text-gray-400">Quest'area è riservata alla Caposala.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Pale gold hero header */}
      <div className="bg-yellow-50 border-b border-yellow-200 px-6 md:px-10 py-8">
        <div className="max-w-5xl mx-auto flex items-center gap-5">
          <div className="h-14 w-14 rounded-2xl bg-yellow-100 text-yellow-700 flex items-center justify-center shadow-sm">
            <ShieldAlert className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Area Caposala</h1>
            <p className="text-sm text-yellow-700 font-medium mt-0.5">Gestione turni e approvazione scambi</p>
          </div>
        </div>
      </div>

      <div className="p-6 md:p-10 max-w-5xl mx-auto space-y-10">

        {/* Auto-generate section */}
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-widest mb-4">Generazione Automatica Turni</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              onClick={() => handleGenera("settimana")}
              disabled={genLoading !== null}
              data-testid="btn-genera-settimana"
              className="group relative overflow-hidden rounded-2xl border-2 border-blue-200 bg-gradient-to-br from-blue-50 to-blue-100 p-6 text-left shadow-sm transition-all hover:shadow-md hover:border-blue-300 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <div className="flex items-start gap-4">
                <div className="rounded-xl bg-blue-500 p-3 shadow-sm">
                  <CalendarRange className="h-6 w-6 text-white" />
                </div>
                <div>
                  <p className="font-bold text-gray-900 text-lg leading-tight">
                    {genLoading === "settimana" ? "Generazione..." : "Genera Turni Settimanali"}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">Pianifica i prossimi 7 giorni a partire da oggi</p>
                </div>
              </div>
            </button>

            <button
              onClick={() => handleGenera("mese")}
              disabled={genLoading !== null}
              data-testid="btn-genera-mese"
              className="group relative overflow-hidden rounded-2xl border-2 border-emerald-200 bg-gradient-to-br from-emerald-50 to-emerald-100 p-6 text-left shadow-sm transition-all hover:shadow-md hover:border-emerald-300 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <div className="flex items-start gap-4">
                <div className="rounded-xl bg-emerald-500 p-3 shadow-sm">
                  <Calendar className="h-6 w-6 text-white" />
                </div>
                <div>
                  <p className="font-bold text-gray-900 text-lg leading-tight">
                    {genLoading === "mese" ? "Generazione..." : "Genera Turni Mensili"}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">Pianifica i prossimi 30 giorni a partire da oggi</p>
                </div>
              </div>
            </button>
          </div>
        </section>

        {/* Swap requests section */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-widest">Richieste di Scambio in Attesa</h2>
            <span className="text-sm font-semibold text-gray-700 bg-gray-100 px-3 py-0.5 rounded-full">
              {loading ? "—" : richieste.length}
            </span>
          </div>

          <div className="space-y-4">
            {loading ? (
              <p className="text-sm text-gray-400 text-center py-8">Caricamento...</p>
            ) : richieste.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 p-10 text-center">
                <ArrowLeftRight className="h-8 w-8 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-400 font-medium">Nessuna richiesta in sospeso</p>
                <p className="text-sm text-gray-300 mt-1">Tutte le richieste sono state gestite</p>
              </div>
            ) : (
              richieste.map((r) => (
                <Card key={r.id} className="shadow-sm overflow-hidden">
                  <CardContent className="p-0">
                    <div className="p-6 flex flex-col md:flex-row gap-6">
                      {/* Request info */}
                      <div className="flex-1 space-y-4 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-gray-900">{r.richiedente_nome}</span>
                          <RoleBadge role={r.richiedente_ruolo} />
                          <ArrowLeftRight className="h-4 w-4 text-gray-400 shrink-0" />
                          <span className="font-semibold text-gray-900">{r.destinatario_nome}</span>
                          <RoleBadge role={r.destinatario_ruolo} />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="rounded-xl bg-gray-50 border border-gray-100 p-3">
                            <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-2">Turno ceduto</p>
                            {r.turno_richiedente ? (
                              <div className="flex items-center gap-2 flex-wrap">
                                <ShiftBadge type={r.turno_richiedente.tipo} />
                                <span className="text-sm font-medium text-gray-700">
                                  {new Date(r.turno_richiedente.data + "T00:00:00").toLocaleDateString("it-IT", { day: "numeric", month: "short" })}
                                </span>
                              </div>
                            ) : <span className="text-sm text-gray-400">Non specificato</span>}
                          </div>
                          {r.turno_destinatario && (
                            <div className="rounded-xl bg-gray-50 border border-gray-100 p-3">
                              <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-2">Turno ricevuto</p>
                              <div className="flex items-center gap-2 flex-wrap">
                                <ShiftBadge type={r.turno_destinatario.tipo} />
                                <span className="text-sm font-medium text-gray-700">
                                  {new Date(r.turno_destinatario.data + "T00:00:00").toLocaleDateString("it-IT", { day: "numeric", month: "short" })}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>

                        {r.nota && (
                          <p className="text-sm text-gray-600 bg-yellow-50 border border-yellow-100 rounded-lg px-3 py-2">
                            <span className="font-medium text-yellow-700">Motivazione:</span> {r.nota}
                          </p>
                        )}

                        <p className="text-xs text-gray-400">
                          Richiesta il {new Date(r.creata_il).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })}
                        </p>
                      </div>

                      {/* Big action buttons */}
                      <div className="flex flex-row md:flex-col gap-3 md:w-36 shrink-0 md:justify-center">
                        <Button
                          size="lg"
                          className="flex-1 md:flex-none md:w-full bg-emerald-600 hover:bg-emerald-700 text-white gap-2 py-5 rounded-xl shadow-sm font-semibold"
                          onClick={() => openAction(r, "approva")}
                          data-testid={`approva-${r.id}`}
                        >
                          <Check className="h-5 w-5" />
                          Approva
                        </Button>
                        <Button
                          size="lg"
                          variant="outline"
                          className="flex-1 md:flex-none md:w-full border-2 border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 gap-2 py-5 rounded-xl font-semibold"
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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className={`flex items-center gap-2 ${azione === "approva" ? "text-emerald-700" : "text-red-600"}`}>
              {azione === "approva"
                ? <><Check className="h-5 w-5" /> Conferma Approvazione</>
                : <><X className="h-5 w-5" /> Conferma Rifiuto</>
              }
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {activeRequest && (
              <div className="rounded-xl bg-gray-50 border p-3 text-sm text-gray-600">
                Scambio tra <strong>{activeRequest.richiedente_nome}</strong> e <strong>{activeRequest.destinatario_nome}</strong>
              </div>
            )}

            <div className="space-y-2">
              <Label>Nota per lo staff <span className="text-gray-400 font-normal">(opzionale)</span></Label>
              <Textarea
                placeholder={azione === "approva" ? "Es. Ricordate di coprire la mattina..." : "Es. Non è possibile per mancanza di copertura..."}
                value={notaCaposala}
                onChange={(e) => setNotaCaposala(e.target.value)}
                rows={3}
                data-testid="caposala-note"
              />
            </div>

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setActiveRequest(null)} disabled={actionLoading}>
                Annulla
              </Button>
              <Button
                className={`flex-1 gap-2 ${azione === "approva" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"} text-white`}
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
    </div>
  );
}
