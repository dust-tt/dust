import { logout, refreshToken } from "@app/shared/lib/auth";
import { useAuth } from "@app/ui/components/auth/AuthProvider";
import { useEffect } from "react";

export const useAuthErrorCheck = (error: any, mutate: () => any) => {
  const { setAuthError, redirectToSSOLogin, workspace } = useAuth();
  useEffect(() => {
    const handleError = async () => {
      if (error) {
        switch (error.type) {
          case "sso_enforced":
            if (workspace) {
              return redirectToSSOLogin(workspace);
            }
            setAuthError(error);
            void logout();
            break;
          case "not_authenticated":
          case "invalid_oauth_token_error":
            setAuthError(error);
            void logout();
            break;
          case "expired_oauth_token_error":
            const res = await refreshToken();
            if (res.isOk()) {
              mutate();
            } else {
              void logout();
            }
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
