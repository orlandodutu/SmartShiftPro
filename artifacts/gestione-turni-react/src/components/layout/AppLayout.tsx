import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { CalendarDays, LayoutDashboard, Shuffle, Wand2, LogOut, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RoleBadge } from "@/components/ui/RoleBadge";
import type { Ruolo } from "@/lib/api";

const ROLE_AVATAR: Record<Ruolo, string> = {
  OSS:        "bg-blue-100 text-blue-700",
  INFERMIERA: "bg-emerald-100 text-emerald-700",
  PULIZIE:    "bg-amber-100 text-amber-700",
  DEV:        "bg-indigo-100 text-indigo-700",
  CAPOSALA:   "bg-yellow-100 text-yellow-700",
};

const ROLE_DOT: Record<Ruolo, string> = {
  OSS:        "bg-blue-400",
  INFERMIERA: "bg-emerald-400",
  PULIZIE:    "bg-amber-400",
  DEV:        "bg-indigo-400",
  CAPOSALA:   "bg-yellow-400",
};

export function AppLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const role = (user?.ruolo ?? "OSS") as Ruolo;
  const avatarClass = ROLE_AVATAR[role] ?? ROLE_AVATAR.OSS;
  const dotClass = ROLE_DOT[role] ?? ROLE_DOT.OSS;

  const navItems = [
    { href: "/dashboard", label: "Dashboard",    icon: LayoutDashboard },
    { href: "/turni",     label: "Turni",         icon: CalendarDays    },
    { href: "/scambi",    label: "Scambi",         icon: Shuffle         },
    { href: "/genera",    label: "Genera Turni",  icon: Wand2           },
  ];

  if (user?.ruolo === "CAPOSALA") {
    navItems.push({ href: "/caposala", label: "Area Caposala", icon: ShieldAlert });
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="w-full md:w-64 bg-white border-r border-gray-100 flex flex-col shadow-sm">
        {/* Brand */}
        <div className="px-6 py-5 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className={`h-8 w-8 rounded-lg ${dotClass} flex items-center justify-center`}>
              <CalendarDays className="h-4 w-4 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold text-gray-900 leading-none">Gestione Turni</h1>
              <p className="text-xs text-gray-400 mt-0.5">Health Coordinator</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {navItems.map((item) => {
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  isActive
                    ? "bg-primary/8 text-primary font-semibold"
                    : "text-gray-500 hover:bg-gray-50 hover:text-gray-800"
                }`}
              >
                <item.icon className={`h-4 w-4 shrink-0 ${isActive ? "text-primary" : "text-gray-400"}`} />
                {item.label}
                {item.href === "/caposala" && (
                  <span className={`ml-auto h-1.5 w-1.5 rounded-full ${dotClass}`} />
                )}
              </Link>
            );
          })}
        </nav>

        {/* User section */}
        <div className="p-4 border-t border-gray-100">
          <div className="flex items-center gap-3 mb-3">
            <div className={`h-9 w-9 rounded-xl ${avatarClass} flex items-center justify-center text-sm font-bold shrink-0`}>
              {user?.nome.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate leading-tight">{user?.nome}</p>
              <div className="mt-1">
                <RoleBadge role={user?.ruolo ?? "OSS"} className="text-xs" />
              </div>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-gray-400 hover:text-gray-700 text-xs"
            onClick={logout}
          >
            <LogOut className="h-3.5 w-3.5 mr-2" />
            Esci
          </Button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto min-h-screen">
        {children}
      </main>
    </div>
  );
}
