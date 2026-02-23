import { ThemeProvider } from "@dust-tt/front/components/sparkle/ThemeContext";
import { useAppReadyContext } from "@spa/app/contexts/AppReadyContext";
import { useEffect } from "react";
import { Outlet } from "react-router-dom";

// Layout for unauthenticated pages that are outside WorkspacePage.
// Signals app ready immediately to dismiss the HTML loading screen.
export function UnauthenticatedPage() {
  const signalAppReady = useAppReadyContext();

  useEffect(() => {
    signalAppReady();
  }, [signalAppReady]);

  return (
    <ThemeProvider>
      <Outlet />
    </ThemeProvider>
  );
}
