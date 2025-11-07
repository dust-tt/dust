import {
  BarHeader,
  Button,
  DustLogoSquare,
  Icon,
  Page,
} from "@dust-tt/sparkle";
import type { InferGetServerSidePropsType } from "next";
import { useCallback } from "react";

import { getMembershipInvitationToken } from "@app/lib/api/invitation";
import {
  getUserFromSession,
  withDefaultUserAuthPaywallWhitelisted,
} from "@app/lib/iam/session";
import { MembershipInvitationResource } from "@app/lib/resources/membership_invitation_resource";
import { useUser } from "@app/lib/swr/user";

type PendingInvitationOption = {
  invitationId: number;
  invitationSid: string;
  token: string;
  workspaceName: string;
  workspaceSid: string;
  initialRole: string;
  createdAt: number;
};

export const getServerSideProps = withDefaultUserAuthPaywallWhitelisted<{
  userFirstName: string;
  invitations: PendingInvitationOption[];
}>(async (context, _auth, session) => {
  const user = await getUserFromSession(session);
  if (!user) {
    return {
      notFound: true,
    };
  }

  const invitationsResources =
    await MembershipInvitationResource.listPendingForEmail(user.email);

  const invitations = invitationsResources.map((invitation) => {
    const workspace = invitation.workspace;

    return {
      invitationId: invitation.id,
      invitationSid: invitation.sId,
      token: getMembershipInvitationToken(invitation.id),
      workspaceName: workspace.name,
      workspaceSid: workspace.sId,
      initialRole: invitation.initialRole,
      createdAt: invitation.createdAt.getTime(),
    } satisfies PendingInvitationOption;
  });

  return {
    props: {
      userFirstName: user.firstName,
      invitations,
    },
  };
});

export default function InviteChoosePage({
  userFirstName,
  invitations,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const { user } = useUser();

  const handleInvitationSelection = useCallback(async (token: string) => {
    if (typeof window !== "undefined") {
      window.location.assign(
        `/api/login?inviteToken=${encodeURIComponent(token)}`
      );
    }
  }, []);

  return (
    <Page variant="normal">
      <BarHeader title="Joining Dust" className="ml-10 lg:ml-0" />
      <div className="mx-auto mt-40 flex max-w-2xl flex-col gap-8">
        <div className="flex flex-col gap-2">
          <div className="items-left justify-left flex flex-row">
            <Icon visual={DustLogoSquare} size="md" />
          </div>
          <span className="heading-2xl text-foreground dark:text-foreground-night">
            Hello {userFirstName}!
          </span>
        </div>
        <div className="flex flex-col gap-4">
          {invitations.length === 0 ? (
            <div className="body-sm text-muted-foreground">
              We couldn&apos;t find any pending invitations for{
                " "
              }
              {user?.email ?? "your account"}. Please contact your workspace
              admin or try another email address.
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="body-md text-foreground">
                Choose the workspace you would like to join:
              </div>
              <div className="flex flex-col gap-3">
                {invitations.map((invitation) => (
                  <div
                    key={invitation.invitationSid}
                    className="border-border-light bg-wash dark:bg-wash-dark flex items-center justify-between gap-4 rounded-xl border p-4 shadow-sm dark:border-border-night"
                  >
                    <div className="flex flex-col gap-1">
                      <span className="body-md font-medium text-foreground dark:text-foreground-night">
                        {invitation.workspaceName}
                      </span>
                      <span className="body-sm text-muted-foreground">
                        Role: {invitation.initialRole}
                      </span>
                    </div>
                    <Button
                      label="Join"
                      variant="primary"
                      size="sm"
                      onClick={() =>
                        handleInvitationSelection(invitation.token)
                      }
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </Page>
  );
}

