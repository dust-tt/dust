import { useLayoutEffect } from "react";

/**
 * @cc [owner:flvndvd,label:product] frame-host-theme
 * Frames MUST apply the URL's light/dark theme at the document root so content
 * and portals share it. Missing or invalid themes and PDF rendering MUST use light.
 */
export function useVisualizationTheme(isPdfMode: boolean) {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const theme = new URL(window.location.href).searchParams.get("theme");
    const isDark = !isPdfMode && theme === "dark";
    root.classList.toggle("dark", isDark);
    root.style.colorScheme = isDark ? "dark" : "light";
  }, [isPdfMode]);
}
