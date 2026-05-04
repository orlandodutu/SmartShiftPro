import { useEffect, useState } from "react";
import { RichiestaScambio, Turno, Dipendente } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ShiftBadge } from "@/components/ui/ShiftBadge";
import { RoleBadge } from "@/components/ui/RoleBadge";
import { Plus, ArrowLeftRight, Clock, Trash2 } from "lucide-react";

const CRYSTAL = "linear-gradient(155deg, #B8860B 0%, #FFBF00 38%, #FFE566 52%, #FFBF00 75%, #B8860B 100%)";

function playWhatsAppSound() {
  try {
    const AC = window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.55, ctx.currentTime);
    master.connect(ctx.destination);

    const osc1 = ctx.createOscillator();
    const env1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(1318, ctx.currentTime);
    osc1.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.08);
    osc1.frequency.exponentialRampToValueAtTime(698, ctx.currentTime + 0.55);
    env1.gain.setValueAtTime(0, ctx.currentTime);
    env1.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.008);
    env1.gain.exponentialRampToValueAtTime(0.6, ctx.currentTime + 0.12);
    env1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.75);
    osc1.connect(env1); env1.connect(master);
    osc1.start(ctx.currentTime); osc1.stop(ctx.currentTime + 0.8);

    const osc2 = ctx.createOscillator();
    const env2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(2637, ctx.currentTime);
    osc2.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.06);
    env2.gain.setValueAtTime(0, ctx.currentTime);
    env2.gain.linearRampToValueAtTime(0.25, ctx.currentTime + 0.006);
    env2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
    osc2.connect(env2); env2.connect(master);
    osc2.start(ctx.currentTime); osc2.stop(ctx.currentTime + 0.22);

    const bufSize = ctx.sampleRate * 0.025;
    const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1);
    const noise = ctx.createBufferSource();
    const noiseFilter = ctx.createBiquadFilter();
    const noiseEnv = ctx.createGain();
    noiseFilter.type = "bandpass";
    noiseFilter.frequency.value = 1200;
    noiseFilter.Q.value = 0.8;
    noise.buffer = buf;
    noiseEnv.gain.setValueAtTime(0.18, ctx.currentTime);
    noiseEnv.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.025);
    noise.connect(noiseFilter); noiseFilter.connect(noiseEnv); noiseEnv.connect(master);
    noise.start(ctx.currentTime); noise.stop(ctx.currentTime + 0.03);

    setTimeout(() => ctx.close(), 1800);
  } catch { /* ignore */ }
}

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
    nota: "",
  });

  const [cancelLoading, setCancelLoading] = useState<number | null>(null);

  const handleCancel = async (id: number) => {
    setCancelLoading(id);
    try {
      const res = await fetch(`/flask-api/api/scambi/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        toast({ title: "Richiesta annullata" });
        fetchData();
      } else {
        const err = await res.json();
        toast({ title: err.errore || "Errore", variant: "destructive" });
      }
    } finally {
      setCancelLoading(null);
    }
  };

  const fetchData = async () => {
    if (!user) return;
    try {
      const [scambiRes, dipRes, turniRes] = await Promise.all([
        fetch(`/flask-api/api/scambi?richiedente_id=${user.id}`, { credentials: "include" }),
        fetch("/flask-api/api/dipendenti", { credentials: "include" }),
        fetch(`/flask-api/api/turni?dipendente_id=${user.id}`, { credentials: "include" }),
      ]);
      if (scambiRes.ok) setScambi(await scambiRes.json());
      if (dipRes.ok) setDipendenti(await dipRes.json());
      if (turniRes.ok) setMieTurni(await turniRes.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [user]);

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newScambio.destinatario_id || !newScambio.turno_richiedente_id) {
      toast({ title: "Compila i campi obbligatori", variant: "destructive" });
      return;
    }
    const res = await fetch("/flask-api/api/scambi", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        richiedente_id: user?.id,
        destinatario_id: parseInt(newScambio.destinatario_id),
        turno_richiedente_id: parseInt(newScambio.turno_richiedente_id),
        turno_destinatario_id: newScambio.turno_destinatario_id ? parseInt(newScambio.turno_destinatario_id) : null,
        nota: newScambio.nota,
      }),
      credentials: "include",
    });
    if (res.ok) {
      playWhatsAppSound();
      toast({ title: "Richiesta inviata" });
      setIsDialogOpen(false);
      fetchData();
    } else {
      toast({ title: "Errore", variant: "destructive" });
    }
  };

  const statusBadge = (stato: string) => {
    switch (stato) {
      case "IN_ATTESA":  return <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/30">In Attesa</Badge>;
      case "APPROVATA":  return <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30">Approvata</Badge>;
      case "RIFIUTATA":  return <Badge variant="outline" className="bg-red-500/10 text-red-400 border-red-500/30">Rifiutata</Badge>;
      default:           return <Badge variant="outline">{stato}</Badge>;
    }
  };

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Le mie Richieste di Scambio</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Gestisci i cambi turno con i colleghi</p>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <button
              className="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm glow-gold"
              style={{ background: CRYSTAL, color: "#0f172a" }}
              data-testid="btn-new-scambio"
            >
              <Plus className="h-4 w-4" />
              Nuova Richiesta
            </button>
          </DialogTrigger>
          <DialogContent className="glass-strong border-white/10 max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-foreground">
                <ArrowLeftRight className="h-5 w-5 text-amber-400" />
                Richiedi Cambio Turno
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleRequest} className="space-y-4">
              <div className="space-y-2">
                <Label className="text-muted-foreground">Il tuo turno da cedere</Label>
                <Select value={newScambio.turno_richiedente_id} onValueChange={(v) => setNewScambio({ ...newScambio, turno_richiedente_id: v })}>
                  <SelectTrigger className="border-white/10 bg-white/5"><SelectValue placeholder="Seleziona..." /></SelectTrigger>
                  <SelectContent>
                    {mieiTurni.map((t) => (
                      <SelectItem key={t.id} value={t.id.toString()}>{t.data} — {t.tipo}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground">Collega con cui scambiare</Label>
                <Select value={newScambio.destinatario_id} onValueChange={(v) => setNewScambio({ ...newScambio, destinatario_id: v })}>
                  <SelectTrigger className="border-white/10 bg-white/5"><SelectValue placeholder="Seleziona..." /></SelectTrigger>
                  <SelectContent>
                    {dipendenti.filter((d) => d.id !== user?.id).map((d) => (
                      <SelectItem key={d.id} value={d.id.toString()}>{d.nome} — {d.ruolo}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground">Note / Motivo <span className="text-muted-foreground/50 font-normal">(opzionale)</span></Label>
                <Textarea
                  value={newScambio.nota}
                  onChange={(e) => setNewScambio({ ...newScambio, nota: e.target.value })}
                  className="border-white/10 bg-white/5 resize-none"
                  rows={3}
                />
              </div>
              <button
                type="submit"
                className="w-full py-2.5 rounded-lg font-bold text-sm glow-gold"
                style={{ background: CRYSTAL, color: "#0f172a" }}
              >
                Invia Richiesta
              </button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-3">
        {loading ? (
          <p className="text-sm text-muted-foreground text-center py-10">Caricamento...</p>
        ) : scambi.length === 0 ? (
          <div className="glass rounded-2xl p-10 text-center border border-white/8">
            <ArrowLeftRight className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground font-medium">Nessuna richiesta effettuata</p>
          </div>
        ) : (
          scambi.map((s) => (
            <Card key={s.id} className="glass border-white/8 shadow-none">
              <CardContent className="p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-foreground">Verso:</span>
                    <span className="font-bold text-foreground">{s.destinatario_nome}</span>
                    <RoleBadge role={s.destinatario_ruolo} />
                    {statusBadge(s.stato)}
                  </div>
                  {s.turno_richiedente && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span>Cedi:</span>
                      <ShiftBadge type={s.turno_richiedente.tipo} />
                      <span className="font-mono">{s.turno_richiedente.data}</span>
                    </div>
                  )}
                  {s.nota && (
                    <p className="text-sm text-muted-foreground italic">"{s.nota}"</p>
                  )}
                  {s.nota_caposala && (
                    <p className="text-sm text-amber-400 font-medium">Nota Caposala: {s.nota_caposala}</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground/60">
                    <Clock className="h-3 w-3" />
                    {new Date(s.creata_il).toLocaleDateString("it-IT")}
                  </div>
                  {s.stato === "IN_ATTESA" && (
                    <button
                      onClick={() => handleCancel(s.id)}
                      disabled={cancelLoading === s.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-red-500/30 text-red-400 bg-red-500/8 hover:bg-red-500/15 hover:border-red-400/50 transition-colors disabled:opacity-50"
                    >
                      <Trash2 className="h-3 w-3" />
                      {cancelLoading === s.id ? "Annullo..." : "Annulla"}
                    </button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
