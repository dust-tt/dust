import Custom404 from "@app/components/pages/Custom404";
import OnboardingLayout from "@app/components/sparkle/OnboardingLayout";
import { useFormatErrorDescription } from "@app/hooks/useFormatErrorDescription";
import { useRequiredPathParam, useSearchParam } from "@app/lib/platform";
import { useJoinData } from "@app/lib/swr/workspaces";
import {
  AlertCircle,
  Button,
  DustLogoSquare,
  Hoverable,
  Icon,
  LogIn01,
  Page,
  Spinner,
} from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";
import { useEffect } from "react";

export function JoinPage() {
  const wId = useRequiredPathParam("wId");
  const token = useSearchParam("t");
  const conversationId = useSearchParam("cId");
  const formatErrorDescription = useFormatErrorDescription();
  const { t } = useLingui();

  const {
    joinData,
    isJoinDataLoading,
    redirectUrl,
    joinDataError,
    mutateJoinData,
  } = useJoinData({
    wId,
    token,
    conversationId,
  });

  // Redirect when the API returns a redirect URL (e.g. invalid/expired token).
  useEffect(() => {
    if (redirectUrl) {
      window.location.href = redirectUrl;
    }
  }, [redirectUrl]);

  // Show 404 for unknown workspaces or missing auto-join domains.
  if (!isJoinDataLoading && !joinData) {
    if (joinDataError) {
      const errorMessage = formatErrorDescription(joinDataError);

      return (
        <div className="flex h-dvh items-center justify-center">
          <div className="flex max-w-md flex-col gap-3 text-center">
            <div className="flex flex-col items-center gap-2">
              <Icon
                visual={AlertCircle}
                size="lg"
                className="text-warning-400"
              />
              <p className="heading-xl leading-7 text-foreground">
                <Trans>Something went wrong</Trans>
              </p>
              <p className="copy-sm leading-tight text-muted-foreground">
                <Trans>
                  We couldn't load the invitation. Please try again.
                </Trans>
              </p>
              <p className="copy-xs font-mono text-muted-foreground">
                {errorMessage}
              </p>
            </div>
            <Button
              variant="outline"
              label={t`Retry`}
              onClick={() => void mutateJoinData()}
            />
          </div>
        </div>
      );
    }
    return <Custom404 />;
  }

  if (!joinData) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const { onboardingType, signInUrl, userExists, workspace } = joinData;
  const workspaceName = workspace.name;

  return (
    <OnboardingLayout owner={workspace}>
      <div className="flex h-full flex-col gap-8 pt-4 md:justify-center md:pt-0">
        <DustLogoSquare className="-ml-11 h-10 w-32" />
        <Page.Header title={t`Hello there!`} />
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <p>
              <Trans>Welcome aboard!</Trans>
            </p>
            {onboardingType === "domain_conversation_link" ? (
              <p>
                <Trans>
                  Please log in or sign up with your company email to access
                  this conversation.
                </Trans>
              </p>
            ) : (
              <p>
                <Trans>
                  You've been invited to join{" "}
                  <strong>{workspaceName}'s workspace on Dust</strong>.
                </Trans>
              </p>
            )}
          </div>

          <p>
            <Trans>
              Dust is a platform giving you access to the best AI agents. It's
              easy to use and it's a great place for teams to collaborate. Learn
              more about Dust on{" "}
              <Hoverable
                href="https://dust.tt"
                variant="highlight"
                target="_blank"
              >
                our website
              </Hoverable>
              .
            </Trans>
          </p>
        </div>

        <div className="flex flex-col items-center justify-center gap-4">
          <Button
            variant="primary"
            size="sm"
            label={userExists ? t`Sign in` : t`Sign up`}
            icon={LogIn01}
            onClick={() => (window.location.href = signInUrl)}
          />
        </div>
        <div className="flex flex-col gap-3 pb-20">
          <p>
            <Trans>
              By signing up, you accept Dust's{" "}
              <Hoverable
                href="https://dust.tt/terms"
                variant="highlight"
                target="_blank"
              >
                terms and conditions
              </Hoverable>
              .
            </Trans>
          </p>
        </div>
      </div>
    </OnboardingLayout>
  );
}

export default JoinPage;
