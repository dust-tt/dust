import type {
  MembershipInvitationType,
  WithAPIErrorReponse,
} from "@dust-tt/types";
import { ActiveRoleSchema } from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import {
  batchUnrevokeInvitations,
  getRecentPendingAndRevokedInvitations,
  sendWorkspaceInvitationEmail,
  updateOrCreateInvitation,
} from "@app/lib/api/invitation";
import { getPendingInvitations } from "@app/lib/api/invitation";
import { getMembers } from "@app/lib/api/workspace";
import { Authenticator, getSession } from "@app/lib/auth";
import { MAX_UNCONSUMED_INVITATIONS_PER_WORKSPACE_PER_DAY } from "@app/lib/invitations";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { isEmailValid } from "@app/lib/utils";
import logger from "@app/logger/logger";
import { apiError, withLogging } from "@app/logger/withlogging";

export type GetWorkspaceInvitationsResponseBody = {
  invitations: MembershipInvitationType[];
};

export const PostInvitationRequestBodySchema = t.array(
  t.type({
    email: t.string,
    role: ActiveRoleSchema,
  })
);

export type PostInvitationRequestBody = t.TypeOf<
  typeof PostInvitationRequestBodySchema
>;

export type PostInvitationResponseBody = {
  success: boolean;
  email: string;
  error_message?: string;
}[];

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorReponse<
      GetWorkspaceInvitationsResponseBody | PostInvitationResponseBody
    >
  >
): Promise<void> {
  const session = await getSession(req, res);
  const auth = await Authenticator.fromSession(
    session,
    req.query.wId as string
  );

  const owner = auth.workspace();
  const user = auth.user();
  if (!owner || !user) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "The workspace was not found.",
      },
    });
  }

  if (!auth.isAdmin()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message:
          "Only users that are `admins` for the current workspace can see membership invitations or modify it.",
      },
    });
  }

  const subscription = auth.subscription();
  const plan = auth.plan();
  if (!subscription || !plan) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_auth_error",
        message: "The subscription was not found.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      const invitations = await getPendingInvitations(auth);
      res.status(200).json({ invitations });
      return;

    case "POST":
      const bodyValidation = PostInvitationRequestBodySchema.decode(req.body);
      if (isLeft(bodyValidation)) {
        const pathError = reporter.formatValidationErrors(bodyValidation.left);
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${pathError}`,
          },
        });
      }

      if (subscription.paymentFailingSince) {
        return apiError(req, res, {
          status_code: 402,
          api_error: {
            type: "subscription_payment_failed",
            message:
              "The subscription payment has failed, impossible to add new members.",
          },
        });
      }

      const invitationRequests = bodyValidation.right;

      const { maxUsers } = subscription.plan.limits.users;
      const availableSeats =
        maxUsers -
        (await MembershipResource.getMembersCountForWorkspace({
          workspace: owner,
          activeOnly: true,
        }));
      if (maxUsers !== -1 && availableSeats < invitationRequests.length) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "plan_limit_error",
            message: `Not enough seats lefts (${availableSeats} seats remaining). Please upgrade or remove inactive members to add more.`,
          },
        });
      }

      const invalidEmails = invitationRequests.filter(
        (b) => !isEmailValid(b.email)
      );
      if (invalidEmails.length > 0) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Invalid email address(es): " + invalidEmails.join(", "),
          },
        });
      }
      const existingMembers = await getMembers(auth);
      const unconsumedInvitations = await getRecentPendingAndRevokedInvitations(
        auth
      );
      if (
        unconsumedInvitations.pending.length >=
        MAX_UNCONSUMED_INVITATIONS_PER_WORKSPACE_PER_DAY
      ) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Too many pending invitations. Please ask your members to consume their invitations before sending more.`,
          },
        });
      }

      const emailsWithRecentUnconsumedInvitations = new Set([
        ...unconsumedInvitations.pending.map((i) =>
          i.inviteEmail.toLowerCase().trim()
        ),
        ...unconsumedInvitations.revoked.map((i) =>
          i.inviteEmail.toLowerCase().trim()
        ),
      ]);
      const requestedEmails = new Set(
        invitationRequests.map((r) => r.email.toLowerCase().trim())
      );
      const emailsToSendInvitations = invitationRequests.filter(
        (r) =>
          !emailsWithRecentUnconsumedInvitations.has(
            r.email.toLowerCase().trim()
          )
      );
      const invitationsToUnrevoke = unconsumedInvitations.revoked.filter((i) =>
        requestedEmails.has(i.inviteEmail.toLowerCase().trim())
      );

      if (
        !emailsToSendInvitations.length &&
        !invitationsToUnrevoke &&
        invitationRequests.length > 0
      ) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invitation_already_sent_recently",
            message: `These emails have already received an invitation in the last 24 hours. Please wait before sending another invitation.`,
          },
        });
      }
      await batchUnrevokeInvitations(
        auth,
        invitationsToUnrevoke.map((i) => i.sId)
      );
      const invitationResults = await Promise.all(
        emailsToSendInvitations.map(async ({ email, role }) => {
          if (existingMembers.find((m) => m.email === email)) {
            return {
              success: false,
              email,
              error_message:
                "Cannot send invitation to existing member (active or revoked)",
            };
          }

          try {
            const invitation = await updateOrCreateInvitation(
              owner,
              email,
              role
            );
            await sendWorkspaceInvitationEmail(owner, user, invitation);
          } catch (e) {
            logger.error(
              {
                error: e,
                message: "Failed to send invitation email",
                email,
              },
              "Failed to send invitation email"
            );
            return {
              success: false,
              email,
              error_message: e instanceof Error ? e.message : "Unknown error",
            };
          }
          return {
            success: true,
            email,
          };
        })
      );

      res.status(200).json(invitationResults);
      return;

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET or POST are expected.",
        },
      });
  }
}

export default withLogging(handler);
