import { createContext, useContext, useEffect, useState, ReactNode } from "react";

type Theme = "dark" | "light";

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const THEME_KEY    = "ss-theme";
const THEME_VER    = "ss-theme-v";
const CURRENT_VER  = "2";

const ThemeContext = createContext<ThemeContextType>({ theme: "light", toggleTheme: () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    const savedVer = localStorage.getItem(THEME_VER);
    if (savedVer !== CURRENT_VER) {
      localStorage.setItem(THEME_KEY, "light");
      localStorage.setItem(THEME_VER, CURRENT_VER);
      return "light";
    }
    return (localStorage.getItem(THEME_KEY) as Theme) ?? "light";
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "light") {
      root.setAttribute("data-theme", "light");
    } else {
      root.removeAttribute("data-theme");
    }
    localStorage.setItem(THEME_KEY, theme);
    localStorage.setItem(THEME_VER, CURRENT_VER);
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
