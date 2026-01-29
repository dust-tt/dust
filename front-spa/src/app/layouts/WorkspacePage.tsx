import { Spinner } from "@dust-tt/sparkle";
import { useLoginRedirect } from "@spa/hooks/useLoginRedirect";
import { useRequiredPathParam } from "@spa/lib/platform";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { Outlet } from "react-router-dom";

import { AppAuthContextLayout } from "@dust-tt/front/components/sparkle/AppAuthContextLayout";
import { useWorkspaceAuthContext } from "@dust-tt/front/lib/swr/workspaces";

interface WorkspacePageProps {
  children?: ReactNode;
}

export function WorkspacePage({ children }: WorkspacePageProps) {
  const wId = useRequiredPathParam("wId");

  const {
    owner,
    subscription,
    user,
    isAdmin,
    isBuilder,
    isAuthContextLoading,
  } = useWorkspaceAuthContext({
    workspaceId: wId,
  });

  const isAuthenticated = !!user;
  const { isRedirecting } = useLoginRedirect({
    isLoading: isAuthContextLoading,
    isAuthenticated,
  });

  const authContext = useMemo(() => {
    if (!owner || !subscription || !user) {
      return null;
    }
    return {
      user,
      workspace: owner,
      subscription,
      isAdmin,
      isBuilder,
      isSuperUser: false, // SPA users are never super users
    };
  }, [owner, subscription, user, isAdmin, isBuilder]);

  if (isAuthContextLoading || isRedirecting || !authContext) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <Spinner size="xl" />
      </div>
    );
  }

  return (
    <AppAuthContextLayout authContext={authContext}>
      {children ?? <Outlet />}
    </AppAuthContextLayout>
  );
}
