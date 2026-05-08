import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { CalendarDays, LayoutDashboard, Wand2, LogOut, ShieldAlert, LayoutGrid, Archive, Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RoleBadge } from "@/components/ui/RoleBadge";
import type { Ruolo } from "@/lib/api";

const ROLE_BG_GLOW_DARK: Record<Ruolo, string> = {
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

const ROLE_AVATAR_LIGHT: Record<Ruolo, string> = {
  OSS:        "bg-blue-100 text-blue-700",
  INFERMIERA: "bg-emerald-100 text-emerald-700",
  AUSILIARIO: "bg-amber-100 text-amber-700",
  DEV:        "bg-indigo-100 text-indigo-700",
  CAPOSALA:   "bg-teal-100 text-teal-700",
};

export function AppLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [location] = useLocation();
  const role = (user?.ruolo ?? "DEV") as Ruolo;

  const isLight = theme === "light";

  const sidebarStyle = isLight
    ? { background: "rgba(240,250,245,0.97)", backdropFilter: "none", borderColor: "rgba(5,150,105,0.14)" }
    : { background: "rgba(8,12,23,0.85)", backdropFilter: "blur(16px)", borderColor: "rgba(255,255,255,0.07)" };

  const borderStyle = isLight
    ? { borderColor: "rgba(5,150,105,0.12)" }
    : { borderColor: "rgba(255,255,255,0.07)" };

  const mainBg = isLight
    ? `radial-gradient(ellipse at 75% 8%, rgba(5,150,105,0.04) 0%, transparent 55%),
       radial-gradient(ellipse at 20% 90%, rgba(5,150,105,0.03) 0%, transparent 45%)`
    : `radial-gradient(ellipse at 75% 8%, ${ROLE_BG_GLOW_DARK[role] ?? ROLE_BG_GLOW_DARK.DEV} 0%, transparent 55%),
       radial-gradient(ellipse at 20% 90%, ${ROLE_BG_GLOW_DARK[role] ?? ROLE_BG_GLOW_DARK.DEV} 0%, transparent 45%)`;

  const activeNavClass = isLight
    ? "bg-emerald-500/12 text-emerald-700 border border-emerald-500/22"
    : "bg-amber-500/15 text-amber-400 border border-amber-500/20";

  const activeIconClass = isLight ? "text-emerald-600" : "text-amber-400";
  const inactiveNavClass = isLight
    ? "text-slate-600 hover:text-slate-900 hover:bg-emerald-500/8"
    : "text-muted-foreground hover:text-foreground hover:bg-white/5";

  const avatarClass = isLight
    ? (ROLE_AVATAR_LIGHT[role] ?? ROLE_AVATAR_LIGHT.DEV)
    : (ROLE_AVATAR[role] ?? ROLE_AVATAR.DEV);

  const navItems = [
    { href: "/dashboard",  label: "Dashboard",    icon: LayoutDashboard },
    { href: "/turni",      label: "Turni",         icon: CalendarDays    },
    { href: "/genera",     label: "Genera Turni",  icon: Wand2           },
    { href: "/griglia",    label: "Griglia",       icon: LayoutGrid      },
    { href: "/archivio",   label: "Archivio",      icon: Archive         },
    { href: "/caposala",   label: "Gestione",      icon: ShieldAlert     },
  ];

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="w-full md:w-60 flex flex-col border-r" style={sidebarStyle}>

        {/* Brand */}
        <div className="px-5 py-5 border-b" style={borderStyle}>
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
                  background: isLight ? "rgba(255,191,0,0.12)" : "rgba(255,191,0,0.09)",
                  border: "1px solid rgba(255,191,0,0.28)",
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
              <h1 className={`text-base font-black leading-none ${isLight ? "text-slate-800" : ""}`}>
                Smart<span className="text-gold">Shift</span>
              </h1>
              <p className={`text-[10px] tracking-widest uppercase mt-0.5 ${isLight ? "text-slate-500" : "text-muted-foreground"}`}>Pro</p>
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
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  isActive ? activeNavClass : inactiveNavClass
                }`}
              >
                <item.icon className={`h-4 w-4 shrink-0 ${isActive ? activeIconClass : (isLight ? "text-slate-500" : "text-muted-foreground")}`} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Theme toggle */}
        <div className="px-3 pb-2">
          <button
            onClick={toggleTheme}
            className={`theme-toggle w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
              isLight
                ? "text-slate-600 hover:text-slate-900 hover:bg-emerald-500/8 border border-emerald-500/12"
                : "text-muted-foreground hover:text-foreground hover:bg-white/5 border border-white/6"
            }`}
            title={isLight ? "Passa al tema scuro" : "Passa al tema chiaro"}
          >
            <span className="relative h-4 w-4 shrink-0">
              <Sun
                className={`theme-toggle-icon absolute inset-0 h-4 w-4 transition-all duration-300 ${
                  isLight ? "opacity-0 scale-50 rotate-90" : "opacity-100 scale-100 rotate-0"
                }`}
              />
              <Moon
                className={`theme-toggle-icon absolute inset-0 h-4 w-4 transition-all duration-300 ${
                  isLight ? "opacity-100 scale-100 rotate-0" : "opacity-0 scale-50 -rotate-90"
                }`}
              />
            </span>
            {isLight ? "Tema Notte" : "Tema Giorno"}
          </button>
        </div>

        {/* User section */}
        <div className="p-4 border-t" style={borderStyle}>
          <div className="flex items-center gap-3 mb-3">
            <div className={`h-9 w-9 rounded-xl ${avatarClass} flex items-center justify-center text-sm font-bold shrink-0`}>
              {user?.nome.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-semibold truncate leading-tight ${isLight ? "text-slate-800" : "text-foreground"}`}>
                {user?.nome}
              </p>
              <div className="mt-1">
                <RoleBadge role={user?.ruolo ?? "DEV"} className="text-xs" />
              </div>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className={`w-full justify-start text-xs ${isLight ? "text-slate-500 hover:text-slate-800 hover:bg-red-50" : "text-muted-foreground hover:text-foreground"}`}
            onClick={logout}
          >
            <LogOut className="h-3.5 w-3.5 mr-2" />
            Esci
          </Button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto min-h-screen" style={{ background: mainBg }}>
        {children}
      </main>
    </div>
  );
}
