import type { StoredUser } from "@app/extension/app/src/lib/storage";
import {
  Button,
  ExternalLinkIcon,
  LogoHorizontalColorLogo,
  LogoutIcon,
  Spinner,
} from "@dust-tt/sparkle";
import type { LightWorkspaceType } from "@dust-tt/types";
import { useAuth } from "@extension/components/auth/AuthProvider";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

type ProtectedRouteProps = {
  children: ReactNode | ((props: ProtectedRouteChildrenProps) => ReactNode);
};

export type ProtectedRouteChildrenProps = {
  user: StoredUser;
  workspace: LightWorkspaceType;
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
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2 pb-10">
          <LogoHorizontalColorLogo className="h-4 w-16" />
          <a href="https://dust.tt" target="_blank">
            <ExternalLinkIcon color="#64748B" />
          </a>
        </div>
        <Button
          icon={LogoutIcon}
          variant="outline"
          label="Sign out"
          onClick={handleLogout}
          size="sm"
        />
      </div>
      <>
        {typeof children === "function"
          ? children({ user, workspace })
          : children}
      </>
    </div>
  );
};
