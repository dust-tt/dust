import { GoogleLogo, Logo } from "@dust-tt/sparkle";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { signIn } from "next-auth/react";

import { SignInButton } from "@app/components/Button";
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
  workspaceName: string;
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
      workspaceName: workspace.name,
      signUpCallbackUrl: signUpCallbackUrl,
      baseUrl: URL,
      gaTrackingId: GA_TRACKING_ID,
    },
  };
};

export default function Join({
  onboardingType,
  workspaceName,
  signUpCallbackUrl,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 top-0 -z-50 bg-slate-800" />
      <main className="z-10 mx-6">
        <div className="container mx-auto sm:max-w-3xl lg:max-w-4xl xl:max-w-5xl">
          <div style={{ height: "10vh" }}></div>
          <div className="grid grid-cols-1">
            <div>
              <Logo className="h-[48px] w-[192px] px-1" />
            </div>
            <p className="mt-16 font-objektiv text-4xl font-bold tracking-tighter text-slate-50 md:text-6xl">
              <span className="text-red-400 sm:font-objektiv md:font-objektiv">
                Secure AI assistant
              </span>{" "}
              <br />
              with your company’s knowledge
              <br />
            </p>
          </div>
          <div className="h-10"></div>
          <div className="font-regular text-lg text-slate-200">
            <p>Glad to see you!</p>

            {onboardingType === "domain_conversation_link" ? (
              <p>
                Please log in or sign up with your company email to access this
                conversation.
              </p>
            ) : (
              <p>
                You've been invited to join the {workspaceName} workspace on
                Dust.
              </p>
            )}

            {onboardingType === "email_invite" && (
              <p>How would you like to connect?</p>
            )}
          </div>

          <div className="h-16" />

          <div className="flex flex-col items-center justify-center gap-4">
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
        </div>
      </main>
    </>
  );
}
