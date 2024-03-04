import { GoogleLogo, Logo, Page } from "@dust-tt/sparkle";
import type { LightWorkspaceType } from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";
import { signIn } from "next-auth/react";

import { SignInButton } from "@app/components/Button";
import { A } from "@app/components/home/contentComponents";
import OnboardingLayout from "@app/components/sparkle/OnboardingLayout";
import {
  getWorkspaceInfos,
  getWorkspaceVerifiedDomain,
} from "@app/lib/api/workspace";
import { withGetServerSidePropsLogging } from "@app/logger/withlogging";

const { URL = "", GA_TRACKING_ID = "" } = process.env;

/**
 * 3 ways to end up here:
 *
 * Case 1: "email_invite"
 *   url = /w/[wId]/join?t=[token]
 *      -> you've been invited to a workspace by email from the member management page.
 *      -> we don't care if workspace has a verified domain with auto-join enabled.
 *
 * Case 2: "domain_conversation_link"
 *   url = /w/[wId]/join?cId=[conversationId]
 *      -> you're redirected to this page from trying to access a conversation if you're not logged in and the workspace has a verified domain.
 *      -> the workspace needs to have a verified domain with auto-join enabled. *
 *
 * Case 3: "join_workspace"
 *   url = /w/[wId]/join?wId=[workspaceId]
 *      -> you're redirected to this page from trying to join a workspace and the workspace has a verified domain.
 *      -> the workspace needs to have a verified domain with auto-join enabled. *
 */

type OnboardingType =
  | "email_invite"
  | "domain_conversation_link"
  | "domain_invite_link";

export const getServerSideProps = withGetServerSidePropsLogging<{
  onboardingType: OnboardingType;
  workspace: LightWorkspaceType;
  signUpCallbackUrl: string;
  gaTrackingId: string;
  baseUrl: string;
}>(async (context) => {
  const wId = context.query.wId as string;
  if (!wId) {
    return {
      notFound: true,
    };
  }
  const workspace = await getWorkspaceInfos(wId);
  if (!workspace) {
    return {
      notFound: true,
    };
  }
  const workspaceDomain = await getWorkspaceVerifiedDomain(workspace);

  const cId = typeof context.query.cId === "string" ? context.query.cId : null;
  const token = typeof context.query.t === "string" ? context.query.t : null;
  let onboardingType: OnboardingType | null = null;

  if (cId) {
    onboardingType = "domain_conversation_link";
  } else if (token) {
    onboardingType = "email_invite";
  } else {
    onboardingType = "domain_invite_link";
  }

  // Redirect to 404 if in a flow where we need a verified domain and there is none.
  if (
    !workspaceDomain?.domainAutoJoinEnabled &&
    ["domain_conversation_link", "domain_invite_link"].includes(onboardingType)
  ) {
    return {
      notFound: true,
    };
  }

  let signUpCallbackUrl: string | undefined = undefined;
  switch (onboardingType) {
    case "domain_conversation_link":
      signUpCallbackUrl = `/api/login?wId=${wId}&cId=${cId}&join=true`;
      break;
    case "email_invite":
      signUpCallbackUrl = `/api/login?inviteToken=${token}`;
      break;
    case "domain_invite_link":
      signUpCallbackUrl = `/api/login?wId=${wId}`;
      break;
    default:
      return {
        notFound: true,
      };
  }

  return {
    props: {
      onboardingType: onboardingType,
      workspace: workspace,
      signUpCallbackUrl: signUpCallbackUrl,
      baseUrl: URL,
      gaTrackingId: GA_TRACKING_ID,
    },
  };
});

export default function Join({
  onboardingType,
  workspace,
  signUpCallbackUrl,
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const handleSignUpClick = () =>
    signIn("google", {
      callbackUrl: signUpCallbackUrl,
    });

  return (
    <OnboardingLayout
      owner={workspace}
      gaTrackingId={gaTrackingId}
      headerTitle="Welcome to Dust"
      headerRightActions={
        <SignInButton
          label="Sign up with Google"
          icon={GoogleLogo}
          size="sm"
          onClick={handleSignUpClick}
        />
      }
    >
      <div className="flex flex-col gap-8">
        <Page.Header
          title={`Hello there!`}
          icon={() => <Logo className="-ml-8 h-4 w-32" />}
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
            Dust is a platform giving you access to the best AI assistants. It's
            easy to use and it's a great place for teams to collaborate. Learn
            more about Dust on{" "}
            <A href="https://dust.tt" target="_blank">
              our website
            </A>
            .
          </p>
        </div>

        <div className="flex flex-col items-center justify-center gap-4 ">
          {
            <SignInButton
              label="Sign up with Google"
              icon={GoogleLogo}
              onClick={handleSignUpClick}
            />
          }
        </div>
        <div className="flex flex-col gap-3 pb-20">
          <p>
            By signing-up, you accept Dust's{" "}
            <A href="https://dust.tt/terms" target="_blank">
              terms and conditions
            </A>
            .
          </p>
        </div>
      </div>
    </OnboardingLayout>
  );
}
