import { Spinner } from "@dust-tt/sparkle";
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

  return (
    <div className="flex h-screen w-full items-center justify-center">
      <Spinner size="xl" />
    </div>
  );
}
