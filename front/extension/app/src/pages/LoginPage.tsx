import { Button, LoginIcon } from "@dust-tt/sparkle";
import { useAuth } from "@extension/context/AuthProvider";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export const LoginPage = () => {
  const navigate = useNavigate();
  const { handleLogin, isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (isAuthenticated) {
      navigate("/");
    }
  }, [isAuthenticated, navigate]);

  return (
    <div className="flex h-screen flex-col gap-2 p-4">
      <div className="flex h-full w-full items-center justify-center">
        <Button
          icon={LoginIcon}
          variant="primary"
          label="Sign in"
          onClick={handleLogin}
          disabled={isLoading}
        />
      </div>
    </div>
  );
};
