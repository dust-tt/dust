import { Spinner } from "@dust-tt/sparkle";
import { useLoginRedirect } from "@spa/hooks/useLoginRedirect";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

import { useAuthContext } from "@dust-tt/front/lib/swr/workspaces";

export function IndexPage() {
  const navigate = useNavigate();
  const { user, region, defaultWorkspace, isAuthContextLoading } =
    useAuthContext({});

  const isAuthenticated = !!user;
  useLoginRedirect({
    isLoading: isAuthContextLoading,
    isAuthenticated,
  });

  console.log("Initial auth-context", user, region, defaultWorkspace);

  useEffect(() => {
    if (defaultWorkspace) {
      navigate(`/w/${defaultWorkspace}/new`, { replace: true });
    }
  }, [defaultWorkspace, navigate]);

  return (
    <div className="flex h-screen w-full items-center justify-center">
      <Spinner size="xl" />
    </div>
  );
}
