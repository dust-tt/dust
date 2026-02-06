import { Spinner } from "@dust-tt/sparkle";
import { useAppReadyContext } from "@spa/app/contexts/AppReadyContext";
import { type ReactNode, useEffect } from "react";
import { Outlet } from "react-router-dom";

import { PokeLayoutNoWorkspace } from "@dust-tt/front/components/poke/PokeLayout.tsx";
import { usePokeAuthContext } from "@dust-tt/front/lib/swr/poke.ts";

interface PokeLayoutProps {
  children?: ReactNode;
}

export function PokePage({ children }: PokeLayoutProps) {
  const { authContext, isAuthenticated } = usePokeAuthContext();

  const signalAppReady = useAppReadyContext();

  useEffect(() => {
    if (isAuthenticated && authContext) {
      signalAppReady();
    }
  }, [isAuthenticated, authContext, signalAppReady]);

  if (!isAuthenticated || !authContext) {
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
