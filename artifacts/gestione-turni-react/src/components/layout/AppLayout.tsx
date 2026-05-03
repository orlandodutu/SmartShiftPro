import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { CalendarDays, LayoutDashboard, Shuffle, Wand2, LogOut, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RoleBadge } from "@/components/ui/RoleBadge";

export function AppLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const [location] = useLocation();

  const navItems = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/turni", label: "Turni", icon: CalendarDays },
    { href: "/scambi", label: "Scambi", icon: Shuffle },
    { href: "/genera", label: "Genera Turni", icon: Wand2 },
  ];

  if (user?.ruolo === 'CAPOSALA') {
    navItems.push({ href: "/caposala", label: "Caposala", icon: ShieldAlert });
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="w-full md:w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-6 border-b border-gray-200">
          <h1 className="text-xl font-bold text-gray-900 tracking-tight">Gestione Turni</h1>
          <p className="text-sm text-gray-500 mt-1">Health Coordinator</p>
        </div>
        
        <div className="p-4 flex-1">
          <nav className="space-y-1">
            {navItems.map((item) => {
              const isActive = location === item.href;
              return (
                <Link key={item.href} href={item.href} className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${isActive ? 'bg-primary/10 text-primary font-medium' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`}>
                  <item.icon className="h-5 w-5" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="p-4 border-t border-gray-200">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                {user?.nome.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{user?.nome}</p>
                <div className="mt-0.5">
                  <RoleBadge role={user?.ruolo || 'OSS'} />
                </div>
              </div>
            </div>
            <Button variant="ghost" className="w-full justify-start text-gray-500" onClick={logout}>
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
