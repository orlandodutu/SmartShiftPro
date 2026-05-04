import { Badge } from "@/components/ui/badge";
import { TipoTurno } from "@/lib/api";

const SHIFT_COLORS: Record<string, string> = {
  MATTINO:    "bg-amber-500/15 text-amber-300 border-amber-500/30",
  POMERIGGIO: "bg-orange-500/15 text-orange-300 border-orange-500/30",
  NOTTE:      "bg-indigo-500/20 text-indigo-300 border-indigo-500/40",
  SMONTO:     "bg-violet-500/15 text-violet-300 border-violet-500/30",
  FERIE:      "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  MALATTIA:   "bg-red-500/15 text-red-300 border-red-500/30",
  RIPOSO:     "bg-slate-500/15 text-slate-400 border-slate-500/30",
};

const SHIFT_LABELS: Record<string, string> = {
  MATTINO:    "Mattino",
  POMERIGGIO: "Pomeriggio",
  NOTTE:      "Notte",
  SMONTO:     "Smonto",
  FERIE:      "Ferie",
  MALATTIA:   "Malattia",
  RIPOSO:     "Riposo",
};

export function ShiftBadge({ type, className = "" }: { type: TipoTurno | string; className?: string }) {
  const colorClass = SHIFT_COLORS[type] || "bg-slate-500/15 text-slate-400 border-slate-500/30";
  const label = SHIFT_LABELS[type] || type;
  return (
    <Badge variant="outline" className={`${colorClass} font-medium ${className}`}>
      {label}
    </Badge>
  );
}
