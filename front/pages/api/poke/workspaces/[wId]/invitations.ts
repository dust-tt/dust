import type { WithAPIErrorResponse } from "@dust-tt/types";
import { ActiveRoleSchema } from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { handleMembershipInvitations } from "@app/lib/api/invitation";
import { withSessionAuthentication } from "@app/lib/api/wrappers";
import { Authenticator, getSession } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";

const PokePostInvitationRequestBodySchema = t.type({
  email: t.string,
  role: ActiveRoleSchema,
});

type PokePostInvitationResponseBody = {
  success: boolean;
  email: string;
  error_message?: string;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PokePostInvitationResponseBody>>
): Promise<void> {
  const session = await getSession(req, res);
  const auth = await Authenticator.fromSession(
    session,
    req.query.wId as string
  );

  const owner = auth.workspace();
  const user = auth.user();
  if (!owner || !user || !auth.isDustSuperUser()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "The workspace was not found.",
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
    case "POST":
      const bodyValidation = PokePostInvitationRequestBodySchema.decode(
        req.body
      );
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

      // To send the invitations, we need to auth as admin of the workspace

      // !! this is ok because we're in Poke as dust super user, do not copy paste
      // this mindlessly !!
      const workspaceAdminAuth = await Authenticator.internalAdminForWorkspace(
        owner.sId
      );

      const invitationRes = await handleMembershipInvitations(
        workspaceAdminAuth,
        {
          owner,
          user: user.toJSON(),
          subscription,
          invitationRequests: [bodyValidation.right],
        }
      );

      if (invitationRes.isErr()) {
        return apiError(req, res, invitationRes.error);
      }

      const [result] = invitationRes.value;

      res.status(200).json(result);
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

export default withSessionAuthentication(handler);
