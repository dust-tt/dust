import { Spinner } from "@dust-tt/sparkle";
import type { LightWorkspaceType } from "@dust-tt/types";
import { useAuth } from "@extension/components/auth/AuthProvider";
import type { StoredUser } from "@extension/lib/storage";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

type ProtectedRouteProps = {
  children: ReactNode | ((props: ProtectedRouteChildrenProps) => ReactNode);
};

export type ProtectedRouteChildrenProps = {
  user: StoredUser;
  workspace: LightWorkspaceType;
  handleLogout: () => void;
};

export const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
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
    if (!isAuthenticated || !isUserSetup || !user || !workspace) {
      navigate("/login");
      return;
    }
  }, [navigate, isLoading, isAuthenticated, isUserSetup, user, workspace]);

  if (isLoading || !isAuthenticated || !isUserSetup || !user || !workspace) {
    return (
      <div className="flex h-screen flex-col gap-2 p-4">
        <div className="flex h-full w-full items-center justify-center">
          <Spinner />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col gap-2 p-4">
      {typeof children === "function"
        ? children({ user, workspace, handleLogout })
        : children}
    </div>
  );
};
