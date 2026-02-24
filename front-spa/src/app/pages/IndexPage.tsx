import config from "@dust-tt/front/lib/api/config";
import { useAuthContext } from "@dust-tt/front/lib/swr/workspaces";
import { AuthErrorPage } from "@spa/app/components/AuthErrorPage";
import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

function getWorkspaceRedirectPath(
  workspaceId: string,
  searchParams: URLSearchParams
): string {
  const goto = searchParams.get("goto");

  if (goto === "subscription") {
    return `/w/${workspaceId}/subscription/manage`;
  }

  if (goto === "template") {
    const templateId = searchParams.get("templateId");
    if (templateId) {
      return `/w/${workspaceId}/builder/agents/create?templateId=${templateId}`;
    }
  }

  return `/w/${workspaceId}/conversation/new`;
}

export function IndexPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const {
    authContext,
    authContextError,
    isAuthContextLoading,
    isAuthenticated,
  } = useAuthContext();

  const defaultWorkspaceId = authContext?.defaultWorkspaceId;
  useEffect(() => {
    if (!isAuthContextLoading && isAuthenticated) {
      const inviteToken = searchParams.get("inviteToken");
      if (inviteToken) {
        // Redirect to server-side login flow to process the invite.
        window.location.href = `${config.getApiBaseUrl()}/api/login?inviteToken=${encodeURIComponent(inviteToken)}`;
      } else if (defaultWorkspaceId) {
        navigate(getWorkspaceRedirectPath(defaultWorkspaceId, searchParams), {
          replace: true,
        });
      } else {
        // No default workspace, redirect to /api/login which will create
        // or find a workspace for the user
        window.location.href = `${config.getApiBaseUrl()}/api/login`;
      }
    }
  }, [
    defaultWorkspaceId,
    navigate,
    searchParams,
    isAuthContextLoading,
    isAuthenticated,
  ]);

  if (authContextError) {
    return <AuthErrorPage error={authContextError} />;
  }

  // The static loading screen in index.html handles the initial loading state
  return null;
}
