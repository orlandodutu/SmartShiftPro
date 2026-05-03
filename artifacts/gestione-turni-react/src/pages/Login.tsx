import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const { toast } = useToast();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/flask-api/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
        credentials: "include",
      });
      const data = await res.json();
      if (res.ok && data.success) {
        login(data);
      } else {
        toast({
          title: "Accesso negato",
          description: "Username o password non validi",
          variant: "destructive",
        });
      }
    } catch {
      toast({ title: "Errore di connessione", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      {/* Glass card */}
      <div className="glass-strong rounded-3xl shadow-2xl w-full max-w-sm p-10 text-center">
        {/* Logo */}
        <div className="mb-8">
          <h1 className="text-4xl font-black tracking-tight mb-1">
            Smart<span className="text-gold">Shift</span>
          </h1>
          <p className="text-xs font-semibold tracking-[0.25em] text-muted-foreground uppercase">
            Pro Management System
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-3">
          <Input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
            required
            autoComplete="username"
            className="bg-black/20 border-white/10 text-foreground placeholder:text-muted-foreground focus:border-amber-400 focus:ring-amber-400/30 rounded-xl h-12 text-center"
            data-testid="login-username"
          />
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            required
            autoComplete="current-password"
            className="bg-black/20 border-white/10 text-foreground placeholder:text-muted-foreground focus:border-amber-400 focus:ring-amber-400/30 rounded-xl h-12 text-center"
            data-testid="login-password"
          />

          <button
            type="submit"
            disabled={loading}
            data-testid="login-submit"
            className="w-full mt-2 h-12 rounded-xl font-bold text-sm uppercase tracking-widest transition-all disabled:opacity-60 glow-gold"
            style={{
              background: "linear-gradient(135deg, #f59e0b, #d97706)",
              color: "#0f172a",
            }}
          >
            {loading ? "Accesso..." : "Accedi"}
          </button>
        </form>

        <p className="text-xs text-muted-foreground mt-8 opacity-60">
          Area Riservata Personale Sanitario
        </p>
      </div>
    </div>
  );
}
