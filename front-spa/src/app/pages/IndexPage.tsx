import config from "@dust-tt/front/lib/api/config";
import { useAuthContext } from "@dust-tt/front/lib/swr/workspaces";
import { AuthErrorPage } from "@spa/app/components/AuthErrorPage";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export function IndexPage() {
  const navigate = useNavigate();
  const {
    authContext,
    authContextError,
    isAuthContextLoading,
    isAuthenticated,
  } = useAuthContext();

  const defaultWorkspaceId = authContext?.defaultWorkspaceId;
  useEffect(() => {
    if (!isAuthContextLoading && isAuthenticated) {
      if (defaultWorkspaceId) {
        navigate(`/w/${defaultWorkspaceId}/conversation/new`, {
          replace: true,
        });
      } else {
        // No default workspace, redirect to /api/login which will create
        // or find a workspace for the user
        window.location.href = `${config.getApiBaseUrl()}/api/login`;
      }
    }
  }, [defaultWorkspaceId, navigate, isAuthContextLoading, isAuthenticated]);

  if (authContextError) {
    return <AuthErrorPage error={authContextError} />;
  }

  // The static loading screen in index.html handles the initial loading state
  return null;
}
