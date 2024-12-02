import { useAuth } from "@extension/components/auth/AuthProvider";
import { logout, refreshToken } from "@extension/lib/auth";
import { useEffect } from "react";

export const useAuthErrorCheck = (error: any, mutate: () => any) => {
  const { setAuthError } = useAuth();
  useEffect(() => {
    const handleError = async () => {
      if (error) {
        switch (error.type) {
          case "not_authenticated":
          case "invalid_oauth_token_error":
            setAuthError(error);
            void logout();
            break;
          case "expired_oauth_token_error":
            await refreshToken();
            mutate();
            break;
          case "user_not_found":
            setAuthError(error);
            break;
        }
      }
    };
    void handleError();
  }, [error]);
};
