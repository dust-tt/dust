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
    if (!isAuthenticated || !isUserSetup || !user || !workspace) {
      navigate("/login");
      return;
    }
  }, [navigate, isLoading, isAuthenticated, isUserSetup, user, workspace]);

  if (isLoading || !isAuthenticated || !isUserSetup || !user || !workspace) {
    return (
      <div
        className={cn(
          "flex h-screen flex-col gap-2 p-4",
          "bg-background text-foreground",
          "dark:bg-background-night dark:text-foreground-night"
        )}
      >
        <div className="flex h-full w-full items-center justify-center">
          <Spinner />
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex h-screen flex-col gap-2 overflow-y-auto px-4",
        "bg-background text-foreground",
        "dark:bg-background-night dark:text-foreground-night"
      )}
    >
      <Outlet />
    </div>
  );
};
