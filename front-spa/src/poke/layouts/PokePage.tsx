import { Spinner } from "@dust-tt/sparkle";
import { usePokeLoginRedirect } from "@spa/hooks/usePokeLoginRedirect";
import type { ReactNode } from "react";
import { Outlet, useMatches } from "react-router-dom";

import { PokeLayoutNoWorkspace } from "@dust-tt/front/components/poke/PokeLayout.tsx";
import { usePokeAuthContext } from "@dust-tt/front/lib/swr/poke.ts";

interface RouteHandle {
  title?: string;
}

interface PokeLayoutProps {
  children?: ReactNode;
}

export function PokePage({ children }: PokeLayoutProps) {
  // Get title from the deepest matched route's handle
  const matches = useMatches();
  const title = matches
    .slice()
    .reverse()
    .find((match) => (match.handle as RouteHandle)?.title)?.handle as
    | RouteHandle
    | undefined;
  const pageTitle = title?.title ?? "Poke";

  const { authContext, isAuthenticated, isLoading } = usePokeAuthContext();
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
    <PokeLayoutNoWorkspace title={pageTitle} authContext={authContext}>
      {children ?? <Outlet />}
    </PokeLayoutNoWorkspace>
  );
}
