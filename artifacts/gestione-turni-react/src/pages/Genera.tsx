import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Wand2, CheckCircle2, CalendarDays, Lock, RotateCcw, AlertTriangle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type Modalita = "settimana" | "mese" | "giorno";

export default function Genera() {
  const { user } = useAuth();
  const { toast } = useToast();

  if (!user?.is_admin && user?.ruolo !== "CAPOSALA") {
    return (
      <div className="p-10 flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
        <div className="p-4 bg-red-500/10 rounded-2xl">
          <Lock className="h-8 w-8 text-red-400" />
        </div>
        <p className="text-lg font-semibold text-foreground">Accesso non autorizzato</p>
        <p className="text-sm text-muted-foreground">Questa sezione è riservata ad Admin e Caposala.</p>
      </div>
    );
  }

  const canManage = user?.is_admin || user?.ruolo === "CAPOSALA";
  const today = new Date().toISOString().split("T")[0];

  const [loading, setLoading] = useState(false);
  const [modalita, setModalita] = useState<Modalita>("settimana");
  const [dataInizio, setDataInizio] = useState(today);
  const [result, setResult] = useState<{ generati: number; saltati: number; giorni: number; modalita: string } | null>(null);

  const currentMese = new Date().toISOString().substring(0, 7);

  /* ── Reset mese corrente ── */
  const [resetOpen, setResetOpen] = useState(false);
  const [resetInput, setResetInput] = useState("");
  const [resetLoading, setResetLoading] = useState(false);

  /* ── Cancella periodo personalizzato ── */
  const [periodoOpen, setPeriodoOpen] = useState(false);
  const [periodoInizio, setPeriodoInizio] = useState(today);
  const [periodoFine, setPeriodoFine] = useState(today);
  const [periodoLoading, setPeriodoLoading] = useState(false);
  const [periodoConfirm, setPeriodoConfirm] = useState("");

  const openCancellaGiorno = () => {
    setPeriodoInizio(dataInizio);
    setPeriodoFine(dataInizio);
    setPeriodoConfirm("");
    setPeriodoOpen(true);
  };

  const openCancellaSettimana = () => {
    const start = new Date(dataInizio + "T00:00:00");
    const day = start.getDay();
    start.setDate(start.getDate() + (day === 0 ? -6 : 1 - day));
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    setPeriodoInizio(start.toISOString().split("T")[0]);
    setPeriodoFine(end.toISOString().split("T")[0]);
    setPeriodoConfirm("");
    setPeriodoOpen(true);
  };

  const handleGenera = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);

    const endpoint = modalita === "giorno"
      ? "/flask-api/api/turni/genera_giorno"
      : "/flask-api/api/turni/genera";

    const body = modalita === "giorno"
      ? { data: dataInizio }
      : { modalita, data_inizio: dataInizio };

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include",
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setResult(data);
        toast({ title: `Generazione completata — ${data.generati} turni creati` });
      } else {
        toast({ title: data.errore || "Errore", variant: "destructive" });
      }
    } catch {
      toast({ title: "Errore di connessione", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    if (resetInput !== currentMese) {
      toast({ title: `Digita "${currentMese}" per confermare`, variant: "destructive" });
      return;
    }
    setResetLoading(true);
    try {
      const res = await fetch("/flask-api/api/turni/reset_mese", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ mese: currentMese }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast({ title: `${data.eliminati} turni auto-generati eliminati per ${currentMese}` });
        setResetOpen(false);
        setResetInput("");
        setResult(null);
      } else {
        toast({ title: data.errore || "Errore", variant: "destructive" });
      }
    } catch {
      toast({ title: "Errore di connessione", variant: "destructive" });
    } finally {
      setResetLoading(false);
    }
  };

  const handleCancellaPeriodo = async () => {
    setPeriodoLoading(true);
    try {
      const res = await fetch("/flask-api/api/turni/cancella_periodo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ data_inizio: periodoInizio, data_fine: periodoFine }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast({ title: `${data.eliminati} turni eliminati dal ${periodoInizio} al ${periodoFine}` });
        setPeriodoOpen(false);
        setPeriodoConfirm("");
        setResult(null);
      } else {
        toast({ title: data.errore || "Errore", variant: "destructive" });
      }
    } catch {
      toast({ title: "Errore di connessione", variant: "destructive" });
    } finally {
      setPeriodoLoading(false);
    }
  };

  const MODALITA_LABELS: Record<Modalita, string> = {
    settimana: "1 Settimana (7 giorni)",
    mese: "1 Mese (30 giorni)",
    giorno: "Giorno Singolo",
  };

  return (
    <div className="p-6 md:p-10 max-w-3xl mx-auto space-y-8">
      <div className="flex items-center gap-4">
        <div className="p-3 bg-amber-500/15 text-amber-400 rounded-2xl">
          <Wand2 className="h-7 w-7" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Genera Turni</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Creazione automatica dei turni per lo staff</p>
        </div>
      </div>

      {/* Rules summary */}
      <div className="rounded-2xl bg-white/3 border border-white/8 p-5 space-y-3">
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Regole di Generazione</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-muted-foreground">
          <div className="flex gap-2"><span className="text-amber-400 font-bold shrink-0">Admin</span> Fisso Mattino 07:00–14:00, riposo Dom</div>
          <div className="flex gap-2"><span className="text-emerald-400 font-bold shrink-0">INF</span> Solo Mattino 07:00–14:00, riposo Sab/Dom alternati</div>
          <div className="flex gap-2"><span className="text-blue-400 font-bold shrink-0">OSS</span> Min 3 mattino (07–14), 3 pomeriggio (14–21), 1 notte</div>
          <div className="flex gap-2"><span className="text-amber-300 font-bold shrink-0">AUS</span> 07:00–14:00 (7h), separati da OSS, min 1/giorno</div>
          <div className="flex gap-2 md:col-span-2"><span className="text-violet-400 font-bold shrink-0">Notte→Smonto→Riposo</span> Catena automatica post-notte. Doppie consentite: Mat+Notte o Pom+Notte</div>
          <div className="flex gap-2 md:col-span-2">
            <Lock className="h-3 w-3 text-amber-400 shrink-0 mt-0.5" />
            <span>I turni modificati manualmente (🔒) non vengono mai sovrascritti. Max 2 OSS a riposo/giorno.</span>
          </div>
        </div>
      </div>

      {/* Generate form */}
      <Card className="glass border-white/8 shadow-none">
        <CardHeader>
          <CardTitle className="text-foreground">Parametri di Generazione</CardTitle>
          <CardDescription className="text-muted-foreground">
            I turni esistenti vengono saltati; i bloccati (🔒) rimangono invariati. Cancella il periodo prima di rigenerare.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleGenera} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label className="text-muted-foreground">Modalità</Label>
                <Select value={modalita} onValueChange={(v) => setModalita(v as Modalita)}>
                  <SelectTrigger className="border-white/10 bg-white/5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="giorno">
                      <span className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-amber-400" />Giorno Singolo</span>
                    </SelectItem>
                    <SelectItem value="settimana">1 Settimana (7 giorni)</SelectItem>
                    <SelectItem value="mese">1 Mese (30 giorni)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground">
                  {modalita === "giorno" ? "Data" : "Data Inizio"}
                </Label>
                <Input type="date" value={dataInizio} onChange={(e) => setDataInizio(e.target.value)}
                  required className="border-white/10 bg-white/5" />
              </div>
            </div>

            {modalita === "giorno" && (
              <div className="rounded-xl bg-amber-500/8 border border-amber-500/20 p-3 text-xs text-amber-300 flex gap-2">
                <CalendarDays className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  Generazione per <strong>un solo giorno</strong>. L'algoritmo considera i turni precedenti
                  (chi ha fatto Notte ieri riceve automaticamente Smonto oggi).
                </span>
              </div>
            )}

            <button type="submit" disabled={loading}
              className="w-full py-3 rounded-xl font-bold text-sm uppercase tracking-wide glow-gold transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              style={{ background: "linear-gradient(155deg, #B8860B 0%, #FFBF00 38%, #FFE566 52%, #FFBF00 75%, #B8860B 100%)", color: "#0f172a" }}
              data-testid="btn-genera">
              <Wand2 className="h-4 w-4" />
              {loading ? "Generazione in corso..." : `Genera ${MODALITA_LABELS[modalita]}`}
            </button>
          </form>

          {result && (
            <div className="mt-8 pt-6 border-t border-white/8">
              <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/20 p-5 flex gap-4 items-start">
                <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-emerald-400 mb-1">Riepilogo Generazione</p>
                  <p className="text-sm text-emerald-300/80">
                    Creati <span className="font-black text-emerald-300">{result.generati}</span> turni
                    su <span className="font-bold">{result.giorni}</span> {result.giorni === 1 ? "giorno" : "giorni"}.
                  </p>
                  {result.saltati > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {result.saltati} turni saltati (già esistenti o bloccati).
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Cancella Periodo (Admin + Caposala) ── */}
      {canManage && (
        <div className="rounded-2xl border border-orange-500/20 bg-orange-500/4 p-5 space-y-3">
          <p className="text-xs font-bold text-orange-400/80 uppercase tracking-wide flex items-center gap-2">
            <Trash2 className="h-3.5 w-3.5" />Cancella Turni per Periodo
          </p>
          <div className="flex items-start gap-4 flex-wrap">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">Elimina i turni di un periodo specifico</p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Cancella tutti i turni <strong className="text-foreground">auto-generati</strong> tra due date a scelta.
                I turni manuali 🔒 vengono preservati. Usa per ricalcolare una settimana o un periodo sbagliato.
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button
                variant="outline"
                onClick={openCancellaGiorno}
                className="shrink-0 border-orange-500/30 text-orange-400 hover:bg-orange-500/10 min-h-[44px]">
                <Trash2 className="h-4 w-4 mr-2" />Giorno
              </Button>
              <Button
                variant="outline"
                onClick={openCancellaSettimana}
                className="shrink-0 border-orange-500/30 text-orange-400 hover:bg-orange-500/10 min-h-[44px]">
                <CalendarDays className="h-4 w-4 mr-2" />Settimana
              </Button>
              <Button
                variant="outline"
                onClick={() => { setPeriodoOpen(true); setPeriodoInizio(today); setPeriodoFine(today); setPeriodoConfirm(""); }}
                className="shrink-0 border-orange-500/30 text-orange-400 hover:bg-orange-500/10 min-h-[44px]">
                <Trash2 className="h-4 w-4 mr-2" />Periodo
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reset mese corrente (Admin + Caposala) ── */}
      {canManage && (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/4 p-5 space-y-3">
          <p className="text-xs font-bold text-red-400/80 uppercase tracking-wide flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5" />Reset Mese Corrente
          </p>
          <div className="flex items-start gap-4 flex-wrap">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">Nuova Generazione — Reset Mese</p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Elimina tutti i turni <strong className="text-foreground">auto-generati</strong> del mese corrente
                (<span className="font-mono text-amber-400/70">{currentMese}</span>).
                I turni manuali 🔒 vengono preservati. Usa per ricalcolare il mese da zero.
              </p>
            </div>
            <button
              onClick={() => setResetOpen(true)}
              className="shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border border-red-500/30 text-red-400 hover:bg-red-500/10 active:bg-red-500/15 transition-all min-h-[44px]">
              <RotateCcw className="h-4 w-4" />Reset Mese
            </button>
          </div>
        </div>
      )}

      {/* ── Cancella Periodo Dialog ── */}
      <Dialog open={periodoOpen} onOpenChange={(open) => { if (!open && !periodoLoading) { setPeriodoOpen(false); setPeriodoConfirm(""); } }}>
        <DialogContent className="glass-strong border-white/10 max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-orange-400">
              <Trash2 className="h-4 w-4" />Cancella Turni — Periodo
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground leading-relaxed">
              Verranno eliminati tutti i turni <strong className="text-foreground">auto-generati</strong> nel periodo selezionato.
              I turni manuali 🔒 saranno mantenuti.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Dal</Label>
                <Input type="date" value={periodoInizio}
                  onChange={(e) => setPeriodoInizio(e.target.value)}
                  className="border-white/10 bg-white/5" disabled={periodoLoading} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Al</Label>
                <Input type="date" value={periodoFine}
                  onChange={(e) => setPeriodoFine(e.target.value)}
                  min={periodoInizio}
                  className="border-white/10 bg-white/5" disabled={periodoLoading} />
              </div>
            </div>
            <div className="rounded-xl bg-orange-500/8 border border-orange-500/20 p-3">
              <p className="text-xs text-orange-300">
                Digita <strong className="font-mono">CANCELLA</strong> per sbloccare la conferma
              </p>
            </div>
            <Input
              value={periodoConfirm}
              onChange={(e) => setPeriodoConfirm(e.target.value)}
              placeholder="CANCELLA"
              className="border-white/10 bg-white/5 font-mono text-center tracking-widest"
              disabled={periodoLoading}
            />
            <div className="flex gap-3 pt-1">
              <button
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-white/10 text-muted-foreground hover:bg-white/5 transition-all min-h-[44px]"
                onClick={() => { setPeriodoOpen(false); setPeriodoConfirm(""); }}
                disabled={periodoLoading}>
                Annulla
              </button>
              <button
                disabled={periodoConfirm !== "CANCELLA" || periodoLoading || !periodoInizio || !periodoFine}
                onClick={handleCancellaPeriodo}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold border border-orange-500/30 text-orange-400 hover:bg-orange-500/10 transition-all disabled:opacity-35 disabled:cursor-not-allowed min-h-[44px] flex items-center justify-center gap-2">
                <Trash2 className="h-3.5 w-3.5" />
                {periodoLoading ? "Cancello..." : "Conferma"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Reset Mese Dialog ── */}
      <Dialog open={resetOpen} onOpenChange={(open) => { setResetOpen(open); if (!open) setResetInput(""); }}>
        <DialogContent className="glass-strong border-white/10 max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-400">
              <AlertTriangle className="h-4 w-4" />Conferma Reset Mese
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground leading-relaxed">
              Stai per eliminare tutti i turni <strong className="text-foreground">auto-generati</strong> del mese{" "}
              <span className="font-mono text-amber-400">{currentMese}</span>.
              I turni manuali saranno mantenuti.
            </p>
            <div className="rounded-xl bg-red-500/8 border border-red-500/20 p-3">
              <p className="text-xs text-red-300">
                Digita <strong className="font-mono">{currentMese}</strong> per sbloccare la conferma
              </p>
            </div>
            <Input
              value={resetInput}
              onChange={(e) => setResetInput(e.target.value)}
              placeholder={currentMese}
              className="border-white/10 bg-white/5 font-mono text-center tracking-widest"
            />
            <div className="flex gap-3 pt-1">
              <button
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-white/10 text-muted-foreground hover:bg-white/5 transition-all min-h-[44px]"
                onClick={() => { setResetOpen(false); setResetInput(""); }}>
                Annulla
              </button>
              <button
                disabled={resetInput !== currentMese || resetLoading}
                onClick={handleReset}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-all disabled:opacity-35 disabled:cursor-not-allowed min-h-[44px] flex items-center justify-center gap-2">
                <RotateCcw className="h-3.5 w-3.5" />
                {resetLoading ? "Reset..." : "Conferma"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
