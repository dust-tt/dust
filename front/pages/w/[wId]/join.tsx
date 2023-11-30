import { GoogleLogo, Logo } from "@dust-tt/sparkle";
import { WorkspaceType } from "@dust-tt/types";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { signIn } from "next-auth/react";

import { SignInButton } from "@app/components/Button";
import { A, H1, P, Strong } from "@app/components/home/contentComponents";
import OnboardingLayout from "@app/components/sparkle/OnboardingLayout";
import { getWorkspaceInfos } from "@app/lib/api/workspace";

const { URL = "", GA_TRACKING_ID = "" } = process.env;

/**
 * 3 ways to end up here:
 *
 * Case 1: "email_invite"
 *   url = /w/[wId]/join?t=[token]
 *      -> you've been invited to a workspace by email from the member management page.
 *      -> we don't care if workspace has allowed domain.
 *
 * Case 2: "domain_invite_link"
 *   url = /w/[wId]/join
 *      -> Workspace has activated onboarding with link for an allowed domain.
 *      -> the workspace needs to have allowed domain.
 *
 * Case 3: "domain_conversation_link"
 *   url = /w/[wId]/join?cId=[conversationId]
 *      -> you're redirected to this page from trying to access a conversation if you're not logged in and the workspace has allowed domain.
 *      -> the workspace needs to have allowed domain. *
 */

type OnboardingType =
  | "email_invite"
  | "domain_invite_link"
  | "domain_conversation_link";

export const getServerSideProps: GetServerSideProps<{
  onboardingType: OnboardingType;
  workspace: WorkspaceType;
  signUpCallbackUrl: string;
  gaTrackingId: string;
  baseUrl: string;
}> = async (context) => {
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

  const cId = typeof context.query.cId === "string" ? context.query.cId : null;
  const token = typeof context.query.t === "string" ? context.query.t : null;

  const onboardingType: OnboardingType = cId
    ? "domain_conversation_link"
    : token
    ? "email_invite"
    : "domain_invite_link";

  // Redirect to 404 if in a flow where we need allowed domain and domain is not allowed.
  if (
    !workspace.allowedDomain &&
    (onboardingType === "domain_conversation_link" ||
      onboardingType === "domain_invite_link")
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
};

export default function Join({
  onboardingType,
  workspace,
  signUpCallbackUrl,
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <OnboardingLayout owner={workspace} gaTrackingId={gaTrackingId}>
      <div className="flex flex-col gap-12">
        <div className="my-20">
          <Logo className="h-[48px] w-[192px] px-1" />
        </div>
        <H1 className="text-slate-100">
          <span className="text-red-400">Amplify your team's potential</span>{" "}
          <br />
          with customizable and secure AI&nbsp;assistants.
        </H1>
        <div className="flex flex-col gap-1">
          <P>Welcome aboard!</P>
          {onboardingType === "domain_conversation_link" ? (
            <P>
              Please log in or sign up with your company email to access this
              conversation.
            </P>
          ) : (
            <P>
              You've been invited to join the{" "}
              <Strong>{workspace.name} workspace on Dust</Strong>.
            </P>
          )}
        </div>

        {onboardingType === "email_invite" && (
          <P>How would you like to connect?</P>
        )}

        <div className="flex flex-col items-center justify-center gap-4 ">
          <SignInButton
            label="Sign up with Google"
            icon={GoogleLogo}
            onClick={() => {
              void signIn("google", {
                callbackUrl: signUpCallbackUrl,
              });
            }}
          />
        </div>
        <div className="flex flex-col gap-3">
          <P>
            <Strong>Dust</Strong> is a platform giving you access to{" "}
            <Strong>the best AI assistants</Strong>.
            <br />
            It's easy to&nbsp;use and it's a&nbsp;great place for teams
            to&nbsp;collaborate.
          </P>
          <P>
            Learn more about Dust on{" "}
            <A href="https://dust.tt/" target="_blank" variant="secondary">
              our homepage
            </A>
            .
          </P>
        </div>
      </div>
    </OnboardingLayout>
  );
}
