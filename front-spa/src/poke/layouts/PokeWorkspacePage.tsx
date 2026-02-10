import PokeLayout from "@dust-tt/front/components/poke/PokeLayout.tsx";
import { usePokeAuthContext } from "@dust-tt/front/lib/swr/poke.ts";
import { Spinner } from "@dust-tt/sparkle";
import { AuthErrorPage } from "@spa/app/components/AuthErrorPage";
import { useAppReadyContext } from "@spa/app/contexts/AppReadyContext";
import { useRequiredPathParam } from "@spa/lib/platform";
import { type ReactNode, useEffect } from "react";
import { Outlet } from "react-router-dom";

interface PokeLayoutProps {
  children?: ReactNode;
}

export function PokeWorkspacePage({ children }: PokeLayoutProps) {
  const wId = useRequiredPathParam("wId");

  const { authContext, isAuthenticated, authContextError } = usePokeAuthContext(
    {
      workspaceId: wId,
    }
  );

  const signalAppReady = useAppReadyContext();

  useEffect(() => {
    if ((isAuthenticated && authContext) || authContextError) {
      signalAppReady();
    }
  }, [isAuthenticated, authContext, authContextError, signalAppReady]);

  if (authContextError) {
    return <AuthErrorPage error={authContextError} />;
  }

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
