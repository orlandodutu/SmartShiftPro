import { useEffect, useState } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import NotFound from "@/pages/not-found";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Turni from "@/pages/Turni";
import Genera from "@/pages/Genera";
import Scambi from "@/pages/Scambi";
import Caposala from "@/pages/Caposala";
import Monitor from "@/pages/Monitor";
import { AppLayout } from "@/components/layout/AppLayout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { KeyRound, ShieldCheck } from "lucide-react";

const queryClient = new QueryClient();

/* ── First-login password change modal ── */
function PasswordChangeModal() {
  const { user, updateUser } = useAuth();
  const { toast } = useToast();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [loading, setLoading] = useState(false);

  if (!user || user.password_changed) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.length < 6) {
      toast({ title: "Minimo 6 caratteri", variant: "destructive" }); return;
    }
    if (pw !== pw2) {
      toast({ title: "Le password non coincidono", variant: "destructive" }); return;
    }
    setLoading(true);
    try {
      const res = await fetch("/flask-api/api/change_password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ new_password: pw }),
      });
      if (res.ok) {
        const updated = await res.json();
        updateUser(updated);
        toast({ title: "Password aggiornata con successo" });
      } else {
        const err = await res.json();
        toast({ title: err.errore || "Errore", variant: "destructive" });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="glass-strong rounded-3xl p-10 w-full max-w-sm text-center shadow-2xl border border-white/10">
        <div className="mb-6 inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-amber-500/15 text-amber-400 mx-auto">
          <KeyRound className="h-7 w-7" />
        </div>
        <h2 className="text-xl font-bold text-foreground mb-1">Imposta la tua Password</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Benvenuto/a <strong className="text-foreground">{user.nome}</strong>! Per la sicurezza, scegli una password personale prima di continuare.
        </p>
        <form onSubmit={handleSubmit} className="space-y-3 text-left">
          <div className="space-y-1.5">
            <Label className="text-muted-foreground text-xs">Nuova password</Label>
            <Input
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="Minimo 6 caratteri"
              required
              minLength={6}
              className="bg-black/20 border-white/10 focus:border-amber-400"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-muted-foreground text-xs">Conferma password</Label>
            <Input
              type="password"
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              placeholder="Ripeti la password"
              required
              className="bg-black/20 border-white/10 focus:border-amber-400"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-3 rounded-xl font-bold text-sm uppercase tracking-widest glow-gold disabled:opacity-50 flex items-center justify-center gap-2"
            style={{ background: "linear-gradient(135deg, #f59e0b, #d97706)", color: "#0f172a" }}
          >
            <ShieldCheck className="h-4 w-4" />
            {loading ? "Salvataggio..." : "Salva e Continua"}
          </button>
        </form>
      </div>
    </div>
  );
}

function ProtectedRoute({ component: Component, adminOnly = false }: { component: React.ComponentType; adminOnly?: boolean }) {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !user) setLocation("/login");
  }, [user, isLoading, setLocation]);

  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-400" />
    </div>
  );
  if (!user) return null;
  if (adminOnly && !user.is_admin) return (
    <AppLayout>
      <div className="p-10 text-center text-muted-foreground">Accesso riservato all'amministratore.</div>
    </AppLayout>
  );

  return (
    <AppLayout>
      <PasswordChangeModal />
      <Component />
    </AppLayout>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/" component={() => <ProtectedRoute component={Dashboard} />} />
      <Route path="/dashboard" component={() => <ProtectedRoute component={Dashboard} />} />
      <Route path="/turni" component={() => <ProtectedRoute component={Turni} />} />
      <Route path="/scambi" component={() => <ProtectedRoute component={Scambi} />} />
      <Route path="/genera" component={() => <ProtectedRoute component={Genera} />} />
      <Route path="/caposala" component={() => <ProtectedRoute component={Caposala} />} />
      <Route path="/monitor" component={() => <ProtectedRoute component={Monitor} adminOnly />} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AuthProvider>
            <Router />
          </AuthProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
