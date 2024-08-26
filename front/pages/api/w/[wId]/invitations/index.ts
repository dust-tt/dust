import type {
  MembershipInvitationType,
  WithAPIErrorResponse,
} from "@dust-tt/types";
import { ActiveRoleSchema } from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { handleMembershipInvitations } from "@app/lib/api/invitation";
import { getPendingInvitations } from "@app/lib/api/invitation";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";

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
    WithAPIErrorResponse<
      GetWorkspaceInvitationsResponseBody | PostInvitationResponseBody
    >
  >,
  auth: Authenticator
): Promise<void> {
  const user = auth.getNonNullableUser();
  const owner = auth.getNonNullableWorkspace();

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

      const invitationRes = await handleMembershipInvitations(auth, {
        owner,
        user,
        subscription,
        invitationRequests: bodyValidation.right,
      });

      if (invitationRes.isErr()) {
        return apiError(req, res, invitationRes.error);
      }

      res.status(200).json(invitationRes.value);
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

export default withSessionAuthenticationForWorkspace(handler);
