import { useEffect, useState, useMemo } from "react";
import { Turno, Dipendente } from "@/lib/api";
import { RoleBadge } from "@/components/ui/RoleBadge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { ChevronLeft, ChevronRight, Lock, LayoutGrid } from "lucide-react";
import type { TipoTurno } from "@/lib/api";

/* ── Compact cell styles per shift type ── */
const CELL: Record<string, { label: string; cls: string }> = {
  MATTINO:    { label: "MAT", cls: "bg-amber-500/20  text-amber-300  border-amber-500/30"   },
  POMERIGGIO: { label: "POM", cls: "bg-orange-500/20 text-orange-300 border-orange-500/30"  },
  NOTTE:      { label: "NOT", cls: "bg-indigo-500/20 text-indigo-300 border-indigo-500/35"  },
  SMONTO:     { label: "SMO", cls: "bg-violet-500/20 text-violet-300 border-violet-500/30"  },
  FERIE:      { label: "FER", cls: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" },
  MALATTIA:   { label: "MAL", cls: "bg-red-500/20   text-red-300    border-red-500/30"       },
  RIPOSO:     { label: "RIP", cls: "bg-slate-500/12 text-slate-500  border-slate-500/20"     },
};

function getMonday(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const dow = d.getDay();
  d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
  return d.toISOString().split("T")[0];
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().split("T")[0];
}

function monthStart(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function daysInMonth(dateStr: string): number {
  const d = new Date(dateStr + "T00:00:00");
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

const ROLE_ORDER: Record<string, number> = { CAPOSALA: 0, INFERMIERA: 1, OSS: 2, AUSILIARIO: 3, DEV: 4 };

export default function Griglia() {
  const { toast } = useToast();
  const today = new Date().toISOString().split("T")[0];

  const [viewMode, setViewMode] = useState<"settimana" | "mese">("settimana");
  const [anchorDate, setAnchorDate] = useState(getMonday(today));
  const [turni, setTurni] = useState<Turno[]>([]);
  const [dipendenti, setDipendenti] = useState<Dipendente[]>([]);
  const [loading, setLoading] = useState(false);

  /* ── Date range ── */
  const { dates, startStr, endStr, periodLabel } = useMemo(() => {
    if (viewMode === "settimana") {
      const monday = getMonday(anchorDate);
      const dates = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
      const mon = new Date(monday + "T00:00:00");
      const sun = new Date(dates[6] + "T00:00:00");
      const fmt = (d: Date) => d.toLocaleDateString("it-IT", { day: "numeric", month: "short" });
      return {
        dates,
        startStr: monday,
        endStr: dates[6],
        periodLabel: `${fmt(mon)} – ${fmt(sun)} ${sun.getFullYear()}`,
      };
    } else {
      const ms = monthStart(anchorDate);
      const count = daysInMonth(ms);
      const dates = Array.from({ length: count }, (_, i) => addDays(ms, i));
      const d = new Date(ms + "T00:00:00");
      return {
        dates,
        startStr: ms,
        endStr: dates[count - 1],
        periodLabel: d.toLocaleDateString("it-IT", { month: "long", year: "numeric" }),
      };
    }
  }, [viewMode, anchorDate]);

  /* ── Fetch data ── */
  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`/flask-api/api/turni?data_inizio=${startStr}&data_fine=${endStr}`, { credentials: "include" }),
      fetch("/flask-api/api/dipendenti", { credentials: "include" }),
    ])
      .then(async ([turniRes, dipRes]) => {
        if (turniRes.ok) setTurni(await turniRes.json());
        else toast({ title: "Errore caricamento turni", variant: "destructive" });
        if (dipRes.ok) setDipendenti(await dipRes.json());
      })
      .finally(() => setLoading(false));
  }, [startStr, endStr]);

  /* ── Pivot: dipendente_id → date → Turno ── */
  const pivot = useMemo(() => {
    const map: Record<number, Record<string, Turno>> = {};
    turni.forEach((t) => {
      if (!map[t.dipendente_id]) map[t.dipendente_id] = {};
      map[t.dipendente_id][t.data] = t;
    });
    return map;
  }, [turni]);

  const sortedDip = useMemo(
    () =>
      [...dipendenti]
        .filter(d => d.ruolo !== 'CAPOSALA')
        .sort((a, b) => {
          if (a.is_admin !== b.is_admin) return a.is_admin ? -1 : 1;
          return (ROLE_ORDER[a.ruolo] ?? 9) - (ROLE_ORDER[b.ruolo] ?? 9) || a.nome.localeCompare(b.nome);
        }),
    [dipendenti]
  );

  /* ── Navigation ── */
  const navigate = (dir: 1 | -1) => {
    if (viewMode === "settimana") {
      setAnchorDate(addDays(anchorDate, dir * 7));
    } else {
      const d = new Date(anchorDate + "T00:00:00");
      d.setMonth(d.getMonth() + dir);
      setAnchorDate(d.toISOString().split("T")[0]);
    }
  };
  const goToday = () => setAnchorDate(viewMode === "settimana" ? getMonday(today) : monthStart(today));

  /* ── Legend ── */
  const LEGEND_ITEMS = Object.entries(CELL).filter(([k]) => k !== "RIPOSO");

  return (
    <div className="p-4 md:p-8 max-w-full space-y-5">
      {/* Header */}
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-amber-500/15 text-amber-400 rounded-xl">
            <LayoutGrid className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Griglia Turni</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Vista calendario completa dello staff</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* View toggle */}
          <div className="flex gap-0.5 bg-white/4 rounded-xl p-1">
            {(["settimana", "mese"] as const).map((m) => (
              <button
                key={m}
                onClick={() => { setViewMode(m); setAnchorDate(m === "settimana" ? getMonday(today) : monthStart(today)); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all capitalize ${
                  viewMode === m
                    ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {m === "settimana" ? "Settimana" : "Mese"}
              </button>
            ))}
          </div>

          {/* Date nav */}
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8 border-white/10 hover:bg-white/5" onClick={() => navigate(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-semibold text-foreground min-w-[160px] text-center capitalize">{periodLabel}</span>
            <Button variant="outline" size="icon" className="h-8 w-8 border-white/10 hover:bg-white/5" onClick={() => navigate(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <Button variant="outline" size="sm" className="border-white/10 hover:bg-white/5 text-xs" onClick={goToday}>
            Oggi
          </Button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-2 items-center">
        {LEGEND_ITEMS.map(([key, { label, cls }]) => (
          <span key={key} className={`text-[9px] font-bold px-2 py-0.5 rounded border ${cls}`}>{label}</span>
        ))}
        <span className="text-[9px] text-muted-foreground/50 ml-1">— = nessun turno</span>
        <span className="flex items-center gap-1 text-[9px] text-amber-400/60 ml-1">
          <Lock className="h-2.5 w-2.5" /> = manuale
        </span>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="glass rounded-2xl p-16 text-center border border-white/8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-400 mx-auto" />
          <p className="text-sm text-muted-foreground mt-3">Caricamento griglia...</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-white/8 glass">
          <table className="w-full min-w-max border-collapse text-xs">
            <thead>
              <tr className="border-b border-white/8 bg-white/3">
                {/* Sticky name column header */}
                <th className="sticky left-0 z-20 bg-[#0c1428] px-4 py-3 text-left font-bold text-muted-foreground text-[10px] uppercase tracking-wide min-w-[130px] border-r border-white/6">
                  Dipendente
                </th>
                {dates.map((d) => {
                  const isToday = d === today;
                  const dayNum = new Date(d + "T00:00:00").getDate();
                  const dayName = new Date(d + "T00:00:00").toLocaleDateString("it-IT", { weekday: "short" });
                  const isSun = new Date(d + "T00:00:00").getDay() === 0;
                  return (
                    <th
                      key={d}
                      className={`px-1 py-2 text-center min-w-[46px] font-medium border-r border-white/4 last:border-r-0 ${
                        isToday ? "bg-amber-500/10 text-amber-300" : isSun ? "text-muted-foreground/40" : "text-muted-foreground"
                      }`}
                    >
                      <div className={`text-[8px] uppercase font-bold ${isToday ? "text-amber-400" : ""}`}>{dayName}</div>
                      <div className={`text-sm font-black leading-tight ${isToday ? "text-amber-300" : ""}`}>{dayNum}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {sortedDip.map((dip, idx) => (
                <tr
                  key={dip.id}
                  className={`border-b border-white/4 last:border-b-0 ${
                    idx % 2 === 0 ? "bg-white/0" : "bg-white/[0.015]"
                  }`}
                >
                  {/* Name cell */}
                  <td className="sticky left-0 z-10 bg-[#0c1428] px-4 py-2.5 border-r border-white/6">
                    <div className="flex items-center gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground text-[11px] leading-tight truncate max-w-[90px]">{dip.nome}</p>
                        <RoleBadge role={dip.ruolo} className="mt-0.5" />
                      </div>
                      {dip.is_admin && (
                        <span className="text-[8px] font-bold text-amber-400/60 shrink-0">ADM</span>
                      )}
                    </div>
                  </td>

                  {/* Day cells */}
                  {dates.map((d) => {
                    const turno = pivot[dip.id]?.[d];
                    const cell = turno ? CELL[turno.tipo] : null;
                    const isToday = d === today;
                    const isSun = new Date(d + "T00:00:00").getDay() === 0;
                    return (
                      <td
                        key={d}
                        className={`text-center px-0.5 py-2 border-r border-white/4 last:border-r-0 ${
                          isToday ? "bg-amber-500/5" : isSun ? "bg-white/[0.008]" : ""
                        }`}
                        title={turno ? `${turno.tipo} — ${turno.ore}h${turno.manuale ? " (manuale)" : ""}` : "Nessun turno"}
                      >
                        {cell ? (
                          <span
                            className={`inline-flex items-center justify-center text-[9px] font-bold px-1 py-0.5 rounded border leading-none ${cell.cls} ${
                              turno?.manuale ? "ring-1 ring-amber-400/50" : ""
                            }`}
                          >
                            {cell.label}
                            {turno?.manuale && <Lock className="h-1.5 w-1.5 ml-0.5 opacity-70" />}
                          </span>
                        ) : (
                          <span className="text-[9px] text-muted-foreground/15">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Coverage summary */}
      {!loading && turni.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {(["MATTINO","POMERIGGIO","NOTTE","SMONTO"] as TipoTurno[]).map((tipo) => {
            const count = turni.filter((t) => t.tipo === tipo).length;
            const c = CELL[tipo];
            return (
              <div key={tipo} className={`rounded-xl border p-3 ${c.cls.split(" ").slice(0, 2).join(" ")}/10 border-current/20`}>
                <p className={`text-[10px] font-bold uppercase tracking-wide ${c.cls.split(" ")[1]}`}>{tipo}</p>
                <p className={`text-2xl font-black ${c.cls.split(" ")[1]}`}>{count}</p>
                <p className="text-[10px] text-muted-foreground">turni nel periodo</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
