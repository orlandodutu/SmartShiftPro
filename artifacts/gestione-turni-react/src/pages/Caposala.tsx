import { useEffect, useState } from "react";
import { RichiestaScambio } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function Caposala() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [richieste, setRichieste] = useState<RichiestaScambio[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeRequest, setActiveRequest] = useState<RichiestaScambio | null>(null);
  const [notaCaposala, setNotaCaposala] = useState("");
  const [azione, setAzione] = useState<'approva'|'rifiuta'>('approva');

  const fetchRichieste = async () => {
    try {
      const res = await fetch("/flask-api/api/scambi?stato=IN_ATTESA", { credentials: "include" });
      if (res.ok) setRichieste(await res.json());
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRichieste();
  }, []);

  const handleConfirm = async () => {
    if (!activeRequest) return;
    try {
      const res = await fetch(`/flask-api/api/scambi/${activeRequest.id}/approva`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ azione, nota_caposala: notaCaposala }),
        credentials: "include"
      });
      if (res.ok) {
        toast({ title: `Richiesta ${azione === 'approva' ? 'approvata' : 'rifiutata'}` });
        setActiveRequest(null);
        setNotaCaposala("");
        fetchRichieste();
      }
    } catch (error) {
      toast({ title: "Errore", variant: "destructive" });
    }
  };

  if (user?.ruolo !== 'CAPOSALA' && !user?.is_admin) {
    return <div className="p-8 text-center text-red-500">Accesso negato. Area riservata Caposala.</div>;
  }

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Area Caposala</h1>
        <p className="text-gray-500 mt-1">Approvazione richieste di cambio turno</p>
      </div>

      <div className="space-y-4">
        {loading ? (
          <p>Caricamento...</p>
        ) : richieste.length === 0 ? (
          <Card className="border-dashed border-2 bg-gray-50"><CardContent className="p-8 text-center text-gray-500">Nessuna richiesta in sospeso</CardContent></Card>
        ) : (
          richieste.map(r => (
            <Card key={r.id}>
              <CardContent className="p-6 flex flex-col md:flex-row justify-between gap-6">
                <div className="space-y-2 flex-1">
                  <div className="flex gap-2 items-center">
                    <span className="font-semibold">{r.richiedente_nome}</span>
                    <span className="text-gray-400">→</span>
                    <span className="font-semibold">{r.destinatario_nome}</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm bg-gray-50 p-3 rounded-lg border">
                    <div>
                      <p className="text-gray-500 mb-1">Turno ceduto:</p>
                      {r.turno_richiedente ? (
                        <p className="font-medium">{r.turno_richiedente.data} - {r.turno_richiedente.tipo}</p>
                      ) : 'N/D'}
                    </div>
                  </div>
                  {r.nota && <p className="text-sm text-gray-600 mt-2 bg-yellow-50 p-2 rounded border border-yellow-100">Motivazione: {r.nota}</p>}
                </div>
                
                <div className="flex flex-row md:flex-col gap-2 shrink-0 md:w-32">
                  <Button className="w-full bg-green-600 hover:bg-green-700" onClick={() => { setActiveRequest(r); setAzione('approva'); setNotaCaposala(""); }}>
                    Approva
                  </Button>
                  <Button variant="outline" className="w-full text-red-600 border-red-200 hover:bg-red-50" onClick={() => { setActiveRequest(r); setAzione('rifiuta'); setNotaCaposala(""); }}>
                    Rifiuta
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Dialog open={!!activeRequest} onOpenChange={(open) => !open && setActiveRequest(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{azione === 'approva' ? 'Conferma Approvazione' : 'Conferma Rifiuto'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nota per lo staff (opzionale)</Label>
              <Textarea placeholder="Es. Approvato ma coprite la mattina..." value={notaCaposala} onChange={e => setNotaCaposala(e.target.value)} />
            </div>
            <Button onClick={handleConfirm} className={`w-full ${azione === 'approva' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700 text-white'}`}>
              Conferma {azione === 'approva' ? 'Approvazione' : 'Rifiuto'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
