import { useEffect, useState, Fragment } from "react";
import { Turno, Dipendente, TipoTurno } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { RoleBadge } from "@/components/ui/RoleBadge";
import { ShiftBadge } from "@/components/ui/ShiftBadge";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Plus, FileText, CalendarDays, Pencil, Lock } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";

const ALL_TIPI: TipoTurno[] = ["MATTINO","POMERIGGIO","NOTTE","SMONTO","FERIE","MALATTIA","RIPOSO"];

function getWeekMonday(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return d.toISOString().split("T")[0];
}
function weekLabel(mondayStr: string): string {
  const mon = new Date(mondayStr + "T00:00:00");
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  const fmt = (d: Date, y = false) =>
    d.toLocaleDateString("it-IT", { day: "numeric", month: "short", ...(y ? { year: "numeric" } : {}) });
  return `${fmt(mon)} – ${fmt(sun, true)}`;
}

const TIPO_ORDER: Record<TipoTurno, number> = {
  MATTINO: 0, POMERIGGIO: 1, NOTTE: 2, SMONTO: 3, RIPOSO: 4, FERIE: 5, MALATTIA: 6,
};

const TIPO_LEFT: Record<TipoTurno, string> = {
  MATTINO:    "border-l-amber-400",
  POMERIGGIO: "border-l-orange-400",
  NOTTE:      "border-l-indigo-400",
  SMONTO:     "border-l-violet-400",
  RIPOSO:     "border-l-slate-500",
  FERIE:      "border-l-emerald-400",
  MALATTIA:   "border-l-red-400",
};

export default function Turni() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [turni, setTurni] = useState<Turno[]>([]);
  const [dipendenti, setDipendenti] = useState<Dipendente[]>([]);
  const [loading, setLoading] = useState(true);

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newShift, setNewShift] = useState({
    dipendente_id: "", data: new Date().toISOString().split("T")[0],
    tipo: "MATTINO" as TipoTurno, note: "",
  });

  const [editShift, setEditShift] = useState<Turno | null>(null);
  const [editForm, setEditForm] = useState({
    dipendente_id: "", tipo: "MATTINO" as TipoTurno, data: "", ore: 7, note: "",
  });

  const canManage = user?.is_admin || user?.ruolo === "CAPOSALA";

  const fetchTurni = async () => {
    const res = await fetch("/flask-api/api/turni", { credentials: "include" });
    if (res.ok) setTurni(await res.json());
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      const [, dipRes] = await Promise.all([
        fetchTurni(),
        fetch("/flask-api/api/dipendenti", { credentials: "include" }),
      ]);
      if (dipRes && dipRes.ok) setDipendenti(await dipRes.json());
      setLoading(false);
    };
    init();
  }, []);

  const handleDelete = async (id: number) => {
    if (!confirm("Eliminare questo turno?")) return;
    const res = await fetch(`/flask-api/api/turni/${id}`, { method: "DELETE", credentials: "include" });
    if (res.ok) { toast({ title: "Turno eliminato" }); setTurni(turni.filter((t) => t.id !== id)); }
    else toast({ title: "Errore", variant: "destructive" });
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newShift.dipendente_id) { toast({ title: "Seleziona un dipendente", variant: "destructive" }); return; }
    const res = await fetch("/flask-api/api/turni", {
      method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
      body: JSON.stringify({ ...newShift, dipendente_id: parseInt(newShift.dipendente_id) }),
    });
    if (res.ok) { toast({ title: "Turno aggiunto (bloccato)" }); setIsAddOpen(false); fetchTurni(); }
    else toast({ title: "Errore", variant: "destructive" });
  };

  const openEdit = (turno: Turno) => {
    if (!user?.is_admin) return;
    setEditShift(turno);
    setEditForm({ dipendente_id: turno.dipendente_id.toString(), tipo: turno.tipo, data: turno.data, ore: turno.ore, note: turno.note });
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editShift) return;
    const res = await fetch(`/flask-api/api/turni/${editShift.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "include",
      body: JSON.stringify({ dipendente_id: parseInt(editForm.dipendente_id), tipo: editForm.tipo, data: editForm.data, ore: editForm.ore, note: editForm.note }),
    });
    if (res.ok) { toast({ title: "Turno aggiornato — bloccato da ricalcolo" }); setEditShift(null); fetchTurni(); }
    else toast({ title: "Errore", variant: "destructive" });
  };

  const sorted = [...turni].sort((a, b) => {
    const dateCmp = a.data.localeCompare(b.data);
    if (dateCmp !== 0) return dateCmp;
    return (TIPO_ORDER[a.tipo] ?? 9) - (TIPO_ORDER[b.tipo] ?? 9);
  });

  const byWeek: Record<string, Record<string, Turno[]>> = {};
  sorted.forEach((t) => {
    const ws = getWeekMonday(t.data);
    if (!byWeek[ws]) byWeek[ws] = {};
    if (!byWeek[ws][t.data]) byWeek[ws][t.data] = [];
    byWeek[ws][t.data].push(t);
  });
  const weeks = Object.keys(byWeek).sort();

  const dayLabel = (dateStr: string) => {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" });
  };
  const countsByType = (shifts: Turno[]) => {
    const c: Partial<Record<TipoTurno, number>> = {};
    shifts.forEach((s) => { c[s.tipo] = (c[s.tipo] ?? 0) + 1; });
    return c;
  };

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Lista Turni</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Raggruppati per settimana — <span className="text-amber-400/70">🔒 = bloccato da ricalcolo</span></p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="border-white/10 hover:bg-white/5 text-muted-foreground hover:text-foreground gap-2"
            onClick={() => window.open("/flask-api/api/genera_report_mensile", "_blank")}>
            <FileText className="h-4 w-4" />{canManage ? "PDF Completo" : "Mio PDF"}
          </Button>

          {canManage && (
            <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
              <DialogTrigger asChild>
                <button className="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm glow-gold"
                  style={{ background: "linear-gradient(135deg, #f59e0b, #d97706)", color: "#0f172a" }}>
                  <Plus className="h-4 w-4" />Aggiungi Turno
                </button>
              </DialogTrigger>
              <DialogContent className="glass-strong border-white/10 max-w-md">
                <DialogHeader><DialogTitle className="text-foreground">Nuovo Turno Manuale</DialogTitle></DialogHeader>
                <p className="text-xs text-amber-400/70 -mt-1">I turni manuali sono bloccati e non verranno sovrascritti dal ricalcolo automatico.</p>
                <form onSubmit={handleAdd} className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">Dipendente</Label>
                    <Select value={newShift.dipendente_id} onValueChange={(v) => setNewShift({ ...newShift, dipendente_id: v })}>
                      <SelectTrigger className="border-white/10 bg-white/5"><SelectValue placeholder="Seleziona..." /></SelectTrigger>
                      <SelectContent>
                        {dipendenti.map((d) => <SelectItem key={d.id} value={d.id.toString()}>{d.nome} — {d.ruolo}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label className="text-muted-foreground">Data</Label>
                      <Input type="date" value={newShift.data} onChange={(e) => setNewShift({ ...newShift, data: e.target.value })} required className="border-white/10 bg-white/5" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-muted-foreground">Tipo</Label>
                      <Select value={newShift.tipo} onValueChange={(v) => setNewShift({ ...newShift, tipo: v as TipoTurno })}>
                        <SelectTrigger className="border-white/10 bg-white/5"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {ALL_TIPI.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">Note</Label>
                    <Input value={newShift.note} onChange={(e) => setNewShift({ ...newShift, note: e.target.value })} className="border-white/10 bg-white/5" />
                  </div>
                  <button type="submit" className="w-full py-2.5 rounded-lg font-bold text-sm glow-gold"
                    style={{ background: "linear-gradient(135deg, #f59e0b, #d97706)", color: "#0f172a" }}>
                    Salva Turno
                  </button>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {loading ? (
        <p className="text-center text-muted-foreground py-12">Caricamento...</p>
      ) : turni.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center border border-white/8">
          <CalendarDays className="h-8 w-8 text-muted-foreground/20 mx-auto mb-3" />
          <p className="text-muted-foreground">Nessun turno trovato</p>
        </div>
      ) : (
        weeks.map((weekStart) => (
          <Fragment key={weekStart}>
            <div className="flex items-center gap-3 mt-2">
              <div className="h-px flex-1 bg-white/6" />
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/4 border border-white/8">
                <CalendarDays className="h-3 w-3 text-amber-400/70" />
                <span className="text-[10px] font-bold text-muted-foreground/70 uppercase tracking-widest whitespace-nowrap">
                  {weekLabel(weekStart)}
                </span>
              </div>
              <div className="h-px flex-1 bg-white/6" />
            </div>

            {Object.keys(byWeek[weekStart]).sort().map((date) => {
              const shifts = byWeek[weekStart][date];
              const counts = countsByType(shifts);
              return (
                <Card key={date} className="glass border-white/8 shadow-none overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-2.5 border-b border-white/5 bg-white/2">
                    <p className="text-xs font-bold text-foreground uppercase tracking-wide">{dayLabel(date)}</p>
                    <div className="flex gap-2">
                      {(["MATTINO","POMERIGGIO","NOTTE"] as TipoTurno[]).map((tipo) =>
                        counts[tipo] ? (
                          <span key={tipo} className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                            tipo === "MATTINO"    ? "bg-amber-500/10  text-amber-400  border-amber-500/20"   :
                            tipo === "POMERIGGIO" ? "bg-orange-500/10 text-orange-400 border-orange-500/20" :
                                                    "bg-indigo-500/10 text-indigo-400 border-indigo-500/20"
                          }`}>{tipo.slice(0, 3)}: {counts[tipo]}</span>
                        ) : null
                      )}
                    </div>
                  </div>
                  <CardContent className="p-0">
                    <div className="divide-y divide-white/4">
                      {shifts.map((turno) => (
                        <div key={turno.id}
                          className={`flex items-center gap-3 px-5 py-3 border-l-2 ${TIPO_LEFT[turno.tipo] ?? "border-l-transparent"} ${
                            user?.is_admin ? "hover:bg-white/4 cursor-pointer" : ""
                          }`}
                          onClick={() => user?.is_admin && openEdit(turno)}
                        >
                          <ShiftBadge type={turno.tipo} />
                          <span className="font-medium text-foreground text-sm flex-1 min-w-0 truncate">{turno.nome}</span>
                          <RoleBadge role={turno.ruolo} />
                          <span className="text-xs text-gold font-bold shrink-0">{turno.ore > 0 ? `${turno.ore}h` : "—"}</span>
                          {turno.manuale && (
                            <Lock className="h-3 w-3 text-amber-400/60 shrink-0" title="Turno manuale — non verrà sovrascritto" />
                          )}
                          {canManage && (
                            <div className="flex gap-1 shrink-0">
                              {user?.is_admin && (
                                <Button variant="ghost" size="icon"
                                  className="h-7 w-7 text-muted-foreground/40 hover:text-amber-400 hover:bg-amber-500/10"
                                  onClick={(e) => { e.stopPropagation(); openEdit(turno); }}>
                                  <Pencil className="h-3 w-3" />
                                </Button>
                              )}
                              <Button variant="ghost" size="icon"
                                className="h-7 w-7 text-red-400/40 hover:text-red-400 hover:bg-red-500/10"
                                onClick={(e) => { e.stopPropagation(); handleDelete(turno.id); }}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </Fragment>
        ))
      )}

      <Dialog open={!!editShift} onOpenChange={(open) => !open && setEditShift(null)}>
        <DialogContent className="glass-strong border-white/10 max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <Pencil className="h-4 w-4 text-amber-400" />Modifica Turno
              <span className="ml-auto flex items-center gap-1 text-[10px] font-normal text-amber-400/70">
                <Lock className="h-3 w-3" />verrà bloccato
              </span>
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEdit} className="space-y-4">
            <div className="space-y-2">
              <Label className="text-muted-foreground">Assegna a</Label>
              <Select value={editForm.dipendente_id} onValueChange={(v) => setEditForm({ ...editForm, dipendente_id: v })}>
                <SelectTrigger className="border-white/10 bg-white/5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {dipendenti.map((d) => <SelectItem key={d.id} value={d.id.toString()}>{d.nome} — {d.ruolo}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-muted-foreground">Data</Label>
                <Input type="date" value={editForm.data} onChange={(e) => setEditForm({ ...editForm, data: e.target.value })} className="border-white/10 bg-white/5" />
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground">Tipo</Label>
                <Select value={editForm.tipo} onValueChange={(v) => setEditForm({ ...editForm, tipo: v as TipoTurno })}>
                  <SelectTrigger className="border-white/10 bg-white/5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ALL_TIPI.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-muted-foreground">Ore</Label>
                <Input type="number" min={0} max={24} value={editForm.ore} onChange={(e) => setEditForm({ ...editForm, ore: parseInt(e.target.value) || 0 })} className="border-white/10 bg-white/5" />
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground">Note</Label>
                <Input value={editForm.note} onChange={(e) => setEditForm({ ...editForm, note: e.target.value })} className="border-white/10 bg-white/5" />
              </div>
            </div>
            <div className="flex gap-3 pt-1">
              <Button variant="outline" className="flex-1 border-white/10 hover:bg-white/5" onClick={() => setEditShift(null)} type="button">Annulla</Button>
              <button type="submit" className="flex-1 py-2 rounded-lg font-bold text-sm glow-gold"
                style={{ background: "linear-gradient(135deg, #f59e0b, #d97706)", color: "#0f172a" }}>
                Salva Modifiche
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
