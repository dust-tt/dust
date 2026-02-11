import { ThemeProvider } from "@dust-tt/front/components/sparkle/ThemeContext";
import { useAuthContext } from "@dust-tt/front/lib/swr/workspaces";
import { AuthErrorPage } from "@spa/app/components/AuthErrorPage";
import { useAppReadyContext } from "@spa/app/contexts/AppReadyContext";
import { useEffect } from "react";
import { Outlet } from "react-router-dom";

// Layout for authenticated pages that are outside WorkspacePage
// (e.g. /invite-choose, /no-workspace).
// Checks session auth, redirects to login if needed, and signals app ready.
export function AuthenticatedPage() {
  const { isAuthenticated, authContextError } = useAuthContext();
  const signalAppReady = useAppReadyContext();

  useEffect(() => {
    if (isAuthenticated || authContextError) {
      signalAppReady();
    }
  }, [isAuthenticated, authContextError, signalAppReady]);

  if (authContextError) {
    return <AuthErrorPage error={authContextError} />;
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <ThemeProvider>
      <Outlet />
    </ThemeProvider>
  );
}
