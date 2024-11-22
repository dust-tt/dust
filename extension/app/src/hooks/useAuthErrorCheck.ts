import { useAuth } from "@extension/components/auth/AuthProvider";
import { logout } from "@extension/lib/auth";
import { useEffect } from "react";

export const useAuthErrorCheck = (error: any) => {
  const { setAuthError } = useAuth();
  useEffect(() => {
    if (error?.type === "not_authenticated") {
      setAuthError(error);
      void logout();
    }
  }, [error]);
};
