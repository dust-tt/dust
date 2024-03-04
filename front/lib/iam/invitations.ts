import { FrontApiError } from "@dust-tt/types";
import { verify } from "jsonwebtoken";

import type { User } from "@app/lib/models";
import { MembershipInvitation } from "@app/lib/models";

const { DUST_INVITE_TOKEN_SECRET = "" } = process.env;

export async function getPendingMembershipInvitationForToken(
  inviteToken: string | string[] | undefined
): Promise<MembershipInvitation | null> {
  if (inviteToken && typeof inviteToken === "string") {
    const decodedToken = verify(inviteToken, DUST_INVITE_TOKEN_SECRET) as {
      membershipInvitationId: number;
    };

    const membershipInvite = await MembershipInvitation.findOne({
      where: {
        id: decodedToken.membershipInvitationId,
        status: "pending",
      },
    });
    if (!membershipInvite) {
      throw new FrontApiError(
        "The invite token is invalid, please ask your admin to resend an invitation.",
        400,
        "invalid_request_error"
      );
    }

    return membershipInvite;
  }

  return null;
}

export async function markInvitationAsConsumed(
  membershipInvite: MembershipInvitation,
  user: User
) {
  membershipInvite.status = "consumed";
  membershipInvite.invitedUserId = user.id;

  await membershipInvite.save();
}
