import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Wand2, Info } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function Genera() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [modalita, setModalita] = useState<"settimana" | "mese">("settimana");
  const [dataInizio, setDataInizio] = useState(new Date().toISOString().split('T')[0]);
  const [result, setResult] = useState<{generati: number, saltati: number, giorni: number} | null>(null);

  const handleGenera = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);

    try {
      const res = await fetch("/flask-api/api/turni/genera", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modalita, data_inizio: dataInizio }),
        credentials: "include"
      });
      
      const data = await res.json();
      
      if (res.ok && data.success) {
        setResult(data);
        toast({ title: "Generazione completata" });
      } else {
        toast({ title: "Errore", description: data.error, variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Errore", description: "Impossibile connettersi", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-primary/10 text-primary rounded-xl">
          <Wand2 className="h-8 w-8" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Genera Turni</h1>
          <p className="text-gray-500">Creazione automatica dei turni per lo staff</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Parametri di Generazione</CardTitle>
          <CardDescription>
            Il sistema genererà i turni rispettando i riposi obbligatori e le ore contrattuali.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleGenera} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label>Periodo</Label>
                <Select value={modalita} onValueChange={(v: "settimana"|"mese") => setModalita(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="settimana">1 Settimana</SelectItem>
                    <SelectItem value="mese">1 Mese</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Data Inizio</Label>
                <Input type="date" value={dataInizio} onChange={e => setDataInizio(e.target.value)} required />
              </div>
            </div>

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Generazione in corso..." : "Genera Turni Automaticamente"}
            </Button>
          </form>

          {result && (
            <div className="mt-8 pt-6 border-t">
              <Alert className="bg-green-50 border-green-200">
                <Info className="h-4 w-4 text-green-600" />
                <AlertTitle className="text-green-800 font-bold">Riepilogo Generazione</AlertTitle>
                <AlertDescription className="text-green-700">
                  Sono stati generati <strong>{result.generati}</strong> turni per i prossimi {result.giorni} giorni.<br />
                  Turni saltati per conflitti/riposi: {result.saltati}.
                </AlertDescription>
              </Alert>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
