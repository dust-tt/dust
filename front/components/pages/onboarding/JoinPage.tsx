import {
  Button,
  DustLogoSquare,
  Hoverable,
  LoginIcon,
  Page,
  Spinner,
} from "@dust-tt/sparkle";
import { useEffect } from "react";

import OnboardingLayout from "@app/components/sparkle/OnboardingLayout";
import { useRequiredPathParam, useSearchParam } from "@app/lib/platform";
import { useJoinData } from "@app/lib/swr/workspaces";

function isRedirectResponse(data: unknown): data is { redirectUrl: string } {
  return (
    typeof data === "object" &&
    data !== null &&
    "redirectUrl" in data &&
    typeof (data as { redirectUrl: unknown }).redirectUrl === "string"
  );
}

export function JoinPage() {
  const wId = useRequiredPathParam("wId");
  const token = useSearchParam("t");
  const conversationId = useSearchParam("cId");

  const { joinData, isJoinDataLoading, isJoinDataError } = useJoinData({
    wId,
    token,
    conversationId,
  });

  const errorData = isJoinDataError?.response?.data;
  const redirectUrl = isRedirectResponse(errorData)
    ? errorData.redirectUrl
    : null;

  useEffect(() => {
    if (redirectUrl) {
      window.location.href = redirectUrl;
    }
  }, [redirectUrl]);

  if (isJoinDataLoading || redirectUrl) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (isJoinDataError || !joinData) {
    return <div>Page not found</div>;
  }

  const { onboardingType, signInUrl, userExists, workspace } = joinData;

  return (
    <OnboardingLayout
      owner={workspace}
      headerTitle="Welcome to Dust"
      headerRightActions={
        <Button
          variant="ghost"
          size="sm"
          label={userExists ? "Sign in" : "Sign up"}
          icon={LoginIcon}
          onClick={() => (window.location.href = signInUrl)}
        />
      }
    >
      <div className="flex h-full flex-col gap-8 pt-4 md:justify-center md:pt-0">
        <Page.Header
          title={`Hello there!`}
          icon={() => <DustLogoSquare className="-ml-11 h-10 w-32" />}
        />
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <p>Welcome aboard!</p>
            {onboardingType === "domain_conversation_link" ? (
              <p>
                Please log in or sign up with your company email to access this
                conversation.
              </p>
            ) : (
              <p>
                You've been invited to join{" "}
                <strong>{workspace.name}'s workspace on Dust</strong>.
              </p>
            )}
          </div>

          <p>
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
          </p>
        </div>

        <div className="flex flex-col items-center justify-center gap-4">
          <Button
            variant="primary"
            size="sm"
            label={userExists ? "Sign in" : "Sign up"}
            icon={LoginIcon}
            onClick={() => (window.location.href = signInUrl)}
          />
        </div>
        <div className="flex flex-col gap-3 pb-20">
          <p>
            By signing up, you accept Dust's{" "}
            <Hoverable
              href="https://dust.tt/terms"
              variant="highlight"
              target="_blank"
            >
              terms and conditions
            </Hoverable>
            .
          </p>
        </div>
      </div>
    </OnboardingLayout>
  );
}

export default JoinPage;
