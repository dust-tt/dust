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
    <div className="flex flex-col p-4 gap-2 h-screen">
      <div className="flex justify-center items-center w-full h-full">
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
