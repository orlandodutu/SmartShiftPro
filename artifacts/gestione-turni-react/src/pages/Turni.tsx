import { useEffect, useState } from "react";
import { Turno, Dipendente, TipoTurno } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RoleBadge } from "@/components/ui/RoleBadge";
import { ShiftBadge } from "@/components/ui/ShiftBadge";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";

export default function Turni() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [turni, setTurni] = useState<Turno[]>([]);
  const [dipendenti, setDipendenti] = useState<Dipendente[]>([]);
  const [loading, setLoading] = useState(true);

  // New Shift State
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newShift, setNewShift] = useState({
    dipendente_id: "",
    data: new Date().toISOString().split('T')[0],
    tipo: "MATTINO" as TipoTurno,
    note: ""
  });

  const fetchTurni = async () => {
    try {
      const res = await fetch("/flask-api/api/turni", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setTurni(data);
      }
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        await fetchTurni();
        const dipRes = await fetch("/flask-api/api/dipendenti", { credentials: "include" });
        if (dipRes.ok) {
          setDipendenti(await dipRes.json());
        }
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleDelete = async (id: number) => {
    if (!confirm("Sei sicuro di voler eliminare questo turno?")) return;
    try {
      const res = await fetch(`/flask-api/api/turni/${id}`, {
        method: "DELETE",
        credentials: "include"
      });
      if (res.ok) {
        toast({ title: "Turno eliminato" });
        setTurni(turni.filter(t => t.id !== id));
      }
    } catch (error) {
      toast({ title: "Errore", variant: "destructive" });
    }
  };

  const handleAddShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newShift.dipendente_id) {
      toast({ title: "Seleziona un dipendente", variant: "destructive" });
      return;
    }
    
    try {
      const res = await fetch("/flask-api/api/turni", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...newShift,
          dipendente_id: parseInt(newShift.dipendente_id)
        }),
        credentials: "include"
      });
      if (res.ok) {
        toast({ title: "Turno aggiunto" });
        setIsDialogOpen(false);
        fetchTurni();
      }
    } catch (error) {
      toast({ title: "Errore", variant: "destructive" });
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Lista Turni</h1>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => window.open('/flask-api/api/genera_report_mensile', '_blank')}>
            PDF Mensile
          </Button>
          
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" /> Aggiungi Turno</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nuovo Turno</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleAddShift} className="space-y-4">
                <div className="space-y-2">
                  <Label>Dipendente</Label>
                  <Select value={newShift.dipendente_id} onValueChange={val => setNewShift({...newShift, dipendente_id: val})}>
                    <SelectTrigger><SelectValue placeholder="Seleziona..." /></SelectTrigger>
                    <SelectContent>
                      {dipendenti.map(d => (
                        <SelectItem key={d.id} value={d.id.toString()}>{d.nome} - {d.ruolo}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Data</Label>
                  <Input type="date" value={newShift.data} onChange={e => setNewShift({...newShift, data: e.target.value})} required />
                </div>
                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <Select value={newShift.tipo} onValueChange={val => setNewShift({...newShift, tipo: val as TipoTurno})}>
                    <SelectTrigger><SelectValue placeholder="Seleziona..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MATTINO">MATTINO</SelectItem>
                      <SelectItem value="POMERIGGIO">POMERIGGIO</SelectItem>
                      <SelectItem value="NOTTE">NOTTE</SelectItem>
                      <SelectItem value="RIPOSO">RIPOSO</SelectItem>
                      <SelectItem value="FERIE">FERIE</SelectItem>
                      <SelectItem value="MALATTIA">MALATTIA</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Note</Label>
                  <Input value={newShift.note} onChange={e => setNewShift({...newShift, note: e.target.value})} />
                </div>
                <Button type="submit" className="w-full">Salva</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Dipendente</TableHead>
                <TableHead>Ruolo</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Ore</TableHead>
                <TableHead className="text-right">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8">Caricamento...</TableCell></TableRow>
              ) : turni.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-gray-500">Nessun turno trovato</TableCell></TableRow>
              ) : (
                turni.map((turno) => (
                  <TableRow key={turno.id}>
                    <TableCell className="font-medium">{turno.data}</TableCell>
                    <TableCell>{turno.nome}</TableCell>
                    <TableCell><RoleBadge role={turno.ruolo} /></TableCell>
                    <TableCell><ShiftBadge type={turno.tipo} /></TableCell>
                    <TableCell>{turno.ore}h</TableCell>
                    <TableCell className="text-right">
                      {(user?.is_admin || user?.ruolo === 'CAPOSALA') && (
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(turno.id)} className="text-red-500 hover:text-red-700 hover:bg-red-50">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
