import {
  Button,
  DustLogoSquare,
  Hoverable,
  LoginIcon,
  Page,
} from "@dust-tt/sparkle";
import type { InferGetServerSidePropsType } from "next";

import OnboardingLayout from "@app/components/sparkle/OnboardingLayout";
import config from "@app/lib/api/config";
import { fetchUsersFromWorkOSWithEmails } from "@app/lib/api/workos/user";
import { getWorkspaceInfos } from "@app/lib/api/workspace";
import { getWorkspaceVerifiedDomains } from "@app/lib/api/workspace_domains";
import { makeGetServerSidePropsRequirementsWrapper } from "@app/lib/iam/session";
import { MembershipInvitationResource } from "@app/lib/resources/membership_invitation_resource";
import { getSignInUrl } from "@app/lib/signup";
import type { LightWorkspaceType } from "@app/types";

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
  onboardingType: OnboardingType;
  signInUrl: string;
  userExists: boolean;
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

  const workspaceDomains = await getWorkspaceVerifiedDomains(workspace);

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
    !workspaceDomains.some((d) => d.domainAutoJoinEnabled) &&
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
      const res = await MembershipInvitationResource.getPendingForToken(
        token ?? undefined
      );
      // Redirect to login error page with specific reason
      // if token validation fails.
      if (res.isErr()) {
        return {
          redirect: {
            destination: `/api/workos/logout?returnTo=/login-error${encodeURIComponent(`?type=email-invite&reason=${res.error.code}`)}`,
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

  const users = await fetchUsersFromWorkOSWithEmails([invitationEmail ?? ""]);
  const userExists = users.length > 0;

  const signInUrl = getSignInUrl({
    signupCallbackUrl: signUpCallbackUrl,
    invitationEmail: invitationEmail ?? undefined,
    userExists,
  });

  return {
    props: {
      baseUrl: config.getClientFacingUrl(),
      signInUrl,
      userExists,
      onboardingType,
      workspace,
    },
  };
});

export default function Join({
  onboardingType,
  signInUrl,
  userExists,
  workspace,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
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
