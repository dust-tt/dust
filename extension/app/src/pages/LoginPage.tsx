import {
  Button,
  ChevronDownIcon,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  LoginIcon,
  LogoHorizontalColorLogo,
  Page,
  Spinner,
} from "@dust-tt/sparkle";
import { useAuth } from "@extension/components/auth/AuthProvider";
import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";

export const LoginPage = () => {
  const navigate = useNavigate();
  const {
    user,
    isAuthenticated,
    authError,
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

  const PRIVACY_POLICY_URL =
    "https://dust-tt.notion.site/Website-Privacy-Policy-a118bb3472f945a1be8e11fbfb733084";
  const TERMS_OF_USE_URL =
    "https://dust-tt.notion.site/Website-Terms-of-Use-ff8665f52c454e0daf02195ec0d6bafb";

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex h-screen flex-col p-4 dark:bg-slate-950 dark:text-slate-50">
        <div className="flex flex-1 flex-col items-center justify-center gap-8">
          <div className="flex flex-col items-center text-center space-y-9 max-w-[400px]">
            <Link to="https://dust.tt" target="_blank">
              <LogoHorizontalColorLogo className="h-12 w-48" />
            </Link>
            <Page.SectionHeader title="Get more done, faster, with the power of your agents at your fingertips." />
          </div>
          {authError && authError.code === "user_not_found" && (
            <>
              <div className="text-center">
                Please sign up to start using Dust extension.
              </div>
            </>
          )}
          {authError && authError.code !== "user_not_found" && (
            <div className="text-center">{authError.message}</div>
          )}

          <div className="text-center gap-2 flex">
            {authError && authError.code === "user_not_found" && (
              <Link to="https://dust.tt/home">
                <Button
                  icon={LoginIcon}
                  variant="primary"
                  label="Sign up"
                  onClick={() => {
                    window.open(
                      "https://dust.tt/api/auth/login?returnTo=/api/login&prompt=login&screen_hint=signup",
                      "_blank"
                    );
                  }}
                  size="md"
                />
              </Link>
            )}

            <Button
              icon={LoginIcon}
              variant="primary"
              label="Sign in"
              onClick={() => handleLogin(!!authError)}
              disabled={isLoading}
              size="md"
            />
          </div>
        </div>
        <p className="text-center text-element-700 dark:text-element-700-night max-w-[300px] mx-auto">
          By signing in, you agree to Dust's{" "}
          <Link to={TERMS_OF_USE_URL} target="_blank" className="underline">
            Terms of Use
          </Link>{" "}
          and{" "}
          <Link to={PRIVACY_POLICY_URL} target="_blank" className="underline">
            Privacy Policy
          </Link>
          .
        </p>
      </div>
    );
  }

  if (isAuthenticated && !isUserSetup && user?.workspaces.length) {
    return (
      <div className="flex h-screen flex-col gap-2 p-4 dark:bg-slate-950 dark:text-slate-50">
        <div className="flex h-full w-full flex-col items-center justify-center gap-4 text-center">
          <Page.SectionHeader title="Almost there" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                label="Pick a workspace"
                variant="outline"
                icon={ChevronDownIcon}
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {user.workspaces.map((w) => {
                return (
                  <DropdownMenuItem
                    key={w.sId}
                    onClick={() => void handleSelectWorkspace(w)}
                    label={w.name}
                  />
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    );
  }

  // Should never happen.
  return (
    <div className="flex h-screen items-center justify-center text-center">
      <Page.SectionHeader title="Something unexpected occured, please contact us at team@dust.tt!" />
    </div>
  );
};
