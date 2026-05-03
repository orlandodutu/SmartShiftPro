import { useEffect, useState } from "react";
import { Turno, Dipendente, TipoTurno } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RoleBadge } from "@/components/ui/RoleBadge";
import { ShiftBadge } from "@/components/ui/ShiftBadge";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Plus, FileText } from "lucide-react";
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

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newShift, setNewShift] = useState({
    dipendente_id: "",
    data: new Date().toISOString().split("T")[0],
    tipo: "MATTINO" as TipoTurno,
    note: "",
  });

  const fetchTurni = async () => {
    const res = await fetch("/flask-api/api/turni", { credentials: "include" });
    if (res.ok) setTurni(await res.json());
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await fetchTurni();
      const dipRes = await fetch("/flask-api/api/dipendenti", { credentials: "include" });
      if (dipRes.ok) setDipendenti(await dipRes.json());
      setLoading(false);
    };
    init();
  }, []);

  const handleDelete = async (id: number) => {
    if (!confirm("Eliminare questo turno?")) return;
    const res = await fetch(`/flask-api/api/turni/${id}`, { method: "DELETE", credentials: "include" });
    if (res.ok) {
      toast({ title: "Turno eliminato" });
      setTurni(turni.filter((t) => t.id !== id));
    } else {
      toast({ title: "Errore", variant: "destructive" });
    }
  };

  const handleAddShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newShift.dipendente_id) {
      toast({ title: "Seleziona un dipendente", variant: "destructive" });
      return;
    }
    const res = await fetch("/flask-api/api/turni", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...newShift, dipendente_id: parseInt(newShift.dipendente_id) }),
      credentials: "include",
    });
    if (res.ok) {
      toast({ title: "Turno aggiunto" });
      setIsDialogOpen(false);
      fetchTurni();
    } else {
      toast({ title: "Errore", variant: "destructive" });
    }
  };

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Lista Turni</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Visualizza e gestisci i turni del personale</p>
        </div>
        <div className="flex gap-3">
          <Button
            variant="outline"
            className="border-white/10 hover:bg-white/5 text-muted-foreground hover:text-foreground gap-2"
            onClick={() => window.open("/flask-api/api/genera_report_mensile", "_blank")}
          >
            <FileText className="h-4 w-4" />
            PDF Mensile
          </Button>

          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <button
                className="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm glow-gold transition-all"
                style={{ background: "linear-gradient(135deg, #f59e0b, #d97706)", color: "#0f172a" }}
                data-testid="btn-add-shift"
              >
                <Plus className="h-4 w-4" />
                Aggiungi Turno
              </button>
            </DialogTrigger>
            <DialogContent className="glass-strong border-white/10 max-w-md">
              <DialogHeader>
                <DialogTitle className="text-foreground">Nuovo Turno</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleAddShift} className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Dipendente</Label>
                  <Select value={newShift.dipendente_id} onValueChange={(v) => setNewShift({ ...newShift, dipendente_id: v })}>
                    <SelectTrigger className="border-white/10 bg-white/5"><SelectValue placeholder="Seleziona..." /></SelectTrigger>
                    <SelectContent>
                      {dipendenti.map((d) => (
                        <SelectItem key={d.id} value={d.id.toString()}>{d.nome} — {d.ruolo}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Data</Label>
                  <Input type="date" value={newShift.data} onChange={(e) => setNewShift({ ...newShift, data: e.target.value })} required className="border-white/10 bg-white/5" />
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Tipo</Label>
                  <Select value={newShift.tipo} onValueChange={(v) => setNewShift({ ...newShift, tipo: v as TipoTurno })}>
                    <SelectTrigger className="border-white/10 bg-white/5"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["MATTINO", "POMERIGGIO", "NOTTE", "FERIE", "MALATTIA", "RIPOSO"].map((t) => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Note</Label>
                  <Input value={newShift.note} onChange={(e) => setNewShift({ ...newShift, note: e.target.value })} className="border-white/10 bg-white/5" />
                </div>
                <button
                  type="submit"
                  className="w-full py-2.5 rounded-lg font-bold text-sm glow-gold"
                  style={{ background: "linear-gradient(135deg, #f59e0b, #d97706)", color: "#0f172a" }}
                >
                  Salva Turno
                </button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Table */}
      <Card className="glass border-white/8 shadow-none overflow-hidden">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-white/8 hover:bg-transparent">
                <TableHead className="text-muted-foreground text-xs uppercase tracking-wide">Data</TableHead>
                <TableHead className="text-muted-foreground text-xs uppercase tracking-wide">Dipendente</TableHead>
                <TableHead className="text-muted-foreground text-xs uppercase tracking-wide">Ruolo</TableHead>
                <TableHead className="text-muted-foreground text-xs uppercase tracking-wide">Tipo</TableHead>
                <TableHead className="text-muted-foreground text-xs uppercase tracking-wide">Ore</TableHead>
                <TableHead className="text-right text-muted-foreground text-xs uppercase tracking-wide">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-12 text-muted-foreground">Caricamento...</TableCell></TableRow>
              ) : turni.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-12 text-muted-foreground">Nessun turno trovato</TableCell></TableRow>
              ) : (
                turni.map((turno) => (
                  <TableRow key={turno.id} className="border-white/5 hover:bg-white/3">
                    <TableCell className="font-mono text-sm text-foreground">{turno.data}</TableCell>
                    <TableCell className="font-medium text-foreground">{turno.nome}</TableCell>
                    <TableCell><RoleBadge role={turno.ruolo} /></TableCell>
                    <TableCell><ShiftBadge type={turno.tipo} /></TableCell>
                    <TableCell className="text-gold font-bold">{turno.ore}h</TableCell>
                    <TableCell className="text-right">
                      {(user?.is_admin || user?.ruolo === "CAPOSALA") && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(turno.id)}
                          className="text-red-400/60 hover:text-red-400 hover:bg-red-500/10"
                        >
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
