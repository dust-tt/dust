import { Spinner } from "@dust-tt/sparkle";
import { useLoginRedirect } from "@spa/hooks/useLoginRedirect";
import type { ReactNode } from "react";
import { Outlet } from "react-router-dom";

import { PokeLayoutNoWorkspace } from "@dust-tt/front/components/poke/PokeLayout.tsx";
import {
  usePokeAuthContext,
  usePokeRegion,
} from "@dust-tt/front/lib/swr/poke.ts";
import { useEffect } from "react";
import { useRegionContext } from "@app/lib/auth/RegionContext";

interface PokeLayoutProps {
  children?: ReactNode;
}

export function PokePage({ children }: PokeLayoutProps) {
  const { authContext, isAuthenticated, isAuthContextLoading } =
    usePokeAuthContext();
  // Fetch region info and set URLs in context.
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
    <PokeLayoutNoWorkspace authContext={authContext}>
      {children ?? <Outlet />}
    </PokeLayoutNoWorkspace>
  );
}
