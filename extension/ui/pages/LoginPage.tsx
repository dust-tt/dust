import { Button, cn, DustLogo, LogIn01, Page, Spinner } from "@dust-tt/sparkle";
import type { AuthError } from "@extension/shared/services/auth";
import { useExtensionAuth } from "@extension/ui/components/auth/AuthProvider";
import { Trans, useLingui } from "@lingui/react/macro";
import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";

export const LoginPage = () => {
  const { t } = useLingui();
  const navigate = useNavigate();
  const {
    user,
    isAuthenticated,
    authError,
    isUserSetup,
    handleLogin,
    isLoading,
    handleLogout,
  } = useExtensionAuth();

  useEffect(() => {
    if (isAuthenticated && isUserSetup) {
      navigate("/");
    }
  }, [navigate, user, isAuthenticated, isUserSetup]);

  // Other auth errors carry technical details that are only shown as is.
  const getAuthErrorMessage = (error: AuthError) => {
    switch (error.code) {
      case "sso_enforced":
        return t`Access requires Single Sign-On (SSO) authentication. Use your SSO provider to sign in.`;
      case "expired_oauth_token_error":
        return t`Session expired. Please sign in again.`;
      default:
        return error.message;
    }
  };

  const PRIVACY_POLICY_URL =
    "https://dust-tt.notion.site/Website-Privacy-Policy-a118bb3472f945a1be8e11fbfb733084";
  const TERMS_OF_USE_URL =
    "https://dust-tt.notion.site/Website-Terms-of-Use-ff8665f52c454e0daf02195ec0d6bafb";

  if (isLoading || (isAuthenticated && isUserSetup)) {
    return (
      <div
        className={cn(
          "flex h-screen items-center justify-center",
          "bg-background text-foreground"
        )}
      >
        <Spinner size="sm" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div
        className={cn(
          "flex h-screen flex-col p-4",
          "bg-background text-foreground"
        )}
      >
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          <div className="flex max-w-[400px] flex-col items-center space-y-9 text-center">
            <Link to="https://dust.tt" target="_blank">
              <DustLogo className="h-8 w-36" />
            </Link>
          </div>
          <div className="max-w-[400px] text-center">
            <Page.H variant="h4">
              <Trans>
                Get more done, faster, with the power of your agents at your
                fingertips.
              </Trans>
            </Page.H>
          </div>
          {authError && authError.code === "user_not_found" && (
            <div className="text-md text-center">
              <Trans>
                Please sign up on the web to start using the Dust extension.
              </Trans>
            </div>
          )}
          {authError && authError.code !== "user_not_found" && (
            <div className="text-md text-center">
              {getAuthErrorMessage(authError)}
            </div>
          )}

          <div className="m-1 flex gap-2 text-center">
            {authError && authError.code === "user_not_found" && (
              <Link to="https://dust.tt/home">
                <Button
                  icon={LogIn01}
                  variant="primary"
                  label={t`Sign up`}
                  onClick={() => {
                    window.open(
                      "https://dust.tt/api/workos/login?returnTo=/api/login",
                      "_blank"
                    );
                  }}
                  size="sm"
                />
              </Link>
            )}

            <Button
              icon={LogIn01}
              variant="primary"
              label={t`Sign in`}
              onClick={() => handleLogin()}
              disabled={isLoading}
              size="sm"
            />
          </div>
        </div>
        <p className="text-muted-foreground mx-auto max-w-[300px] text-center">
          <Trans>
            By signing in, you agree to Dust's{" "}
            <Link to={TERMS_OF_USE_URL} target="_blank" className="underline">
              Terms of Use
            </Link>{" "}
            and{" "}
            <Link to={PRIVACY_POLICY_URL} target="_blank" className="underline">
              Privacy Policy
            </Link>
            .
          </Trans>
        </p>
      </div>
    );
  }

  if (isAuthenticated && user?.workspaces.length === 0) {
    return (
      <div
        className={cn(
          "flex h-screen flex-col p-4",
          "bg-background text-foreground"
        )}
      >
        <div className="flex h-screen flex-col items-center justify-center gap-2 text-center">
          <Page.SectionHeader
            title={t`You are not a member of any workspace.`}
          />
          <Button
            label={t`Sign up on Dust`}
            onClick={() => {
              window.open("https://dust.tt", "_blank");
            }}
          />
          <div className="text-center">
            <Trans>Then</Trans>
          </div>
          <Button
            icon={LogIn01}
            variant="primary"
            label={t`Sign in`}
            onClick={() => handleLogin()}
            disabled={isLoading}
          />
          <div className="text-center">
            <Trans>Or</Trans>
          </div>
          <Button label={t`Sign out`} onClick={() => handleLogout()} />
        </div>
      </div>
    );
  }

  if (authError) {
    return (
      <div
        className={cn(
          "flex h-screen flex-col p-4",
          "bg-background text-foreground"
        )}
      >
        <div className="flex h-screen flex-col items-center justify-center gap-2 text-center">
          <Page.SectionHeader title={getAuthErrorMessage(authError)} />
          {authError.code === "user_not_found" ? (
            <>
              <Button
                label={t`Sign up on Dust`}
                onClick={() => {
                  window.open("https://dust.tt", "_blank");
                }}
              />
              <div className="text-center">
                <Trans>Then</Trans>
              </div>
              <Button
                icon={LogIn01}
                variant="primary"
                label={t`Sign in`}
                onClick={() => handleLogin()}
                disabled={isLoading}
              />
            </>
          ) : (
            <Button label={t`Sign out`} onClick={() => handleLogout()} />
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex h-screen flex-col p-4",
        "bg-background text-foreground"
      )}
    >
      <div className="flex h-screen flex-col items-center justify-center text-center">
        <Page.SectionHeader
          title={t`Something unexpected occurred. Please try logging in again. If the problem persists, contact us at support@dust.tt.`}
        />
        <Button label={t`Sign out`} onClick={() => handleLogout()} />
      </div>
    </div>
  );
};
