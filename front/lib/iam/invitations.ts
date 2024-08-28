import type {
  LightWorkspaceType,
  MembershipInvitationType,
  Result,
} from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import { verify } from "jsonwebtoken";

import config from "@app/lib/api/config";
import { getMembershipInvitationUrl } from "@app/lib/api/invitation";
import { AuthFlowError } from "@app/lib/iam/errors";
import { MembershipInvitation, Workspace } from "@app/lib/models/workspace";
import type { UserResource } from "@app/lib/resources/user_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";

export async function getPendingMembershipInvitationForToken(
  inviteToken: string | string[] | undefined
): Promise<Result<MembershipInvitation | null, AuthFlowError>> {
  if (inviteToken && typeof inviteToken === "string") {
    let decodedToken: { membershipInvitationId: number } | null = null;
    try {
      decodedToken = verify(inviteToken, config.getDustInviteTokenSecret()) as {
        membershipInvitationId: number;
      };
    } catch (e) {
      // Log the error and continue as we test `deodedToken` is not null below.
      logger.error(
        {
          error: e,
        },
        "Error while verifying invite token"
      );
    }
    if (!decodedToken) {
      return new Err(
        new AuthFlowError(
          "invalid_invitation_token",
          "The invite token is invalid, please ask your admin to resend an invitation."
        )
      );
    }

    const membershipInvite = await MembershipInvitation.findOne({
      where: {
        id: decodedToken.membershipInvitationId,
        status: "pending",
      },
    });
    if (!membershipInvite) {
      return new Err(
        new AuthFlowError(
          "invalid_invitation_token",
          "The invite token is invalid, please ask your admin to resend an invitation."
        )
      );
    }

    return new Ok(membershipInvite);
  }

  return new Ok(null);
}

export async function getPendingMembershipInvitationForEmailAndWorkspace(
  email: string,
  workspaceId: number
): Promise<MembershipInvitation | null> {
  return MembershipInvitation.findOne({
    where: {
      inviteEmail: email,
      workspaceId,
      status: "pending",
    },
  });
}

export async function getPendingMembershipInvitationWithWorkspaceForEmail(
  email: string
): Promise<{
  invitation: MembershipInvitationType;
  workspace: LightWorkspaceType;
} | null> {
  const pendingInvitation = await MembershipInvitation.findOne({
    where: {
      inviteEmail: email,
      status: "pending",
    },
    include: [Workspace],
  });

  if (pendingInvitation) {
    const workspace = renderLightWorkspaceType({
      workspace: pendingInvitation.workspace,
    });

    return {
      invitation: {
        createdAt: pendingInvitation.createdAt.getTime(),
        id: pendingInvitation.id,
        initialRole: pendingInvitation.initialRole,
        inviteLink: getMembershipInvitationUrl(workspace, pendingInvitation.id),
        inviteEmail: pendingInvitation.inviteEmail,
        sId: pendingInvitation.sId,
        status: pendingInvitation.status,
      },
      workspace,
    };
  }

  return null;
}

export async function markInvitationAsConsumed(
  membershipInvite: MembershipInvitation,
  user: UserResource
) {
  membershipInvite.status = "consumed";
  membershipInvite.invitedUserId = user.id;

  await membershipInvite.save();
}
