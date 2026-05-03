import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity } from "lucide-react";
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
        credentials: "include"
      });
      const data = await res.json();
      
      if (res.ok && data.success) {
        login(data);
      } else {
        toast({
          title: "Login fallito",
          description: data.error || "Credenziali non valide",
          variant: "destructive"
        });
      }
    } catch (err) {
      toast({
        title: "Errore di connessione",
        description: "Impossibile connettersi al server",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-md shadow-lg border-0">
        <CardHeader className="space-y-2 text-center pb-8">
          <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-2">
            <Activity className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight">Gestione Turni</CardTitle>
          <CardDescription>
            Accedi per gestire i tuoi turni e scambi
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input 
                id="username" 
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="es. Carmen"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input 
                id="password" 
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
            <Button type="submit" className="w-full mt-6" disabled={loading}>
              {loading ? "Accesso in corso..." : "Accedi"}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex justify-center text-sm text-gray-500 border-t pt-6">
          Area Riservata Personale Sanitario
        </CardFooter>
      </Card>
    </div>
  );
}
