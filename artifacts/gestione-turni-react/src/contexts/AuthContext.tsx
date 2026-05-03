import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Dipendente } from "../lib/api";
import { useLocation } from "wouter";

interface AuthContextType {
  user: Dipendente | null;
  isLoading: boolean;
  login: (user: Dipendente) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Dipendente | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [, setLocation] = useLocation();

  useEffect(() => {
    fetch("/flask-api/api/me", { credentials: "include" })
      .then((res) => {
        if (res.ok) {
          return res.json();
        }
        throw new Error("Not logged in");
      })
      .then((data) => {
        setUser(data);
      })
      .catch(() => {
        setUser(null);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  const login = (user: Dipendente) => {
    setUser(user);
    setLocation("/dashboard");
  };

  const logout = () => {
    fetch("/flask-api/api/logout", { method: "POST", credentials: "include" })
      .finally(() => {
        setUser(null);
        setLocation("/login");
      });
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
