// @migration-status: MIGRATED_TO_HONO
/** @ignoreswagger */
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type {
  GetWorkspaceInvitationsResponseBody,
  PostInvitationResponseBody,
} from "@app/lib/api/invitation";
import {
  handleMembershipInvitations,
  PostInvitationRequestBodySchema,
} from "@app/lib/api/invitation";
import type { Authenticator } from "@app/lib/auth";
import { MembershipInvitationResource } from "@app/lib/resources/membership_invitation_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiRequest, NextApiResponse } from "next";
import { fromError } from "zod-validation-error";

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
      const includeExpired = req.query.includeExpired === "true";
      const invitations =
        await MembershipInvitationResource.getPendingInvitations(auth, {
          includeExpired,
        });
      res.status(200).json({ invitations: invitations.map((i) => i.toJSON()) });
      return;

    case "POST":
      const bodyValidation = PostInvitationRequestBodySchema.safeParse(
        req.body
      );
      if (!bodyValidation.success) {
        const pathError = fromError(bodyValidation.error).toString();
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
        user: user.toJSON(),
        subscription,
        invitationRequests: bodyValidation.data,
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
