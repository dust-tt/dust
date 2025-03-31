import type { RouteChangeMesssage } from "@app/platforms/chrome/messages";
import { usePlatform } from "@app/shared/context/PlatformContext";
import type { StoredUser } from "@app/shared/services/auth";
import { useAuth } from "@app/ui/components/auth/AuthProvider";
import type { ExtensionWorkspaceType } from "@dust-tt/client";
import { classNames, Spinner } from "@dust-tt/sparkle";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

interface ProtectedRouteProps {
  children: ReactNode | ((props: ProtectedRouteChildrenProps) => ReactNode);
}

export interface ProtectedRouteChildrenProps {
  user: StoredUser;
  workspace: ExtensionWorkspaceType;
  handleLogout: () => void;
}

export const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const platform = usePlatform();
  const {
    isLoading,
    isAuthenticated,
    isUserSetup,
    user,
    workspace,
    handleLogout,
  } = useAuth();

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
        className={classNames(
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
      className={classNames(
        "flex h-screen flex-col gap-2 px-4 overflow-y-auto",
        "bg-background text-foreground",
        "dark:bg-background-night dark:text-foreground-night"
      )}
    >
      {typeof children === "function"
        ? children({ user, workspace, handleLogout })
        : children}
    </div>
  );
};
