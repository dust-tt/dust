import { LocaleSync } from "@dust-tt/front/components/app/UserLocaleSync";
import { useAuthContext } from "@dust-tt/front/lib/swr/workspaces";
import { AuthErrorPage } from "@spa/app/components/AuthErrorPage";
import { useAppReadyContext } from "@spa/app/contexts/AppReadyContext";
import { useEffect } from "react";
import { Outlet } from "react-router-dom";

// Layout for authenticated pages that are outside WorkspacePage
// (e.g. /invite-choose, /no-workspace).
// Checks session auth, redirects to login if needed, and signals app ready.
/**
 * @cc [owner:sfriquet,label:product] startup-loader-waits-for-no-workspace-locale
 * When the no-workspace auth context loads, the startup loading screen MUST stay visible until
 * `LocaleSync` reports ready for its `locale` (`null` when it has none).
 */
export function AuthenticatedPage() {
  const { authContext, isAuthenticated, authContextError } = useAuthContext();
  const signalAppReady = useAppReadyContext();

  useEffect(() => {
    if (authContextError) {
      signalAppReady();
    }
  }, [authContextError, signalAppReady]);

  if (authContextError) {
    return <AuthErrorPage error={authContextError} hasLocalisation={false} />;
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <>
      <LocaleSync
        userLocale={authContext?.locale ?? null}
        onReady={signalAppReady}
      />
      <Outlet />
    </>
  );
}
