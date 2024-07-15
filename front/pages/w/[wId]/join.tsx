import { Button, LoginIcon, LogoSquareColorLogo, Page } from "@dust-tt/sparkle";
import type { LightWorkspaceType } from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";
import Link from "next/link";

import OnboardingLayout from "@app/components/sparkle/OnboardingLayout";
import config from "@app/lib/api/config";
import {
  getWorkspaceInfos,
  getWorkspaceVerifiedDomain,
} from "@app/lib/api/workspace";
import { getPendingMembershipInvitationForToken } from "@app/lib/iam/invitations";
import { makeGetServerSidePropsRequirementsWrapper } from "@app/lib/iam/session";

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

export const getServerSideProps = makeGetServerSidePropsRequirementsWrapper({
  requireUserPrivilege: "none",
})<{
  baseUrl: string;
  gaTrackingId: string;
  invitationEmail: string | null;
  onboardingType: OnboardingType;
  signUpCallbackUrl: string;
  workspace: LightWorkspaceType;
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
  let invitationEmail: string | null = null;
  switch (onboardingType) {
    case "domain_conversation_link":
      signUpCallbackUrl = `/api/login?wId=${wId}&cId=${cId}&join=true`;
      break;
    case "email_invite": {
      signUpCallbackUrl = `/api/login?inviteToken=${token}`;
      const res = await getPendingMembershipInvitationForToken(
        token ?? undefined
      );
      // Redirect to login error page with specific reason
      // if token validation fails.
      if (res.isErr()) {
        return {
          redirect: {
            destination: `/api/auth/logout?returnTo=/login-error?reason=${res.error.code}`,
            permanent: false,
          },
        };
      }

      if (res.value) {
        invitationEmail = res.value.inviteEmail;
      }
      break;
    }

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
      baseUrl: config.getClientFacingUrl(),
      gaTrackingId: config.getGaTrackingId(),
      invitationEmail,
      onboardingType,
      signUpCallbackUrl,
      workspace,
    },
  };
});

export default function Join({
  gaTrackingId,
  invitationEmail,
  onboardingType,
  signUpCallbackUrl,
  workspace,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  let signUpUrl = `/api/auth/login?returnTo=${signUpCallbackUrl}&screen_hint=signup`;

  if (invitationEmail) {
    signUpUrl += `&login_hint=${encodeURIComponent(invitationEmail)}`;
  }

  return (
    <OnboardingLayout
      owner={workspace}
      gaTrackingId={gaTrackingId}
      headerTitle="Welcome to Dust"
      headerRightActions={
        <Button
          variant="tertiary"
          size="sm"
          label="Sign up"
          icon={LoginIcon}
          onClick={() => (window.location.href = signUpUrl)}
        />
      }
    >
      <div className="flex h-full flex-col gap-8 pt-4 md:justify-center md:pt-0">
        <Page.Header
          title={`Hello there!`}
          icon={() => <LogoSquareColorLogo className="-ml-11 h-10 w-32" />}
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
            <Link
              href="https://dust.tt"
              className="cursor-pointer text-sm font-bold text-action-500"
              target="_blank"
            >
              our website
            </Link>
            .
          </p>
        </div>

        <div className="flex flex-col items-center justify-center gap-4">
          <Button
            variant="primary"
            size="sm"
            label="Sign up"
            icon={LoginIcon}
            onClick={() => (window.location.href = signUpUrl)}
          />
        </div>
        <div className="flex flex-col gap-3 pb-20">
          <p>
            By signing-up, you accept Dust's{" "}
            <Link
              href="https://dust.tt/terms"
              className="cursor-pointer text-sm font-bold text-action-500"
              target="_blank"
            >
              terms and conditions
            </Link>
            .
          </p>
        </div>
      </div>
    </OnboardingLayout>
  );
}
