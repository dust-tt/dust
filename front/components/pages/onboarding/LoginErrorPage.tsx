import config from "@app/lib/api/config";
import { LinkWrapper, useSearchParam } from "@app/lib/platform";
import { Button, DustLogoSquare, Icon, LogIn01, Page } from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";

const defaultErrorMessageClassName = "text-base text-primary-100";

interface LoginErrorMessageProps {
  domain: string | null;
  reason: string | null;
}

function LoginErrorMessage({ domain, reason }: LoginErrorMessageProps) {
  const { t } = useLingui();

  const headerNode = (
    <Page.Header
      title={
        <span className="text-primary-50">
          <Trans>We couldn't log you in.</Trans>
        </span>
      }
    />
  );

  if (domain || reason === "invalid_domain") {
    const emailDomain = `@${domain}`;
    return (
      <>
        {headerNode}
        <p className={defaultErrorMessageClassName}>
          {domain ? (
            <Trans>
              The domain {emailDomain} attached to your email address is not
              authorized to join this workspace.
            </Trans>
          ) : (
            <Trans>
              The domain attached to your email address is not authorized to
              join this workspace.
            </Trans>
          )}
          <br />
          <Trans>
            Please contact your workspace admin to get access or contact us at
            support@dust.tt for assistance.
          </Trans>
        </p>
      </>
    );
  }

  switch (reason) {
    case "unauthorized":
      return (
        <>
          {headerNode}
          <p className={defaultErrorMessageClassName}>
            <Trans>
              Oops! Looks like you're not authorized to access this application
              yet.
            </Trans>
            <br />
            <Trans>
              To gain access, please ask your workspace administrator to add you
              or your domain.
            </Trans>
            <br />
            <Trans>Need more help? Email us at support@dust.tt.</Trans>
          </p>
        </>
      );

    case "blacklisted_domain":
      // Deliberately shady message, to avoid frauders to know they are
      // blacklisted and try another domain
      return (
        <>
          {headerNode}
          <p className={defaultErrorMessageClassName}>
            <Trans>
              Unfortunately, we cannot provide access to Dust at this time.
            </Trans>
            <br />
            <Trans>Have a nice day.</Trans>
          </p>
        </>
      );

    case "email_not_verified":
      return (
        <>
          <Page.Header
            title={
              <span className="text-primary-50">
                <Trans>
                  Keep an eye
                  <br />
                  on your inbox!
                </Trans>
              </span>
            }
          />
          <p className={defaultErrorMessageClassName}>
            <Trans>
              For your security, we need to verify your email address.
            </Trans>
            <br />
            <Trans>Check your inbox for a verification email.</Trans>
          </p>
          <p className="text-sm font-normal italic text-primary-300">
            <Trans>Not seeing it?</Trans>
            <br />
            <Trans>Check your spam folder.</Trans>
          </p>

          <Button
            variant="outline"
            size="sm"
            label={t`Sign in`}
            icon={LogIn01}
            onClick={() => {
              window.location.href = `${config.getApiBaseUrl()}/api/workos/login?returnTo=/api/login`;
            }}
          />
        </>
      );

    case "invalid_invitation_token":
      return (
        <>
          {headerNode}
          <p className={defaultErrorMessageClassName}>
            <Trans>The invitation is no longer valid.</Trans>
            <br />
            <Trans>
              To gain access, please ask your workspace administrator to add
              you.
            </Trans>
            <br />
            <Trans>Need more help? Email us at support@dust.tt.</Trans>
          </p>
        </>
      );

    case "invitation_token_email_mismatch":
      return (
        <>
          {headerNode}
          <p className={defaultErrorMessageClassName}>
            <Trans>
              It looks like there's a mismatch between the invitation and the
              email address provided.
            </Trans>
            <br />
            <Trans>
              Please verify your email or contact your workspace administrator
              for assistance.
            </Trans>
            <br />
            <Trans>Need more help? Email us at support@dust.tt.</Trans>
          </p>
        </>
      );

    case "revoked":
      return (
        <>
          {headerNode}
          <p className={defaultErrorMessageClassName}>
            <Trans>Your access to the workspace has expired!</Trans>
            <br />
            <Trans>
              Contact your workspace administrator to update your role.
            </Trans>
            <br />
            <Trans>Need more help? Email us at support@dust.tt.</Trans>
          </p>
        </>
      );

    default:
      return (
        <>
          {headerNode}
          <p className={defaultErrorMessageClassName}>
            <Trans>Please contact us at support@dust.tt for assistance.</Trans>
          </p>
        </>
      );
  }
}

export function LoginErrorPage() {
  const { t } = useLingui();
  const domain = useSearchParam("domain");
  const reason = useSearchParam("reason");

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 top-0 -z-50 bg-primary-800" />
      <main className="z-10 mx-6">
        <div className="flex h-full flex-col items-center justify-center">
          <div className="flex flex-col items-center gap-6 text-center">
            <Icon visual={DustLogoSquare} size="lg" />
            <div className="flex flex-col items-center gap-6">
              <LoginErrorMessage domain={domain} reason={reason} />
            </div>
            <LinkWrapper href="/">
              <Button variant="primary" label={t`Back to homepage`} size="sm" />
            </LinkWrapper>
          </div>
        </div>
      </main>
    </>
  );
}

export default LoginErrorPage;
