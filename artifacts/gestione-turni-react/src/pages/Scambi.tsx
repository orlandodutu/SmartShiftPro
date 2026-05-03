import { useEffect, useState } from "react";
import { RichiestaScambio, Turno, Dipendente } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export default function Scambi() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [scambi, setScambi] = useState<RichiestaScambio[]>([]);
  const [dipendenti, setDipendenti] = useState<Dipendente[]>([]);
  const [mieiTurni, setMieTurni] = useState<Turno[]>([]);
  const [loading, setLoading] = useState(true);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newScambio, setNewScambio] = useState({
    destinatario_id: "",
    turno_richiedente_id: "",
    turno_destinatario_id: "",
    nota: ""
  });

  const fetchData = async () => {
    if (!user) return;
    try {
      const [scambiRes, dipRes, turniRes] = await Promise.all([
        fetch(`/flask-api/api/scambi?richiedente_id=${user.id}`, { credentials: "include" }),
        fetch("/flask-api/api/dipendenti", { credentials: "include" }),
        fetch(`/flask-api/api/turni?dipendente_id=${user.id}`, { credentials: "include" })
      ]);
      if (scambiRes.ok) setScambi(await scambiRes.json());
      if (dipRes.ok) setDipendenti(await dipRes.json());
      if (turniRes.ok) setMieTurni(await turniRes.json());
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [user]);

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newScambio.destinatario_id || !newScambio.turno_richiedente_id) {
      toast({ title: "Compila i campi obbligatori", variant: "destructive" });
      return;
    }
    
    try {
      const res = await fetch("/flask-api/api/scambi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          richiedente_id: user?.id,
          destinatario_id: parseInt(newScambio.destinatario_id),
          turno_richiedente_id: parseInt(newScambio.turno_richiedente_id),
          turno_destinatario_id: newScambio.turno_destinatario_id ? parseInt(newScambio.turno_destinatario_id) : null,
          nota: newScambio.nota
        }),
        credentials: "include"
      });
      if (res.ok) {
        toast({ title: "Richiesta inviata" });
        setIsDialogOpen(false);
        fetchData();
      }
    } catch (error) {
      toast({ title: "Errore", variant: "destructive" });
    }
  };

  const getStatusBadge = (stato: string) => {
    switch(stato) {
      case 'IN_ATTESA': return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">In Attesa</Badge>;
      case 'APPROVATA': return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Approvata</Badge>;
      case 'RIFIUTATA': return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">Rifiutata</Badge>;
      default: return <Badge variant="outline">{stato}</Badge>;
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Le mie Richieste di Scambio</h1>
          <p className="text-gray-500 mt-1">Gestisci i cambi turno con i colleghi</p>
        </div>
        
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>Nuova Richiesta</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Richiedi Cambio Turno</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleRequest} className="space-y-4">
              <div className="space-y-2">
                <Label>Il tuo turno da cedere</Label>
                <Select value={newScambio.turno_richiedente_id} onValueChange={v => setNewScambio({...newScambio, turno_richiedente_id: v})}>
                  <SelectTrigger><SelectValue placeholder="Seleziona..." /></SelectTrigger>
                  <SelectContent>
                    {mieiTurni.map(t => (
                      <SelectItem key={t.id} value={t.id.toString()}>{t.data} - {t.tipo}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Collega con cui scambiare</Label>
                <Select value={newScambio.destinatario_id} onValueChange={v => setNewScambio({...newScambio, destinatario_id: v})}>
                  <SelectTrigger><SelectValue placeholder="Seleziona..." /></SelectTrigger>
                  <SelectContent>
                    {dipendenti.filter(d => d.id !== user?.id).map(d => (
                      <SelectItem key={d.id} value={d.id.toString()}>{d.nome} - {d.ruolo}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Note / Motivo (opzionale)</Label>
                <Textarea value={newScambio.nota} onChange={e => setNewScambio({...newScambio, nota: e.target.value})} />
              </div>
              <Button type="submit" className="w-full">Invia Richiesta</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-4">
        {loading ? (
          <p>Caricamento...</p>
        ) : scambi.length === 0 ? (
          <Card className="border-dashed border-2 bg-gray-50"><CardContent className="p-8 text-center text-gray-500">Nessuna richiesta effettuata</CardContent></Card>
        ) : (
          scambi.map(s => (
            <Card key={s.id}>
              <CardContent className="p-4 sm:p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-semibold text-gray-900">Verso: {s.destinatario_nome}</span>
                    {getStatusBadge(s.stato)}
                  </div>
                  <p className="text-sm text-gray-600">
                    <strong>Cedi:</strong> {s.turno_richiedente ? `${s.turno_richiedente.data} ${s.turno_richiedente.tipo}` : 'N/D'}
                  </p>
                  {s.nota && <p className="text-sm text-gray-500 italic mt-1">"{s.nota}"</p>}
                  {s.nota_caposala && <p className="text-sm text-red-600 mt-1 font-medium">Nota Caposala: {s.nota_caposala}</p>}
                </div>
                <div className="text-right text-xs text-gray-400">
                  Richiesta del {new Date(s.creata_il).toLocaleDateString('it-IT')}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
