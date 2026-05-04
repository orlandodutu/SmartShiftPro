import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { CalendarDays, LayoutDashboard, Shuffle, Wand2, LogOut, ShieldAlert, Activity, LayoutGrid, Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RoleBadge } from "@/components/ui/RoleBadge";
import type { Ruolo } from "@/lib/api";
import { useSwapNotifications } from "@/hooks/useSwapNotifications";

const ROLE_BG_GLOW: Record<Ruolo, string> = {
  OSS:        "rgba(59,130,246,0.055)",
  INFERMIERA: "rgba(16,185,129,0.055)",
  AUSILIARIO: "rgba(245,158,11,0.055)",
  DEV:        "rgba(99,102,241,0.055)",
  CAPOSALA:   "rgba(234,179,8,0.055)",
};

const ROLE_AVATAR: Record<Ruolo, string> = {
  OSS:        "bg-blue-900/60 text-blue-300",
  INFERMIERA: "bg-emerald-900/60 text-emerald-300",
  AUSILIARIO: "bg-amber-900/60 text-amber-300",
  DEV:        "bg-indigo-900/60 text-indigo-300",
  CAPOSALA:   "bg-yellow-900/60 text-yellow-300",
};

const ROLE_DOT: Record<Ruolo, string> = {
  OSS:        "bg-blue-400",
  INFERMIERA: "bg-emerald-400",
  AUSILIARIO: "bg-amber-400",
  DEV:        "bg-indigo-400",
  CAPOSALA:   "bg-yellow-400",
};

export function AppLayout({ children }: { children: ReactNode }) {
  useSwapNotifications();
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const role = (user?.ruolo ?? "OSS") as Ruolo;
  const avatarClass = ROLE_AVATAR[role] ?? ROLE_AVATAR.OSS;
  const dotClass = ROLE_DOT[role] ?? ROLE_DOT.OSS;

  const navItems = [
    { href: "/dashboard", label: "Dashboard",    icon: LayoutDashboard },
    { href: "/turni",     label: "Turni",         icon: CalendarDays    },
    { href: "/scambi",    label: "Scambi",         icon: Shuffle         },
  ];

  if (user?.ruolo === "CAPOSALA" || user?.is_admin) {
    navItems.push({ href: "/genera",   label: "Genera Turni", icon: Wand2      });
    navItems.push({ href: "/griglia",  label: "Griglia",      icon: LayoutGrid });
    navItems.push({ href: "/archivio", label: "Archivio",     icon: Archive    });
  }
  if (user?.ruolo === "CAPOSALA") {
    navItems.push({ href: "/caposala", label: "Area Caposala", icon: ShieldAlert });
  }
  if (user?.is_admin) {
    navItems.push({ href: "/monitor", label: "Monitor",       icon: Activity });
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside
        className="w-full md:w-60 flex flex-col border-r"
        style={{
          background: "rgba(8, 12, 23, 0.85)",
          backdropFilter: "blur(16px)",
          borderColor: "rgba(255,255,255,0.07)",
        }}
      >
        {/* Brand */}
        <div className="px-5 py-5 border-b" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
          <div className="flex items-center gap-2.5">
            <div className="relative shrink-0">
              <div
                className="absolute inset-0 rounded-xl"
                style={{
                  background: "radial-gradient(circle, rgba(255,191,0,0.55) 0%, transparent 70%)",
                  filter: "blur(10px)",
                  transform: "scale(1.6)",
                }}
              />
              <div
                className="relative h-8 w-8 rounded-xl flex items-center justify-center"
                style={{
                  background: "rgba(255,191,0,0.09)",
                  border: "1px solid rgba(255,191,0,0.25)",
                }}
              >
                <span
                  className="text-[13px] text-amber-400"
                  style={{ fontFamily: "'Inter', sans-serif", fontWeight: 300, letterSpacing: "-0.5px" }}
                >
                  SS
                </span>
              </div>
            </div>
            <div>
              <h1 className="text-base font-black leading-none">
                Smart<span className="text-gold">Shift</span>
              </h1>
              <p className="text-[10px] text-muted-foreground tracking-widest uppercase mt-0.5">Pro</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {navItems.map((item) => {
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            const isMonitor = item.href === "/monitor";
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  isActive
                    ? isMonitor
                      ? "bg-indigo-500/15 text-indigo-400 border border-indigo-500/20"
                      : "bg-amber-500/15 text-amber-400 border border-amber-500/20"
                    : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                }`}
              >
                <item.icon className={`h-4 w-4 shrink-0 ${
                  isActive ? (isMonitor ? "text-indigo-400" : "text-amber-400") : "text-muted-foreground"
                }`} />
                {item.label}
                {item.href === "/caposala" && (
                  <span className={`ml-auto h-1.5 w-1.5 rounded-full ${dotClass}`} />
                )}
                {isMonitor && !isActive && (
                  <span className="ml-auto h-1.5 w-1.5 rounded-full bg-indigo-400 animate-pulse" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* User section */}
        <div className="p-4 border-t" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
          <div className="flex items-center gap-3 mb-3">
            <div className={`h-9 w-9 rounded-xl ${avatarClass} flex items-center justify-center text-sm font-bold shrink-0`}>
              {user?.nome.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground truncate leading-tight">{user?.nome}</p>
              <div className="mt-1">
                <RoleBadge role={user?.ruolo ?? "OSS"} className="text-xs" />
              </div>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-muted-foreground hover:text-foreground text-xs"
            onClick={logout}
          >
            <LogOut className="h-3.5 w-3.5 mr-2" />
            Esci
          </Button>
        </div>
      </aside>

      {/* Main */}
      <main
        className="flex-1 overflow-auto min-h-screen"
        style={{
          background: `radial-gradient(ellipse at 75% 8%, ${ROLE_BG_GLOW[role] ?? ROLE_BG_GLOW.OSS} 0%, transparent 55%),
                       radial-gradient(ellipse at 20% 90%, ${ROLE_BG_GLOW[role] ?? ROLE_BG_GLOW.OSS} 0%, transparent 45%)`,
        }}
      >
        {children}
      </main>
    </div>
  );
}
