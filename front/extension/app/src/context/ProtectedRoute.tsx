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

import { useAuth } from "./AuthProvider";

export const ProtectedRoute = ({ children }: { children: ReactNode }) => {
  const { isLoading, isAuthenticated, handleLogout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate("/login");
    }
  }, [isLoading, isAuthenticated, navigate]);

  if (isLoading) {
    return (
      <div className="flex flex-col p-4 gap-2 h-screen">
        <div className="flex justify-center items-center w-full h-full">
          <Spinner />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col p-4 gap-2 h-screen">
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-2 pb-10">
          <LogoHorizontalColorLogo className="h-4 w-16" />
          <a href="https://dust.tt" target="_blank">
            <ExternalLinkIcon color="#64748B" />
          </a>
        </div>
        <Button
          icon={LogoutIcon}
          variant="tertiary"
          label="Sign out"
          onClick={handleLogout}
        />
      </div>
      <>{children}</>
    </div>
  );
};
