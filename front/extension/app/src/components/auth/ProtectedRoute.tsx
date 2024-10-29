import { useAuth } from "@app/extension/app/src/components/auth/AuthProvider";
import {
  Button,
  ExternalLinkIcon,
  LogoHorizontalColorLogo,
  LogoutIcon,
  Spinner,
} from "@dust-tt/sparkle";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export const ProtectedRoute = ({ children }: { children: ReactNode }) => {
  const { isLoading, isAuthenticated, isUserSetup, handleLogout } = useAuth();

  const navigate = useNavigate();

  useEffect(() => {
    if (!isAuthenticated || !isUserSetup) {
      navigate("/login");
    }
  }, [navigate, isLoading, isAuthenticated, isUserSetup]);

  if (isLoading) {
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
          variant="ghost"
          label="Sign out"
          onClick={handleLogout}
        />
      </div>
      <>{children}</>
    </div>
  );
};
