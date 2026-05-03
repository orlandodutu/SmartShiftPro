import { Badge } from "@/components/ui/badge";
import { Ruolo } from "@/lib/api";

const ROLE_COLORS: Record<Ruolo, string> = {
  OSS: "bg-blue-100 text-blue-800 hover:bg-blue-200 border-blue-200",
  INFERMIERA: "bg-teal-100 text-teal-800 hover:bg-teal-200 border-teal-200",
  PULIZIE: "bg-amber-100 text-amber-800 hover:bg-amber-200 border-amber-200",
  DEV: "bg-indigo-100 text-indigo-800 hover:bg-indigo-200 border-indigo-200",
  CAPOSALA: "bg-rose-100 text-rose-800 hover:bg-rose-200 border-rose-200"
};

export function RoleBadge({ role, className = "" }: { role: Ruolo | string, className?: string }) {
  const colorClass = ROLE_COLORS[role as Ruolo] || "bg-gray-100 text-gray-800 border-gray-200";
  return (
    <Badge variant="outline" className={`${colorClass} font-medium ${className}`}>
      {role}
    </Badge>
  );
}
