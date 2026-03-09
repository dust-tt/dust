import { cn, Spinner } from "@dust-tt/sparkle";
import type { RouteChangeMesssage } from "@extension/platforms/chrome/messages";
import { usePlatform } from "@extension/shared/context/PlatformContext";
import { useExtensionAuth } from "@extension/ui/components/auth/AuthProvider";
import { useEffect } from "react";
import { Outlet, useNavigate } from "react-router-dom";

export const ProtectedRoute = () => {
  const platform = usePlatform();
  const { isLoading, isAuthenticated, isUserSetup, user, workspace } =
    useExtensionAuth();

  const navigate = useNavigate();

  useEffect(() => {
    const cleanup = platform.messaging?.addMessageListener(
      (message: RouteChangeMesssage) => {
        const { type } = message;
        if (type === "EXT_ROUTE_CHANGE") {
          navigate({ pathname: message.pathname, search: message.search });
        }
      }
    );

    return () => {
      cleanup?.();
    };
  }, [navigate]);

  useEffect(() => {
    if (isLoading) {
      return;
    }
    if (!isAuthenticated || !isUserSetup || !user || !workspace) {
      navigate("/login");
      return;
    }
  }, [navigate, isLoading, isAuthenticated, isUserSetup, user, workspace]);

  if (isLoading || !isAuthenticated || !isUserSetup || !user || !workspace) {
    return (
      <div
        className={cn(
          "flex h-screen items-center justify-center",
          "bg-background text-foreground",
          "dark:bg-background-night dark:text-foreground-night"
        )}
      >
        <Spinner />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex h-screen flex-col gap-2 overflow-y-auto",
        "bg-background text-foreground",
        "dark:bg-background-night dark:text-foreground-night"
      )}
    >
      <Outlet />
    </div>
  );
};
