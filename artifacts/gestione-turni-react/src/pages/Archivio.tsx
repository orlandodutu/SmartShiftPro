import { useEffect, useState } from "react";
import { Turno } from "@/lib/api";
import { ShiftBadge } from "@/components/ui/ShiftBadge";
import { RoleBadge } from "@/components/ui/RoleBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ChevronLeft, Archive, CalendarDays, FileText } from "lucide-react";

type MeseEntry = { mese: string; count: number };

function formatMese(m: string): string {
  const [y, mo] = m.split("-");
  const d = new Date(parseInt(y), parseInt(mo) - 1, 1);
  return d.toLocaleDateString("it-IT", { month: "long", year: "numeric" });
}

function dayLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" });
}

export default function Archivio() {
  const { toast } = useToast();
  const [mesi, setMesi] = useState<MeseEntry[]>([]);
  const [selectedMese, setSelectedMese] = useState<string | null>(null);
  const [turni, setTurni] = useState<Turno[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingTurni, setLoadingTurni] = useState(false);

  useEffect(() => {
    fetch("/flask-api/api/archivio", { credentials: "include" })
      .then(r => r.json())
      .then(data => { setMesi(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const selectMese = async (mese: string) => {
    setSelectedMese(mese);
    setLoadingTurni(true);
    try {
      const res = await fetch(`/flask-api/api/archivio/${mese}`, { credentials: "include" });
      setTurni(await res.json());
    } catch {
      toast({ title: "Errore caricamento archivio", variant: "destructive" });
    } finally {
      setLoadingTurni(false);
    }
  };

  const byDate: Record<string, Turno[]> = {};
  turni.forEach(t => { if (!byDate[t.data]) byDate[t.data] = []; byDate[t.data].push(t); });
  const dates = Object.keys(byDate).sort();

  /* ── Mese detail view ── */
  if (selectedMese) {
    return (
      <div className="p-6 md:p-10 max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-3 flex-wrap">
          <Button variant="ghost" size="icon"
            className="text-muted-foreground hover:text-foreground shrink-0"
            onClick={() => { setSelectedMese(null); setTurni([]); }}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="p-2.5 bg-indigo-500/15 text-indigo-400 rounded-xl shrink-0">
              <Archive className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-foreground capitalize truncate">{formatMese(selectedMese)}</h1>
              <p className="text-xs text-muted-foreground">{turni.length} turni archiviati</p>
            </div>
          </div>
          <Button variant="outline" size="sm"
            className="border-white/10 hover:bg-white/5 text-muted-foreground gap-2 shrink-0"
            onClick={() => window.open("/flask-api/api/genera_report_mensile", "_blank")}>
            <FileText className="h-4 w-4" />PDF
          </Button>
        </div>

        {loadingTurni ? (
          <p className="text-center text-muted-foreground py-12">Caricamento...</p>
        ) : turni.length === 0 ? (
          <div className="glass rounded-2xl p-12 text-center border border-white/8">
            <p className="text-muted-foreground">Nessun turno trovato per questo mese</p>
          </div>
        ) : (
          <div className="space-y-3">
            {dates.map(date => (
              <Card key={date} className="glass border-white/8 shadow-none overflow-hidden">
                <div className="px-5 py-2.5 border-b border-white/5 bg-white/2">
                  <p className="text-xs font-bold text-foreground uppercase tracking-wide">{dayLabel(date)}</p>
                </div>
                <CardContent className="p-0">
                  <div className="divide-y divide-white/4">
                    {byDate[date].map(t => (
                      <div key={t.id} className="flex items-center gap-3 px-5 py-2.5">
                        <ShiftBadge type={t.tipo} />
                        <span className="text-sm font-medium text-foreground flex-1 truncate">{t.nome}</span>
                        <RoleBadge role={t.ruolo} />
                        <span className="text-xs text-gold font-bold">{t.ore > 0 ? `${t.ore}h` : "—"}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  }

  /* ── Month list view ── */
  return (
    <div className="p-6 md:p-10 max-w-3xl mx-auto space-y-8">
      <div className="flex items-center gap-4">
        <div className="p-3 bg-indigo-500/15 text-indigo-400 rounded-2xl">
          <Archive className="h-7 w-7" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Archivio Storico</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Consulta i turni dei mesi precedenti</p>
        </div>
      </div>

      {loading ? (
        <p className="text-center text-muted-foreground py-12">Caricamento...</p>
      ) : mesi.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center border border-white/8">
          <Archive className="h-8 w-8 text-muted-foreground/20 mx-auto mb-3" />
          <p className="text-muted-foreground font-medium">Nessun mese archiviato</p>
          <p className="text-xs text-muted-foreground/60 mt-2 max-w-xs mx-auto">
            Usa il tasto "Archivia Mese" nella pagina Turni per spostare i turni correnti nell'archivio storico
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {mesi.map(({ mese, count }) => (
            <button key={mese}
              className="glass rounded-2xl border border-white/8 p-5 text-left hover:bg-white/6 active:bg-white/8 transition-all flex items-center justify-between group min-h-[64px]"
              onClick={() => selectMese(mese)}>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-500/10 rounded-xl shrink-0">
                  <CalendarDays className="h-4 w-4 text-indigo-400" />
                </div>
                <div>
                  <p className="font-semibold text-foreground capitalize">{formatMese(mese)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{count} turni archiviati</p>
                </div>
              </div>
              <ChevronLeft className="h-4 w-4 text-muted-foreground rotate-180 group-hover:translate-x-1 transition-transform shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
