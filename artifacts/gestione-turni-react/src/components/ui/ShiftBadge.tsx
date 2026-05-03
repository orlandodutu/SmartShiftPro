import { Badge } from "@/components/ui/badge";
import { TipoTurno } from "@/lib/api";

const SHIFT_COLORS: Record<TipoTurno, string> = {
  MATTINO: "bg-yellow-100 text-yellow-800 hover:bg-yellow-200 border-yellow-200",
  POMERIGGIO: "bg-orange-100 text-orange-800 hover:bg-orange-200 border-orange-200",
  NOTTE: "bg-slate-800 text-white hover:bg-slate-700 border-slate-700",
  FERIE: "bg-green-100 text-green-800 hover:bg-green-200 border-green-200",
  MALATTIA: "bg-red-100 text-red-800 hover:bg-red-200 border-red-200",
  RIPOSO: "bg-gray-100 text-gray-800 hover:bg-gray-200 border-gray-200"
};

export function ShiftBadge({ type, className = "" }: { type: TipoTurno | string, className?: string }) {
  const colorClass = SHIFT_COLORS[type as TipoTurno] || "bg-gray-100 text-gray-800 border-gray-200";
  return (
    <Badge variant="outline" className={`${colorClass} font-medium ${className}`}>
      {type}
    </Badge>
  );
}
