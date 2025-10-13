import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

type Theme = "dark" | "light" | "system";

interface ThemeContextType {
  theme: Theme;
  isDark: boolean;
  setTheme: (theme: Theme) => void;
}

const DEFAULT_THEME: Theme = "system";
const MEDIA = "(prefers-color-scheme: dark)";

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function isTheme(value: string | null): value is Theme {
  return (
    typeof value === "string" && ["dark", "light", "system"].includes(value)
  );
}

function getSavedTheme() {
  if (typeof window === "undefined") {
    return DEFAULT_THEME;
  }

  try {
    const theme = localStorage.getItem("theme");

    if (theme && isTheme(theme)) {
      return theme;
    }

    return DEFAULT_THEME;
  } catch (e) {
    // do nothing
  }

  return DEFAULT_THEME;
}

function getIsSystemDark() {
  if (typeof window === "undefined") {
    return false;
  }

  return window.matchMedia(MEDIA).matches;
}

// This is to disable animation temporaly when the theme is changed.
const disableAnimation = () => {
  const css = document.createElement("style");
  css.appendChild(
    document.createTextNode(
      `*,*::before,*::after{-webkit-transition:none!important;-moz-transition:none!important;-o-transition:none!important;-ms-transition:none!important;transition:none!important}`
    )
  );
  document.head.appendChild(css);

  return () => {
    // Force restyle
    window.getComputedStyle(document.body);

    // Wait for next animation frame before removing the disable transition CSS
    requestAnimationFrame(() => {
      document.head.removeChild(css);
    });
  };
};

// This is to avoid rendering the light theme first when the user has dark theme.
// We want to run this before React hydration in the browser's global scope,
// so we should not rely on any external variables.
// TODO (05/12/2025 yuka) I'm not sure how to minify at build time, using manually minified script for now.
const minifiedThemeScript = `function(){try{const theme=localStorage.getItem("theme")||"system";const isDark=theme==="dark"||(theme==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);if(isDark){document.documentElement.classList.add("dark");document.documentElement.classList.add("s-dark")}}catch(e){}}`;

const ThemeScript = memo(function ThemeInitScript() {
  return (
    <script
      dangerouslySetInnerHTML={{ __html: `(${minifiedThemeScript})()` }}
    />
  );
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => getSavedTheme());
  const [isDark, setIsDark] = useState(() =>
    theme === "system" ? getIsSystemDark() : theme === "dark"
  );

  const updateTheme = useCallback((theme: Theme) => {
    const mediaQuery = window.matchMedia(MEDIA);

    const nextIsDark =
      theme === "dark" || (theme === "system" && mediaQuery.matches);

    setIsDark(nextIsDark);

    const restoreAnimation = disableAnimation();
    document.documentElement.classList.toggle("dark", nextIsDark);
    document.documentElement.classList.toggle("s-dark", nextIsDark);

    if (nextIsDark) {
      document.body.classList.add("bg-background-night");
    } else {
      document.body.classList.remove("bg-background-night");
    }
    restoreAnimation();
  }, []);

  const handleSystemChange = useCallback(() => {
    if (theme === "system") {
      updateTheme(theme);
    }
  }, [theme, updateTheme]);

  const handleThemeChange = useCallback(
    (newTheme: Theme) => {
      setTheme(newTheme);
      localStorage.setItem("theme", newTheme);
    },
    [setTheme]
  );

  useEffect(() => {
    updateTheme(theme);
  }, [theme, updateTheme]);

  // system theme change event handling
  useEffect(() => {
    const mediaQuery = window.matchMedia(MEDIA);

    mediaQuery.addEventListener("change", handleSystemChange);
    return () => mediaQuery.removeEventListener("change", handleSystemChange);
  }, [handleSystemChange]);

  // localStorage event handling
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key !== "theme") {
        return;
      }

      // if localstorage is null (e.g. localstorage data is deleted), set default theme
      if (!e.newValue) {
        setTheme(DEFAULT_THEME);
      } else {
        if (isTheme(e.newValue)) {
          setTheme(e.newValue);
        }
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [setTheme]);

  const value = useMemo(
    () => ({ theme, isDark, setTheme: handleThemeChange }),
    [theme, isDark, handleThemeChange]
  );

  return (
    <ThemeContext.Provider value={value}>
      <ThemeScript />
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
};
