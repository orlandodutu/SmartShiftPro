import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Wand2, CheckCircle2 } from "lucide-react";

export default function Genera() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [modalita, setModalita] = useState<"settimana" | "mese">("settimana");
  const [dataInizio, setDataInizio] = useState(new Date().toISOString().split("T")[0]);
  const [result, setResult] = useState<{ generati: number; saltati: number; giorni: number } | null>(null);

  const handleGenera = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/flask-api/api/turni/genera", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modalita, data_inizio: dataInizio }),
        credentials: "include",
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setResult(data);
        toast({ title: "Generazione completata" });
      } else {
        toast({ title: "Errore", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Errore di connessione", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 md:p-10 max-w-3xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="p-3 bg-amber-500/15 text-amber-400 rounded-2xl">
          <Wand2 className="h-7 w-7" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Genera Turni</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Creazione automatica dei turni per lo staff</p>
        </div>
      </div>

      <Card className="glass border-white/8 shadow-none">
        <CardHeader>
          <CardTitle className="text-foreground">Parametri di Generazione</CardTitle>
          <CardDescription className="text-muted-foreground">
            Il sistema genererà i turni rispettando i riposi obbligatori e le ore contrattuali.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleGenera} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label className="text-muted-foreground">Periodo</Label>
                <Select value={modalita} onValueChange={(v: "settimana" | "mese") => setModalita(v)}>
                  <SelectTrigger className="border-white/10 bg-white/5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="settimana">1 Settimana (7 giorni)</SelectItem>
                    <SelectItem value="mese">1 Mese (30 giorni)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground">Data Inizio</Label>
                <Input
                  type="date"
                  value={dataInizio}
                  onChange={(e) => setDataInizio(e.target.value)}
                  required
                  className="border-white/10 bg-white/5"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl font-bold text-sm uppercase tracking-wide glow-gold transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              style={{ background: "linear-gradient(135deg, #f59e0b, #d97706)", color: "#0f172a" }}
              data-testid="btn-genera"
            >
              <Wand2 className="h-4 w-4" />
              {loading ? "Generazione in corso..." : "Genera Turni Automaticamente"}
            </button>
          </form>

          {result && (
            <div className="mt-8 pt-6 border-t border-white/8">
              <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/20 p-5 flex gap-4 items-start">
                <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-emerald-400 mb-1">Riepilogo Generazione</p>
                  <p className="text-sm text-emerald-300/80">
                    Generati <span className="font-black text-emerald-300">{result.generati}</span> turni
                    per i prossimi <span className="font-bold">{result.giorni}</span> giorni.
                  </p>
                  {result.saltati > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {result.saltati} turni saltati per conflitti esistenti.
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
