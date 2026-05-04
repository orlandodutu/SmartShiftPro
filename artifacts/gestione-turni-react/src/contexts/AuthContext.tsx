import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Dipendente } from "../lib/api";
import { useLocation } from "wouter";

interface AuthContextType {
  user: Dipendente | null;
  isLoading: boolean;
  login: (user: Dipendente) => void;
  logout: () => void;
  updateUser: (user: Dipendente) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Dipendente | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [, setLocation] = useLocation();

  useEffect(() => {
    fetch("/flask-api/api/me", { credentials: "include" })
      .then((res) => {
        if (res.ok) return res.json();
        throw new Error("Not logged in");
      })
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setIsLoading(false));
  }, []);

  const login = (u: Dipendente) => {
    setUser(u);
    setLocation("/dashboard");
  };

  const logout = () => {
    fetch("/flask-api/api/logout", { method: "POST", credentials: "include" }).finally(() => {
      setUser(null);
      setLocation("/login");
    });
  };

  const updateUser = (u: Dipendente) => setUser(u);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}
