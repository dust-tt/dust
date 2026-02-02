import { Spinner } from "@dust-tt/sparkle";
import { useLoginRedirect } from "@spa/hooks/useLoginRedirect";
import { useRequiredPathParam } from "@spa/lib/platform";
import type { ReactNode } from "react";
import { Outlet } from "react-router-dom";

import PokeLayout from "@dust-tt/front/components/poke/PokeLayout.tsx";
import {
  usePokeRegion,
  usePokeWorkspaceAuthContext,
} from "@dust-tt/front/lib/swr/poke.ts";

interface PokeLayoutProps {
  children?: ReactNode;
}

export function PokeWorkspacePage({ children }: PokeLayoutProps) {
  const wId = useRequiredPathParam("wId");

  const { authContext, isAuthenticated, isAuthContextLoading } =
    usePokeWorkspaceAuthContext({
      wId,
    });

  const { isRegionLoading } = usePokeRegion();
  const { isRedirecting } = useLoginRedirect({
    isLoading: isAuthContextLoading,
    isAuthenticated,
  });

  if (
    isAuthContextLoading ||
    isRegionLoading ||
    isRedirecting ||
    !authContext
  ) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <Spinner size="xl" />
      </div>
    );
  }

  return (
    <PokeLayout authContext={authContext}>{children ?? <Outlet />}</PokeLayout>
  );
}
