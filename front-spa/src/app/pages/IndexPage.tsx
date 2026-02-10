import { useAuthContext } from "@dust-tt/front/lib/swr/workspaces";
import { AuthErrorPage } from "@spa/app/components/AuthErrorPage";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export function IndexPage() {
  const navigate = useNavigate();
  const { authContext, authContextError } = useAuthContext();

  const defaultWorkspaceId = authContext?.defaultWorkspaceId;

  useEffect(() => {
    if (defaultWorkspaceId) {
      navigate(`/w/${defaultWorkspaceId}/conversation/new`, {
        replace: true,
      });
    }
  }, [defaultWorkspaceId, navigate]);

  if (authContextError) {
    return <AuthErrorPage error={authContextError} />;
  }

  // The static loading screen in index.html handles the initial loading state
  return null;
}
