import { usePlatform } from "@app/shared/context/PlatformContext";
import { useAuth } from "@app/ui/components/auth/AuthProvider";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export const useAuthErrorCheck = (error: any, mutate: () => any) => {
  const platform = usePlatform();
  const { setAuthError, redirectToSSOLogin, workspace } = useAuth();
  const navigate = useNavigate();

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
            // Attempt to get the access token, it will refresh the token if needed.
            const accesToken = await platform.auth.getAccessToken(true);
            if (!accesToken) {
              // If we still don't have an access token, we need to logout.
              setAuthError(error);
              void platform.auth.logout();
              break;
            }
            mutate();
            break;

          case "user_not_found":
            setAuthError(error);
            break;

          case "workspace_can_use_product_required_error":
            navigate("/subscribe");
            break;
        }
      }
    };
    void handleError();
  }, [error]);
};
