import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Wand2, CheckCircle2, CalendarDays, Lock } from "lucide-react";

type Modalita = "settimana" | "mese" | "giorno";

export default function Genera() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [modalita, setModalita] = useState<Modalita>("settimana");
  const [dataInizio, setDataInizio] = useState(new Date().toISOString().split("T")[0]);
  const [result, setResult] = useState<{ generati: number; saltati: number; giorni: number; modalita: string } | null>(null);

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
          <div className="flex gap-2"><span className="text-amber-400 font-bold shrink-0">Admin</span> Fisso Mattino (07–14), riposo Dom</div>
          <div className="flex gap-2"><span className="text-emerald-400 font-bold shrink-0">INF</span> Solo Mattino, riposo Sab/Dom alternati</div>
          <div className="flex gap-2"><span className="text-blue-400 font-bold shrink-0">OSS</span> Min 3 mattino, 2 pomeriggio, 1 notte*</div>
          <div className="flex gap-2"><span className="text-amber-300 font-bold shrink-0">AUS</span> 07–15 (8h), separati da OSS, min 1/giorno</div>
          <div className="flex gap-2 md:col-span-2"><span className="text-violet-400 font-bold shrink-0">Notte→Smonto→Riposo</span> Catena automatica post-notte</div>
          <div className="flex gap-2 md:col-span-2">
            <Lock className="h-3 w-3 text-amber-400 shrink-0 mt-0.5" />
            <span>I turni modificati manualmente sono bloccati e non vengono sovrascritti</span>
          </div>
        </div>
      </div>

      <Card className="glass border-white/8 shadow-none">
        <CardHeader>
          <CardTitle className="text-foreground">Parametri di Generazione</CardTitle>
          <CardDescription className="text-muted-foreground">
            I turni esistenti non bloccati saranno saltati; i bloccati (🔒) rimarranno invariati.
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
                  Generazione per <strong>un solo giorno</strong>. L'algoritmo considera i turni dei giorni precedenti 
                  (es. chi ha fatto Notte ieri riceverà automaticamente Smonto oggi).
                </span>
              </div>
            )}

            <button type="submit" disabled={loading}
              className="w-full py-3 rounded-xl font-bold text-sm uppercase tracking-wide glow-gold transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              style={{ background: "linear-gradient(135deg, #f59e0b, #d97706)", color: "#0f172a" }}
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
    </div>
  );
}
