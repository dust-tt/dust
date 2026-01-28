import { Spinner } from "@dust-tt/sparkle";
import { usePokeLoginRedirect } from "@spa/hooks/usePokeLoginRedirect";
import { useRequiredPathParam } from "@spa/lib/platform";
import type { ReactNode } from "react";
import { Outlet, useMatches } from "react-router-dom";

import PokeLayout from "@dust-tt/front/components/poke/PokeLayout.tsx";
import { usePokeWorkspaceAuthContext } from "@dust-tt/front/lib/swr/poke.ts";

interface RouteHandle {
  title?: string;
}

interface PokeLayoutProps {
  children?: ReactNode;
}

export function PokeWorkspacePage({ children }: PokeLayoutProps) {
  const wId = useRequiredPathParam("wId");

  // Get title from the deepest matched route's handle
  const matches = useMatches();
  const title = matches
    .slice()
    .reverse()
    .find((match) => (match.handle as RouteHandle)?.title)?.handle as
    | RouteHandle
    | undefined;
  const pageTitle = title?.title ?? "Poke";

  const { authContext, isAuthenticated, isLoading } =
    usePokeWorkspaceAuthContext({
      wId,
    });
  const { isRedirecting } = usePokeLoginRedirect({
    isLoading,
    isAuthenticated,
  });

  if (isLoading || isRedirecting || !authContext) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <Spinner size="xl" />
      </div>
    );
  }

  return (
    <PokeLayout title={pageTitle} authContext={authContext}>
      {children ?? <Outlet />}
    </PokeLayout>
  );
}
