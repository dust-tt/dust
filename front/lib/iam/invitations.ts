import type { Result } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import { verify } from "jsonwebtoken";

import { AuthFlowError } from "@app/lib/iam/errors";
import type { User } from "@app/lib/models";
import { MembershipInvitation } from "@app/lib/models";

const { DUST_INVITE_TOKEN_SECRET = "" } = process.env;

export async function getPendingMembershipInvitationForToken(
  inviteToken: string | string[] | undefined
): Promise<Result<MembershipInvitation | null, AuthFlowError>> {
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
      return new Err(
        new AuthFlowError(
          "The invite token is invalid, please ask your admin to resend an invitation."
        )
      );
    }

    return new Ok(membershipInvite);
  }

  return new Ok(null);
}

export async function markInvitationAsConsumed(
  membershipInvite: MembershipInvitation,
  user: User
) {
  membershipInvite.status = "consumed";
  membershipInvite.invitedUserId = user.id;

  await membershipInvite.save();
}
