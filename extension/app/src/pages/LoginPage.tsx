import {
  Button,
  LoginIcon,
  NewDropdownMenu,
  NewDropdownMenuContent,
  NewDropdownMenuItem,
  NewDropdownMenuTrigger,
} from "@dust-tt/sparkle";
import { useAuth } from "@extension/components/auth/AuthProvider";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export const LoginPage = () => {
  const navigate = useNavigate();
  const {
    user,
    isAuthenticated,
    isUserSetup,
    handleLogin,
    handleSelectWorkspace,
    isLoading,
  } = useAuth();

  useEffect(() => {
    if (isAuthenticated && isUserSetup) {
      navigate("/");
    }
  }, [navigate, user, isAuthenticated, isUserSetup]);

  return (
    <div className="flex h-screen flex-col gap-2 p-4">
      <div className="flex h-full w-full items-center justify-center">
        {!isAuthenticated && (
          <Button
            icon={LoginIcon}
            variant="primary"
            label="Sign in"
            onClick={handleLogin}
            disabled={isLoading}
          />
        )}
        {isAuthenticated && !isUserSetup && user?.workspaces.length && (
          <NewDropdownMenu>
            <NewDropdownMenuTrigger asChild>
              <Button label="Select workspace" variant="ghost" />
            </NewDropdownMenuTrigger>
            <NewDropdownMenuContent>
              {user.workspaces.map((w) => {
                return (
                  <NewDropdownMenuItem
                    key={w.sId}
                    onClick={() => handleSelectWorkspace(w.sId)}
                    label={w.name}
                  />
                );
              })}
            </NewDropdownMenuContent>
          </NewDropdownMenu>
        )}
      </div>
    </div>
  );
};
