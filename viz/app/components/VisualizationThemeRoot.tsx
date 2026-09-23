"use client";

import { useVizContext } from "@viz/app/components/VizContext";
import {
  createContext,
  type ReactNode,
  useContext,
  useLayoutEffect,
} from "react";

const HasThemeRootContext = createContext(false);

interface VisualizationThemeRootProps {
  hasTheme: boolean;
  children: ReactNode;
}

/**
 * @cc [owner:flvndvd,label:product] frame-host-theme
 * Only an outer FrameRoot or Slideshow receiving a theme (including an empty object) MUST
 * opt the document into the host's light/dark appearance. Without that opt-in, missing or
 * invalid URL themes, and in PDF mode, the document MUST retain its light defaults.
 * Nested roots MUST NOT change the document theme. Unmounting the root MUST restore light.
 */
export function VisualizationThemeRoot({
  hasTheme,
  children,
}: VisualizationThemeRootProps) {
  const isNested = useContext(HasThemeRootContext);
  const { isPdfMode } = useVizContext();

  useLayoutEffect(() => {
    if (isNested) {
      return;
    }

    const root = document.documentElement;
    const theme = new URL(window.location.href).searchParams.get("theme");
    const isDark = hasTheme && !isPdfMode && theme === "dark";
    root.classList.toggle("dark", isDark);
    root.style.colorScheme = isDark ? "dark" : "light";

    return () => {
      root.classList.remove("dark");
      root.style.colorScheme = "light";
    };
  }, [hasTheme, isNested, isPdfMode]);

  return (
    <HasThemeRootContext.Provider value={true}>
      {children}
    </HasThemeRootContext.Provider>
  );
}
