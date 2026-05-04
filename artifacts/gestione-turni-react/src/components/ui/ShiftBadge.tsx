import { Badge } from "@/components/ui/badge";
import { TipoTurno } from "@/lib/api";

const SHIFT_COLORS: Record<TipoTurno, string> = {
  MATTINO:    "bg-amber-500/15 text-amber-300 border-amber-500/30",
  POMERIGGIO: "bg-orange-500/15 text-orange-300 border-orange-500/30",
  NOTTE:      "bg-indigo-500/20 text-indigo-300 border-indigo-500/40",
  FERIE:      "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  MALATTIA:   "bg-red-500/15 text-red-300 border-red-500/30",
  RIPOSO:     "bg-slate-500/15 text-slate-400 border-slate-500/30",
};

const SHIFT_LABELS: Record<TipoTurno, string> = {
  MATTINO:    "Mattino",
  POMERIGGIO: "Pomeriggio",
  NOTTE:      "Notte",
  FERIE:      "Ferie",
  MALATTIA:   "Malattia",
  RIPOSO:     "Riposo",
};

export function ShiftBadge({ type, className = "" }: { type: TipoTurno | string; className?: string }) {
  const colorClass = SHIFT_COLORS[type as TipoTurno] || "bg-slate-500/15 text-slate-400 border-slate-500/30";
  const label = SHIFT_LABELS[type as TipoTurno] || type;
  return (
    <Badge variant="outline" className={`${colorClass} font-medium ${className}`}>
      {label}
    </Badge>
  );
}
