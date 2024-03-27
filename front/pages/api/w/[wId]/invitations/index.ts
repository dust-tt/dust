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
  createInvitation,
  deleteInvitation,
  sendWorkspaceInvitationEmail,
} from "@app/lib/api/invitation";
import { getPendingInvitations } from "@app/lib/api/invitation";
import { getMembersCountForWorkspace } from "@app/lib/api/workspace";
import { Authenticator, getSession } from "@app/lib/auth";
import { isEmailValid } from "@app/lib/utils";
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
        (await getMembersCountForWorkspace(owner, { activeOnly: true }));
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

      const invitationResults = await Promise.all(
        invitationRequests.map(async ({ email, role }) => {
          try {
            const invitation = await createInvitation(owner, email, role);
            await sendWorkspaceInvitationEmail(owner, user, invitation);
          } catch (e) {
            await deleteInvitation(owner, email);
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
          message: "The method passed is not supported, GET is expected.",
        },
      });
  }
}

export default withLogging(handler);
