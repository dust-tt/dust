import { useAuth } from "@extension/components/auth/AuthProvider";
import { logout, refreshToken } from "@extension/lib/auth";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export const useAuthErrorCheck = (error: any, mutate: () => any) => {
  const { setAuthError, handleLogout } = useAuth();
  const navigate = useNavigate();
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
            const res = await refreshToken();
            if (res.isOk()) {
              mutate();
            } else {
              handleLogout();
              navigate("/login");
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
