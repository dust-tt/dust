import { Spinner } from "@dust-tt/sparkle";
import { useAppReady } from "@spa/app/hooks/useAppReady";
import { useRequiredPathParam } from "@spa/lib/platform";
import type { ReactNode } from "react";
import { Outlet } from "react-router-dom";

import PokeLayout from "@dust-tt/front/components/poke/PokeLayout.tsx";
import { usePokeAuthContext } from "@dust-tt/front/lib/swr/poke.ts";

interface PokeLayoutProps {
  children?: ReactNode;
}

export function PokeWorkspacePage({ children }: PokeLayoutProps) {
  const wId = useRequiredPathParam("wId");

  const { authContext, isAuthenticated } = usePokeAuthContext({
    workspaceId: wId,
  });

  useAppReady(isAuthenticated && !!authContext);

  if (!isAuthenticated || !authContext) {
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
