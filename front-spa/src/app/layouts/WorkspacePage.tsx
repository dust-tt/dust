import { useAppReady } from "@spa/app/hooks/useAppReady";
import { useRequiredPathParam } from "@spa/lib/platform";
import type { ReactNode } from "react";
import { Outlet } from "react-router-dom";

import { AppAuthContextLayout } from "@dust-tt/front/components/sparkle/AppAuthContextLayout";
import { useAuthContext } from "@dust-tt/front/lib/swr/workspaces";

interface WorkspacePageProps {
  children?: ReactNode;
}

export function WorkspacePage({ children }: WorkspacePageProps) {
  const wId = useRequiredPathParam("wId");

  const { authContext, isAuthenticated, isAuthContextError } = useAuthContext({
    workspaceId: wId,
  });

  // Signal that the app is ready when auth is loaded
  // This will dismiss the loading screen
  useAppReady(isAuthenticated && !!authContext);

  if (isAuthContextError) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <p>{isAuthContextError.message}</p>
      </div>
    );
  }

  // Return null while loading - the loading screen handles the loading state
  if (!isAuthenticated || !authContext) {
    return null;
  }

  return (
    <AppAuthContextLayout authContext={authContext}>
      {children ?? <Outlet />}
    </AppAuthContextLayout>
  );
}
