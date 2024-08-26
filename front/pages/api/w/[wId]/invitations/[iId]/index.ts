import type {
  MembershipInvitationType,
  WithAPIErrorResponse,
} from "@dust-tt/types";
import { ActiveRoleSchema } from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import {
  getInvitation,
  updateInvitationStatusAndRole,
} from "@app/lib/api/invitation";
import { withSessionAuthenticationForWorkspaceAsUser } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";

export type PostMemberInvitationsResponseBody = {
  invitation: MembershipInvitationType;
};

export const PostMemberInvitationBodySchema = t.type({
  status: t.union([t.literal("revoked"), t.literal("pending")]),
  initialRole: ActiveRoleSchema,
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PostMemberInvitationsResponseBody>>,
  auth: Authenticator
): Promise<void> {
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

  const invitationId = req.query.iId;
  if (!(typeof invitationId === "string")) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid query parameters, `iId` (string) is required.",
      },
    });
  }

  let invitation = await getInvitation(auth, { invitationId });
  if (!invitation) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "invitation_not_found",
        message: "The invitation requested was not found.",
      },
    });
  }

  switch (req.method) {
    case "POST":
      const bodyValidation = PostMemberInvitationBodySchema.decode(req.body);
      if (isLeft(bodyValidation)) {
        const pathError = reporter.formatValidationErrors(bodyValidation.left);
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `The request body is invalid: ${pathError}`,
          },
        });
      }
      const body = bodyValidation.right;

      invitation = await updateInvitationStatusAndRole(auth, {
        invitation,
        status: body.status,
        role: body.initialRole,
      });

      res.status(200).json({
        invitation,
      });
      return;

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, POST is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspaceAsUser(handler);
