import { useEffect, useState, useMemo, useCallback } from "react";
import { Turno, Dipendente } from "@/lib/api";
import { RoleBadge } from "@/components/ui/RoleBadge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import {
  ChevronLeft, ChevronRight, Lock, LayoutGrid, List,
  Trash2, X, Plus,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import type { TipoTurno } from "@/lib/api";

/* ── Cell styles ── */
const CELL: Record<string, { label: string; cls: string }> = {
  MATTINO:    { label: "MAT", cls: "bg-amber-500/20  text-amber-300  border-amber-500/30"   },
  POMERIGGIO: { label: "POM", cls: "bg-orange-500/20 text-orange-300 border-orange-500/30"  },
  NOTTE:      { label: "NOT", cls: "bg-indigo-500/20 text-indigo-300 border-indigo-500/35"  },
  SMONTO:     { label: "SMO", cls: "bg-violet-500/20 text-violet-300 border-violet-500/30"  },
  FERIE:      { label: "FER", cls: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" },
  MALATTIA:   { label: "MAL", cls: "bg-red-500/20   text-red-300    border-red-500/30"       },
  RIPOSO:     { label: "RIP", cls: "bg-slate-500/12 text-slate-500  border-slate-500/20"     },
};
const SHIFT_TYPES = ["MATTINO","POMERIGGIO","NOTTE","SMONTO","FERIE","MALATTIA","RIPOSO"] as const;

/* ── Date helpers ── */
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
function fmtDay(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return {
    num: d.getDate(),
    name: d.toLocaleDateString("it-IT", { weekday: "short" }),
    month: d.toLocaleDateString("it-IT", { month: "short" }),
    isSun: d.getDay() === 0,
    isSat: d.getDay() === 6,
  };
}

const ROLE_ORDER: Record<string, number> = { CAPOSALA: 0, INFERMIERA: 1, OSS: 2, AUSILIARIO: 3, DEV: 4 };

/* ── Edit dialog ── */
interface EditCellInfo {
  dipendente_id: number;
  dipendente_nome: string;
  data: string;
  turno?: Turno;
}

function ShiftEditDialog({
  info,
  onClose,
  onSaved,
}: {
  info: EditCellInfo;
  onClose: () => void;
  onSaved: (updated: Turno | null, deletedId?: number) => void;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  const handleSelect = useCallback(async (tipo: string) => {
    setSaving(true);
    try {
      let res: Response;
      if (info.turno) {
        res = await fetch(`/flask-api/api/turni/${info.turno.id}`, {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tipo }),
        });
      } else {
        res = await fetch("/flask-api/api/turni", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dipendente_id: info.dipendente_id, data: info.data, tipo }),
        });
      }
      if (!res.ok) throw new Error(await res.text());
      const saved: Turno = await res.json();
      toast({ title: "Turno salvato", description: `${info.dipendente_nome} — ${tipo}` });
      onSaved(saved);
    } catch {
      toast({ title: "Errore salvataggio", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }, [info, onSaved, toast]);

  const handleDelete = useCallback(async () => {
    if (!info.turno) return;
    setSaving(true);
    try {
      const res = await fetch(`/flask-api/api/turni/${info.turno.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      toast({ title: "Turno eliminato", description: info.dipendente_nome });
      onSaved(null, info.turno.id);
    } catch {
      toast({ title: "Errore eliminazione", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }, [info, onSaved, toast]);

  const dayInfo = fmtDay(info.data);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="glass-strong border-white/10 max-w-xs">
        <DialogHeader>
          <DialogTitle className="text-amber-400 flex items-center gap-2 text-base">
            {info.turno ? <Lock className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {info.turno ? "Modifica turno" : "Aggiungi turno"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold text-foreground">{info.dipendente_nome}</span>
            <span className="text-muted-foreground capitalize">
              {dayInfo.name} {dayInfo.num} {dayInfo.month}
            </span>
          </div>

          {info.turno && (
            <div className="text-xs text-muted-foreground">
              Turno attuale:{" "}
              <span className={`font-bold ${CELL[info.turno.tipo]?.cls.split(" ")[1]}`}>
                {info.turno.tipo}
              </span>
              {info.turno.manuale && " (manuale)"}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            {SHIFT_TYPES.map((tipo) => {
              const c = CELL[tipo];
              const isActive = info.turno?.tipo === tipo;
              return (
                <button
                  key={tipo}
                  disabled={saving}
                  onClick={() => handleSelect(tipo)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-semibold transition-all disabled:opacity-40
                    ${isActive
                      ? `${c.cls} ring-1 ring-current/60 scale-[1.02]`
                      : `border-white/10 text-muted-foreground hover:${c.cls} hover:border-current/30`
                    }`}
                >
                  <span className={`w-2 h-2 rounded-full ${c.cls.split(" ")[0].replace("bg-", "bg-").replace("/20", "")}`} />
                  {tipo === "POMERIGGIO" ? "POM." : tipo}
                </button>
              );
            })}
          </div>

          {info.turno && (
            <Button
              variant="outline"
              size="sm"
              disabled={saving}
              onClick={handleDelete}
              className="w-full border-red-500/30 text-red-400 hover:bg-red-500/10 hover:border-red-500/50"
            >
              <Trash2 className="h-3.5 w-3.5 mr-2" />
              Elimina turno
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="w-full text-muted-foreground"
          >
            <X className="h-3.5 w-3.5 mr-2" />
            Annulla
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ══════════════════════════════════════════════ */
export default function Griglia() {
  const { toast } = useToast();
  const { user } = useAuth();
  const today = new Date().toISOString().split("T")[0];
  const canEdit = !!(user?.is_admin || user?.ruolo === "CAPOSALA");

  const [viewMode, setViewMode]   = useState<"settimana" | "mese">("settimana");
  const [layout, setLayout]       = useState<"scorrevole" | "griglia">("scorrevole");
  const [anchorDate, setAnchorDate] = useState(getMonday(today));
  const [turni, setTurni]         = useState<Turno[]>([]);
  const [dipendenti, setDipendenti] = useState<Dipendente[]>([]);
  const [loading, setLoading]     = useState(false);
  const [editCell, setEditCell]   = useState<EditCellInfo | null>(null);

  /* ── Date range ── */
  const { dates, startStr, endStr, periodLabel } = useMemo(() => {
    if (viewMode === "settimana") {
      const monday = getMonday(anchorDate);
      const dates = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
      const mon = new Date(monday + "T00:00:00");
      const sun = new Date(dates[6] + "T00:00:00");
      const fmt = (d: Date) => d.toLocaleDateString("it-IT", { day: "numeric", month: "short" });
      return { dates, startStr: monday, endStr: dates[6], periodLabel: `${fmt(mon)} – ${fmt(sun)} ${sun.getFullYear()}` };
    } else {
      const ms = monthStart(anchorDate);
      const count = daysInMonth(ms);
      const dates = Array.from({ length: count }, (_, i) => addDays(ms, i));
      const d = new Date(ms + "T00:00:00");
      return { dates, startStr: ms, endStr: dates[count - 1], periodLabel: d.toLocaleDateString("it-IT", { month: "long", year: "numeric" }) };
    }
  }, [viewMode, anchorDate]);

  /* ── Fetch ── */
  const fetchData = useCallback(() => {
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
  }, [startStr, endStr, toast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  /* ── Pivot: dipendente_id → data → Turno ── */
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
        .filter((d) => d.ruolo !== "CAPOSALA")
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

  /* ── Handle save from dialog ── */
  const handleSaved = useCallback((updated: Turno | null, deletedId?: number) => {
    setTurni((prev) => {
      if (deletedId !== undefined) return prev.filter((t) => t.id !== deletedId);
      if (!updated) return prev;
      const idx = prev.findIndex((t) => t.id === updated.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = updated; return next; }
      return [...prev, updated];
    });
    setEditCell(null);
  }, []);

  /* ── Cell click ── */
  const handleCellClick = useCallback((dip: Dipendente, data: string) => {
    if (!canEdit) return;
    setEditCell({
      dipendente_id: dip.id,
      dipendente_nome: dip.nome,
      data,
      turno: pivot[dip.id]?.[data],
    });
  }, [canEdit, pivot]);

  /* ── Legend ── */
  const LEGEND_ITEMS = Object.entries(CELL).filter(([k]) => k !== "RIPOSO");

  /* ══════ RENDER ══════ */
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
          {/* Layout toggle */}
          <div className="flex gap-0.5 bg-white/4 rounded-xl p-1">
            <button
              onClick={() => setLayout("scorrevole")}
              title="Vista scorrevole"
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                layout === "scorrevole"
                  ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <List className="h-3.5 w-3.5" />
              Scorrevole
            </button>
            <button
              onClick={() => setLayout("griglia")}
              title="Vista a griglia"
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                layout === "griglia"
                  ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Griglia
            </button>
          </div>

          {/* View period toggle */}
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
        {canEdit && (
          <span className="text-[9px] text-amber-400/50 ml-1">• clicca una cella per modificare</span>
        )}
      </div>

      {/* ══ LOADING ══ */}
      {loading ? (
        <div className="glass rounded-2xl p-16 text-center border border-white/8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-400 mx-auto" />
          <p className="text-sm text-muted-foreground mt-3">Caricamento griglia...</p>
        </div>
      ) : layout === "scorrevole" ? (
        /* ══ VISTA SCORREVOLE (tabella orizzontale) ══ */
        <div className="overflow-x-auto rounded-2xl border border-white/8 glass">
          <table className="w-full min-w-max border-collapse text-xs">
            <thead>
              <tr className="border-b border-white/8 bg-white/3">
                <th className="sticky left-0 z-20 bg-[#0c1428] px-4 py-3 text-left font-bold text-muted-foreground text-[10px] uppercase tracking-wide min-w-[130px] border-r border-white/6">
                  Dipendente
                </th>
                {dates.map((d) => {
                  const { num, name, isSun } = fmtDay(d);
                  const isToday = d === today;
                  return (
                    <th key={d} className={`px-1 py-2 text-center min-w-[46px] font-medium border-r border-white/4 last:border-r-0 ${
                      isToday ? "bg-amber-500/10 text-amber-300" : isSun ? "text-muted-foreground/40" : "text-muted-foreground"
                    }`}>
                      <div className={`text-[8px] uppercase font-bold ${isToday ? "text-amber-400" : ""}`}>{name}</div>
                      <div className={`text-sm font-black leading-tight ${isToday ? "text-amber-300" : ""}`}>{num}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {sortedDip.map((dip, idx) => (
                <tr key={dip.id} className={`border-b border-white/4 last:border-b-0 ${idx % 2 === 0 ? "bg-white/0" : "bg-white/[0.015]"}`}>
                  <td className="sticky left-0 z-10 bg-[#0c1428] px-4 py-2.5 border-r border-white/6">
                    <div className="flex items-center gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground text-[11px] leading-tight truncate max-w-[90px]">{dip.nome}</p>
                        <RoleBadge role={dip.ruolo} className="mt-0.5" />
                      </div>
                      {dip.is_admin && <span className="text-[8px] font-bold text-amber-400/60 shrink-0">ADM</span>}
                    </div>
                  </td>

                  {dates.map((d) => {
                    const turno = pivot[dip.id]?.[d];
                    const cell = turno ? CELL[turno.tipo] : null;
                    const isToday = d === today;
                    const { isSun } = fmtDay(d);
                    return (
                      <td
                        key={d}
                        onClick={() => handleCellClick(dip, d)}
                        title={turno ? `${turno.tipo} — ${turno.ore}h${turno.manuale ? " (manuale)" : ""}` : canEdit ? "Clicca per aggiungere turno" : "Nessun turno"}
                        className={`text-center px-0.5 py-2 border-r border-white/4 last:border-r-0 transition-colors ${
                          isToday ? "bg-amber-500/5" : isSun ? "bg-white/[0.008]" : ""
                        } ${canEdit ? "cursor-pointer hover:bg-white/5" : ""}`}
                      >
                        {cell ? (
                          <span className={`inline-flex items-center justify-center text-[9px] font-bold px-1 py-0.5 rounded border leading-none ${cell.cls} ${
                            turno?.manuale ? "ring-1 ring-amber-400/50" : ""
                          }`}>
                            {cell.label}
                            {turno?.manuale && <Lock className="h-1.5 w-1.5 ml-0.5 opacity-70" />}
                          </span>
                        ) : (
                          <span className={`text-[9px] ${canEdit ? "text-muted-foreground/20 group-hover:text-amber-400/30" : "text-muted-foreground/15"}`}>
                            {canEdit ? "+" : "—"}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        /* ══ VISTA GRIGLIA (cards per giorno) ══ */
        <div className={`grid gap-3 ${
          viewMode === "settimana"
            ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            : "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7"
        }`}>
          {dates.map((d) => {
            const { num, name, month, isSun, isSat } = fmtDay(d);
            const isToday = d === today;
            const dayTurni = turni.filter((t) => t.data === d);
            const dipWithTurno = sortedDip.map((dip) => ({
              dip,
              turno: pivot[dip.id]?.[d],
            }));

            return (
              <div
                key={d}
                className={`rounded-2xl border glass overflow-hidden flex flex-col ${
                  isToday
                    ? "border-amber-500/40 bg-amber-500/5"
                    : isSun || isSat
                    ? "border-white/5 opacity-80"
                    : "border-white/8"
                }`}
              >
                {/* Day header */}
                <div className={`px-3 py-2.5 border-b ${
                  isToday ? "bg-amber-500/15 border-amber-500/25" : "bg-white/3 border-white/6"
                }`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <span className={`text-[9px] uppercase font-bold tracking-wider ${isToday ? "text-amber-400" : "text-muted-foreground"}`}>
                        {name}
                      </span>
                      <div className={`text-lg font-black leading-tight ${isToday ? "text-amber-300" : "text-foreground"}`}>
                        {num}
                        <span className="text-xs font-normal ml-1 text-muted-foreground">{month}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] text-muted-foreground">{dayTurni.length} turni</div>
                      {isToday && <div className="text-[9px] text-amber-400 font-bold">OGGI</div>}
                    </div>
                  </div>
                </div>

                {/* Staff list */}
                <div className="flex-1 p-2 space-y-1 min-h-[80px]">
                  {dipWithTurno.length === 0 ? (
                    <p className="text-[10px] text-muted-foreground/40 text-center py-3">Nessuno staff</p>
                  ) : (
                    dipWithTurno.map(({ dip, turno }) => {
                      const cell = turno ? CELL[turno.tipo] : null;
                      return (
                        <div
                          key={dip.id}
                          onClick={() => handleCellClick(dip, d)}
                          title={canEdit ? "Clicca per modificare" : undefined}
                          className={`flex items-center justify-between gap-1 px-2 py-1.5 rounded-lg transition-colors ${
                            canEdit ? "cursor-pointer hover:bg-white/6" : ""
                          } ${cell ? `${cell.cls.split(" ")[0]}/10` : "bg-white/[0.02]"}`}
                        >
                          <span className="text-[10px] text-foreground/80 truncate font-medium leading-tight flex-1 min-w-0">
                            {dip.nome.split(" ")[0]}
                          </span>
                          {cell ? (
                            <span className={`inline-flex items-center text-[9px] font-bold px-1.5 py-0.5 rounded border leading-none shrink-0 ${cell.cls} ${
                              turno?.manuale ? "ring-1 ring-amber-400/40" : ""
                            }`}>
                              {cell.label}
                              {turno?.manuale && <Lock className="h-1.5 w-1.5 ml-0.5 opacity-60" />}
                            </span>
                          ) : canEdit ? (
                            <span className="text-[10px] text-white/15 font-bold">+</span>
                          ) : (
                            <span className="text-[9px] text-muted-foreground/20">—</span>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
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

      {/* Edit dialog */}
      {editCell && (
        <ShiftEditDialog
          info={editCell}
          onClose={() => setEditCell(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
