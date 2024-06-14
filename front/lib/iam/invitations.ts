import type { Result, UserType } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import { verify } from "jsonwebtoken";

import { AuthFlowError } from "@app/lib/iam/errors";
import { MembershipInvitation } from "@app/lib/models/workspace";
import logger from "@app/logger/logger";

const { DUST_INVITE_TOKEN_SECRET = "" } = process.env;

export async function getPendingMembershipInvitationForToken(
  inviteToken: string | string[] | undefined
): Promise<Result<MembershipInvitation | null, AuthFlowError>> {
  if (inviteToken && typeof inviteToken === "string") {
    let decodedToken: { membershipInvitationId: number } | null = null;
    try {
      decodedToken = verify(inviteToken, DUST_INVITE_TOKEN_SECRET) as {
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

export async function markInvitationAsConsumed(
  membershipInvite: MembershipInvitation,
  user: UserType
) {
  membershipInvite.status = "consumed";
  membershipInvite.invitedUserId = user.id;

  await membershipInvite.save();
}
