import { AuthErrorPage } from "@spa/app/components/AuthErrorPage";
import { useAppReadyContext } from "@spa/app/contexts/AppReadyContext";
import { useRequiredPathParam } from "@spa/lib/platform";
import { type ReactNode, useEffect } from "react";
import { Outlet, useNavigate } from "react-router-dom";

import { AppAuthContextLayout } from "@dust-tt/front/components/sparkle/AppAuthContextLayout";
import { useUser } from "@dust-tt/front/lib/swr/user";
import { useAuthContext } from "@dust-tt/front/lib/swr/workspaces";
import { isAPIErrorResponse } from "@dust-tt/front/types/error";

interface WorkspacePageProps {
  children?: ReactNode;
}

export function WorkspacePage({ children }: WorkspacePageProps) {
  const wId = useRequiredPathParam("wId");
  const navigate = useNavigate();

  const { authContext, isAuthenticated, authContextError } = useAuthContext({
    workspaceId: wId,
  });
  const { user } = useUser();

  const signalAppReady = useAppReadyContext();

  const isWorkspaceNotFound =
    isAPIErrorResponse(authContextError) &&
    authContextError.error.type === "workspace_not_found";

  // Signal that the app is ready when auth is loaded or on error
  // This will dismiss the loading screen
  useEffect(() => {
    if ((isAuthenticated && authContext) || authContextError) {
      signalAppReady();
    }
  }, [isAuthenticated, authContext, authContextError, signalAppReady]);

  // When the workspace is not found, redirect to another workspace
  // or to /no-workspace if the user has none.
  useEffect(() => {
    if (isWorkspaceNotFound && user) {
      const otherWorkspace = user.workspaces.find((w) => w.sId !== wId);
      if (otherWorkspace) {
        navigate(`/w/${otherWorkspace.sId}/conversation/new`, {
          replace: true,
        });
      } else {
        navigate("/no-workspace?flow=revoked", { replace: true });
      }
    }
  }, [isWorkspaceNotFound, user, wId, navigate]);

  if (authContextError) {
    // Show error page while waiting for user data to redirect,
    // or for non-workspace-not-found errors.
    return <AuthErrorPage error={authContextError} />;
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
