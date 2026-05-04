import { Badge } from "@/components/ui/badge";
import { Ruolo } from "@/lib/api";

const ROLE_COLORS: Record<Ruolo, string> = {
  OSS:        "bg-blue-500/15 text-blue-300 border-blue-500/30",
  INFERMIERA: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  AUSILIARIO: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  DEV:        "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
  CAPOSALA:   "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
};

const ROLE_LABELS: Record<Ruolo, string> = {
  OSS:        "OSS",
  INFERMIERA: "INF",
  AUSILIARIO: "AUS",
  DEV:        "DEV",
  CAPOSALA:   "CAP",
};

export function RoleBadge({ role, className = "" }: { role: Ruolo | string; className?: string }) {
  const colorClass = ROLE_COLORS[role as Ruolo] || "bg-slate-500/15 text-slate-300 border-slate-500/30";
  const label = ROLE_LABELS[role as Ruolo] || role;
  return (
    <Badge variant="outline" className={`${colorClass} font-medium text-[10px] px-1.5 py-0 ${className}`}>
      {label}
    </Badge>
  );
}
