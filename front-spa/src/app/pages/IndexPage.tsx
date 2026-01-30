import { Spinner } from "@dust-tt/sparkle";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

import { useAuthContext } from "@dust-tt/front/lib/swr/workspaces";
import { useLoginRedirect } from "@spa/hooks/useLoginRedirect";

export function IndexPage() {
  const navigate = useNavigate();
  const { user, defaultWorkspace, isAuthContextLoading } = useAuthContext({});

  const isAuthenticated = !!user;
  const { isRedirecting } = useLoginRedirect({
    isLoading: isAuthContextLoading,
    isAuthenticated,
  });

  useEffect(() => {
    if (defaultWorkspace) {
      navigate(`/w/${defaultWorkspace.sId}/new`, { replace: true });
    }
  }, [defaultWorkspace, navigate]);

  return (
    <div className="flex h-screen w-full items-center justify-center">
      <Spinner size="xl" />
    </div>
  );
}
