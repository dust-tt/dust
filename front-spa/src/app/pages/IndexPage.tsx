import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

import { useAuthContext } from "@dust-tt/front/lib/swr/workspaces";

export function IndexPage() {
  const navigate = useNavigate();
  const { authContext } = useAuthContext();

  const defaultWorkspaceId = authContext?.defaultWorkspaceId;

  useEffect(() => {
    if (defaultWorkspaceId) {
      navigate(`/w/${defaultWorkspaceId}/conversation/new`, {
        replace: true,
      });
    }
  }, [defaultWorkspaceId, navigate]);

  // The static loading screen in index.html handles the initial loading state
  return null;
}
