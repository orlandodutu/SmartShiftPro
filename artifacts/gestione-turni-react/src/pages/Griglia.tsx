import { useEffect, useState, useMemo, useCallback } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { Turno, Dipendente } from "@/lib/api";
import { RoleBadge } from "@/components/ui/RoleBadge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import {
  ChevronLeft, ChevronRight, Lock, LayoutGrid, List,
  Trash2, X, Plus, Printer,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import type { TipoTurno } from "@/lib/api";

/* ── Cell styles ── */
const CELL: Record<string, { label: string; cls: string }> = {
  MATTINO:    { label: "M", cls: "bg-amber-500/20  text-amber-300  border-amber-500/30"   },
  POMERIGGIO: { label: "P", cls: "bg-orange-500/20 text-orange-300 border-orange-500/30"  },
  NOTTE:      { label: "N", cls: "bg-indigo-500/20 text-indigo-300 border-indigo-500/35"  },
  SMONTO:     { label: "S", cls: "bg-violet-500/20 text-violet-300 border-violet-500/30"  },
  FERIE:      { label: "F", cls: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" },
  MALATTIA:   { label: "ML", cls: "bg-red-500/20   text-red-300    border-red-500/30"       },
  RIPOSO:     { label: "R", cls: "bg-slate-500/12 text-slate-500  border-slate-500/20"     },
};
const SHIFT_TYPES = ["MATTINO","POMERIGGIO","NOTTE","SMONTO","FERIE","MALATTIA","RIPOSO"] as const;

/* ── Date helpers ── */
function formatLocalDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function getMonday(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const dow = d.getDay();
  d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
  return formatLocalDate(d);
}
function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + n);
  return formatLocalDate(d);
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
  turni?: Turno[];
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

  const handleAddDouble = useCallback(async (tipo: string) => {
    setSaving(true);
    try {
      const res = await fetch("/flask-api/api/turni", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dipendente_id: info.dipendente_id,
          data: info.data,
          tipo,
          note: "DOPPIO MANUALE",
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const saved: Turno = await res.json();
      toast({ title: "Doppio turno aggiunto", description: `${info.dipendente_nome} — ${tipo}` });
      onSaved(saved);
    } catch {
      toast({ title: "Errore salvataggio doppio", variant: "destructive" });
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
          {info.turni && info.turni.length > 1 && (
            <div className="text-[11px] text-amber-400/80">
              Doppio turno presente: {info.turni.map((t) => CELL[t.tipo]?.label || t.tipo).join(" + ")}
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
            <div className="space-y-2">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Aggiungi doppio turno</div>
              <div className="grid grid-cols-2 gap-2">
                {(["MATTINO", "POMERIGGIO"] as const).map((tipo) => {
                  const c = CELL[tipo];
                  const exists = info.turni?.some((t) => t.tipo === tipo);
                  return (
                    <button
                      key={`double-${tipo}`}
                      disabled={saving || exists}
                      onClick={() => handleAddDouble(tipo)}
                      className={`px-3 py-2 rounded-xl border text-xs font-semibold transition-all disabled:opacity-40 ${c.cls}`}
                    >
                      + {c.label} doppio
                    </button>
                  );
                })}
              </div>
            </div>
          )}

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
  const { theme } = useTheme();
  const isLight = theme === "light";
  const today = formatLocalDate(new Date());
  const canEdit = !!(user?.is_admin || user?.ruolo === "CAPOSALA");

  const [viewMode, setViewMode]   = useState<"settimana" | "mese">("settimana");
  const [layout, setLayout]       = useState<"scorrevole" | "griglia">("scorrevole");
  const [anchorDate, setAnchorDate] = useState(getMonday(today));
  const [turni, setTurni]         = useState<Turno[]>([]);
  const [dipendenti, setDipendenti] = useState<Dipendente[]>([]);
  const [loading, setLoading]     = useState(false);
  const [editCell, setEditCell]   = useState<EditCellInfo | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteStart, setDeleteStart] = useState(today);
  const [deleteEnd, setDeleteEnd] = useState(today);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);

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

  useEffect(() => {
    const onFocus = () => fetchData();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [fetchData]);

  /* ── Pivot: dipendente_id → data → Turno[] ── */
  const pivot = useMemo(() => {
    const map: Record<number, Record<string, Turno[]>> = {};
    turni.forEach((t) => {
      if (!map[t.dipendente_id]) map[t.dipendente_id] = {};
      if (!map[t.dipendente_id][t.data]) map[t.dipendente_id][t.data] = [];
      map[t.dipendente_id][t.data].push(t);
    });
    return map;
  }, [turni]);

  const sortedDip = useMemo(
    () =>
      [...dipendenti]
        .filter((d) => !d.is_admin && d.ruolo !== "CAPOSALA")
        .sort((a, b) => {
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
      setAnchorDate(formatLocalDate(d));
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

  const openDeleteVisiblePeriod = () => {
    setDeleteStart(startStr);
    setDeleteEnd(endStr);
    setDeleteConfirm("");
    setDeleteOpen(true);
  };

  const openDeleteToday = () => {
    setDeleteStart(today);
    setDeleteEnd(today);
    setDeleteConfirm("");
    setDeleteOpen(true);
  };

  const handleDeletePeriod = async () => {
    setDeleteLoading(true);
    try {
      const res = await fetch("/flask-api/api/turni/cancella_periodo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ data_inizio: deleteStart, data_fine: deleteEnd }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast({ title: `${data.eliminati} turni auto-generati eliminati` });
        setDeleteOpen(false);
        setDeleteConfirm("");
        fetchData();
      } else {
        toast({ title: data.errore || "Errore cancellazione", variant: "destructive" });
      }
    } catch {
      toast({ title: "Errore di connessione", variant: "destructive" });
    } finally {
      setDeleteLoading(false);
    }
  };

  /* ── Print ── */
  const handlePrint = () => {
    const SHIFT_STYLE: Record<string, { bg: string; border: string; text: string; label: string }> = {
      MATTINO:    { bg: "#fff9e6", border: "#f59e0b", text: "#92400e", label: "MAT" },
      POMERIGGIO: { bg: "#fff3e0", border: "#f97316", text: "#7c2d12", label: "POM" },
      NOTTE:      { bg: "#ede9fe", border: "#7c3aed", text: "#3b0764", label: "NOT" },
      SMONTO:     { bg: "#f5f3ff", border: "#a78bfa", text: "#4c1d95", label: "SMO" },
      FERIE:      { bg: "#dcfce7", border: "#16a34a", text: "#14532d", label: "FER" },
      MALATTIA:   { bg: "#fee2e2", border: "#dc2626", text: "#7f1d1d", label: "MAL" },
      RIPOSO:     { bg: "#f1f5f9", border: "#94a3b8", text: "#475569", label: "RIP" },
    };

    const headers = dates.map((d) => {
      const { num, name, isSun, isSat } = fmtDay(d);
      const isToday = d === today;
      const dayBg = isToday ? "background:#dbeafe;" : (isSun || isSat) ? "background:#f8fafc;" : "";
      const dayColor = isToday ? "color:#1d4ed8;font-weight:900;" : (isSun || isSat) ? "color:#94a3b8;" : "color:#374151;";
      return `<th style="text-align:center;padding:5px 3px;min-width:36px;${dayBg}${dayColor}border-right:1px solid #e5e7eb;">
        <div style="font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;">${name}</div>
        <div style="font-size:14px;font-weight:900;line-height:1.1;">${num}</div>
      </th>`;
    }).join("");

    // Group employees by role for a cleaner schedule view
    const roleOrder: Record<string, number> = { DEV: 0, CAPOSALA: 1, INFERMIERA: 2, OSS: 3, AUSILIARIO: 4 };
    const grouped = [...sortedDip].sort((a, b) => (roleOrder[a.ruolo] ?? 9) - (roleOrder[b.ruolo] ?? 9));

    let lastRole = "";
    const rows = grouped.map((dip) => {
      let sectionRow = "";
      if (dip.ruolo !== lastRole) {
        lastRole = dip.ruolo;
        const roleLabel = dip.ruolo === "INFERMIERA" ? "Infermieri" : dip.ruolo === "AUSILIARIO" ? "Ausiliari" : dip.ruolo === "OSS" ? "OSS" : dip.ruolo;
        sectionRow = `<tr><td colspan="${dates.length + 1}" style="background:#f1f5f9;padding:5px 10px;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:0.12em;color:#64748b;border-top:2px solid #e2e8f0;">${roleLabel}</td></tr>`;
      }
      const cells = dates.map((d) => {
        const turniCell = pivot[dip.id]?.[d] || [];
        const isToday = d === today;
        const { isSun, isSat } = fmtDay(d);
        const cellBg = isToday ? "background:#eff6ff;" : (isSun || isSat) ? "background:#fafafa;" : "";
        if (!turniCell.length) return `<td style="text-align:center;padding:4px 2px;${cellBg}border-right:1px solid #f1f5f9;color:#cbd5e1;font-size:10px;">·</td>`;
        const badges = turniCell.map((t) => {
          const s = SHIFT_STYLE[t.tipo] || { bg: "#f9fafb", border: "#e5e7eb", text: "#374151", label: t.tipo.slice(0, 3) };
          return `<span style="display:inline-block;margin:1px;padding:2px 5px;border-radius:4px;background:${s.bg};color:${s.text};font-size:9px;font-weight:800;border:1px solid ${s.border};letter-spacing:0.02em;">${s.label}${t.manuale ? "🔒" : ""}</span>`;
        }).join("");
        return `<td style="text-align:center;padding:4px 2px;${cellBg}border-right:1px solid #f1f5f9;">
          ${badges}
        </td>`;
      }).join("");
      const rowBg = "background:#ffffff;";
      return `${sectionRow}<tr style="${rowBg}border-bottom:1px solid #f1f5f9;" onmouseover="this.style.background='#f9fafb'" onmouseout="this.style.background='${rowBg.replace('background:','').replace(';','')}'" >
        <td style="padding:5px 10px;font-weight:600;font-size:11px;white-space:nowrap;border-right:2px solid #e2e8f0;min-width:130px;color:#111827;">${dip.nome}</td>
        ${cells}
      </tr>`;
    }).join("");

    const today_str = new Date().toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
    const html = `<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8">
<title>Griglia Turni — ${periodLabel}</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:'Segoe UI',system-ui,Arial,sans-serif; background:#ffffff; color:#111827; padding:20px; font-size:11px; }
.header { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:14px; padding-bottom:10px; border-bottom:2px solid #e2e8f0; }
.logo { font-size:18px; font-weight:900; color:#059669; letter-spacing:-0.5px; }
.subtitle { font-size:10px; color:#6b7280; margin-top:2px; }
.period { font-size:13px; font-weight:700; color:#111827; text-transform:capitalize; margin-top:3px; }
.print-date { font-size:9px; color:#9ca3af; text-align:right; }
table { border-collapse:collapse; width:100%; font-size:10px; border:1px solid #e2e8f0; border-radius:6px; overflow:hidden; }
thead th { background:#f8fafc; border-bottom:2px solid #e2e8f0; }
thead th:first-child { text-align:left; padding:6px 10px; font-weight:700; color:#374151; }
tbody tr:last-child td { border-bottom:none; }
.legend { display:flex; gap:6px; flex-wrap:wrap; margin-top:14px; align-items:center; }
.leg { padding:2px 8px; border-radius:4px; font-size:9px; font-weight:700; border:1px solid; letter-spacing:0.02em; }
.today-badge { font-size:9px; font-weight:700; color:#1d4ed8; background:#dbeafe; padding:1px 6px; border-radius:10px; }
@media print {
  body { -webkit-print-color-adjust:exact; print-color-adjust:exact; padding:10px; }
  .no-print { display:none; }
}
</style></head><body>
<div class="header">
  <div>
    <div class="logo">SmartShift Pro</div>
    <div class="subtitle">Pianificazione Turni Sanitari</div>
    <div class="period">${periodLabel.charAt(0).toUpperCase() + periodLabel.slice(1)}</div>
  </div>
  <div class="print-date">Stampata il<br>${today_str}</div>
</div>
<table>
  <thead><tr>
    <th style="text-align:left;padding:6px 10px;min-width:130px;border-right:2px solid #e2e8f0;color:#374151;font-size:10px;font-weight:700;">Nominativo</th>
    ${headers}
  </tr></thead>
  <tbody>${rows}</tbody>
</table>
<div class="legend">
  <span style="font-size:9px;color:#6b7280;font-weight:600;margin-right:4px;">Legenda:</span>
  <span class="leg" style="background:#fff9e6;color:#92400e;border-color:#f59e0b;">M Mattino</span>
  <span class="leg" style="background:#fff3e0;color:#7c2d12;border-color:#f97316;">P Pomeriggio</span>
  <span class="leg" style="background:#ede9fe;color:#3b0764;border-color:#7c3aed;">N Notte</span>
  <span class="leg" style="background:#f5f3ff;color:#4c1d95;border-color:#a78bfa;">S Smonto</span>
  <span class="leg" style="background:#dcfce7;color:#14532d;border-color:#16a34a;">FER Ferie</span>
  <span class="leg" style="background:#fee2e2;color:#7f1d1d;border-color:#dc2626;">ML Malattia</span>
  <span class="leg" style="background:#f1f5f9;color:#475569;border-color:#94a3b8;">R Riposo</span>
  <span style="font-size:9px;color:#6b7280;margin-left:8px;">🔒 = turno manuale</span>
  <span class="today-badge" style="margin-left:6px;">Oggi evidenziato in blu</span>
</div>
<script>window.onload = function(){ window.print(); }</script>
</body></html>`;

    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, "_blank");
    if (!win) toast({ title: "Abilita i popup nel browser per stampare", variant: "destructive" });
    else setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  /* ── Cell click ── */
  const handleCellClick = useCallback((dip: Dipendente, data: string) => {
    if (!canEdit) return;
    const turniCell = pivot[dip.id]?.[data] || [];
    setEditCell({
      dipendente_id: dip.id,
      dipendente_nome: dip.nome,
      data,
      turno: turniCell[0],
      turni: turniCell,
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
                  ? isLight ? "bg-emerald-500/15 text-emerald-700 border border-emerald-500/30" : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
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
                  ? isLight ? "bg-emerald-500/15 text-emerald-700 border border-emerald-500/30" : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
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
                    ? isLight ? "bg-emerald-500/15 text-emerald-700 border border-emerald-500/30" : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
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

          {canEdit && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="border-orange-500/30 text-orange-400 hover:bg-orange-500/10 text-xs gap-1.5"
                onClick={openDeleteToday}
                title="Cancella i turni auto-generati di un singolo giorno"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Cancella giorno
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="border-red-500/30 text-red-400 hover:bg-red-500/10 text-xs gap-1.5"
                onClick={openDeleteVisiblePeriod}
                title="Cancella i turni auto-generati del periodo visualizzato"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Cancella periodo
              </Button>
            </>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={handlePrint}
            title="Stampa griglia turni"
            className="border-amber-500/30 text-amber-400 hover:bg-amber-500/10 hover:border-amber-400/50 text-xs gap-1.5"
          >
            <Printer className="h-3.5 w-3.5" />
            Stampa
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
                <th className="sticky left-0 z-20 px-4 py-3 text-left font-bold text-muted-foreground text-[10px] uppercase tracking-wide min-w-[130px] border-r border-white/6" style={{ background: "var(--sticky-col-bg)" }}>
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
                  <td className="sticky left-0 z-10 px-4 py-2.5 border-r border-white/6" style={{ background: "var(--sticky-col-bg)" }}>
                    <div className="flex items-center gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground text-[11px] leading-tight truncate max-w-[90px]">{dip.nome}</p>
                        <RoleBadge role={dip.ruolo} className="mt-0.5" />
                      </div>
                      {dip.is_admin && <span className="text-[8px] font-bold text-amber-400/60 shrink-0">ADM</span>}
                    </div>
                  </td>

                  {dates.map((d) => {
                    const turniCell = pivot[dip.id]?.[d] || [];
                    const isToday = d === today;
                    const { isSun } = fmtDay(d);
                    return (
                      <td
                        key={d}
                        onClick={() => handleCellClick(dip, d)}
                        title={turniCell.length ? turniCell.map((t) => `${t.tipo} — ${t.ore}h${t.manuale ? " (manuale)" : ""}`).join(" + ") : canEdit ? "Clicca per aggiungere turno" : "Nessun turno"}
                        className={`text-center px-0.5 py-2 border-r border-white/4 last:border-r-0 transition-colors ${
                          isToday ? "bg-amber-500/5" : isSun ? "bg-white/[0.008]" : ""
                        } ${canEdit ? "cursor-pointer hover:bg-white/5" : ""}`}
                      >
                        {turniCell.length ? (
                          <div className="flex flex-wrap justify-center gap-0.5">
                            {turniCell.map((turno) => {
                              const cell = CELL[turno.tipo];
                              return (
                                <span key={turno.id} className={`inline-flex items-center justify-center text-[9px] font-bold px-1 py-0.5 rounded border leading-none ${cell.cls} ${
                                  turno.manuale ? "ring-1 ring-amber-400/50" : ""
                                }`}>
                                  {cell.label}
                                  {turno.manuale && <Lock className="h-1.5 w-1.5 ml-0.5 opacity-70" />}
                                </span>
                              );
                            })}
                          </div>
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
              turniCell: pivot[dip.id]?.[d] || [],
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
                    dipWithTurno.map(({ dip, turniCell }) => {
                      const cell = turniCell.length ? CELL[turniCell[0].tipo] : null;
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
                          {turniCell.length ? (
                            <div className="flex gap-0.5 shrink-0">
                              {turniCell.map((turno) => {
                                const c = CELL[turno.tipo];
                                return (
                                  <span key={turno.id} className={`inline-flex items-center text-[9px] font-bold px-1.5 py-0.5 rounded border leading-none ${c.cls} ${
                                    turno.manuale ? "ring-1 ring-amber-400/40" : ""
                                  }`}>
                                    {c.label}
                                    {turno.manuale && <Lock className="h-1.5 w-1.5 ml-0.5 opacity-60" />}
                                  </span>
                                );
                              })}
                            </div>
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

      <Dialog open={deleteOpen} onOpenChange={(open) => { if (!open && !deleteLoading) { setDeleteOpen(false); setDeleteConfirm(""); } }}>
        <DialogContent className="glass-strong border-white/10 max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-400">
              <Trash2 className="h-4 w-4" />
              Cancella turni generati
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground leading-relaxed">
              Elimina tutti i turni <strong className="text-foreground">auto-generati</strong> nel periodo selezionato.
              I turni manuali con lucchetto vengono mantenuti.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">Dal</label>
                <input
                  type="date"
                  value={deleteStart}
                  onChange={(e) => setDeleteStart(e.target.value)}
                  disabled={deleteLoading}
                  className="w-full h-10 rounded-md border border-white/10 bg-white/5 px-3 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">Al</label>
                <input
                  type="date"
                  value={deleteEnd}
                  min={deleteStart}
                  onChange={(e) => setDeleteEnd(e.target.value)}
                  disabled={deleteLoading}
                  className="w-full h-10 rounded-md border border-white/10 bg-white/5 px-3 text-sm"
                />
              </div>
            </div>
            <div className="rounded-xl bg-red-500/8 border border-red-500/20 p-3">
              <p className="text-xs text-red-300">
                Digita <strong className="font-mono">CANCELLA</strong> per confermare.
              </p>
            </div>
            <input
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder="CANCELLA"
              disabled={deleteLoading}
              className="w-full h-10 rounded-md border border-white/10 bg-white/5 px-3 text-sm font-mono text-center tracking-widest"
            />
            <div className="flex gap-3 pt-1">
              <button
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-white/10 text-muted-foreground hover:bg-white/5 transition-all min-h-[44px]"
                onClick={() => { setDeleteOpen(false); setDeleteConfirm(""); }}
                disabled={deleteLoading}
              >
                Annulla
              </button>
              <button
                disabled={deleteConfirm !== "CANCELLA" || deleteLoading || !deleteStart || !deleteEnd}
                onClick={handleDeletePeriod}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-all disabled:opacity-35 disabled:cursor-not-allowed min-h-[44px] flex items-center justify-center gap-2"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {deleteLoading ? "Cancello..." : "Conferma"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
