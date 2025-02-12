import { useAuth } from "@extension/components/auth/AuthProvider";
import { usePlatform } from "@extension/shared/context/platform";
import { useEffect } from "react";

export const useAuthErrorCheck = (error: any, mutate: () => any) => {
  const platform = usePlatform();

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
            void platform.auth.logout();
            break;
          case "not_authenticated":
          case "invalid_oauth_token_error":
            setAuthError(error);
            void platform.auth.logout();
            break;
          case "expired_oauth_token_error":
            const res = await platform.auth.refreshToken();
            if (res.isOk()) {
              mutate();
            } else {
              void platform.auth.logout();
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
