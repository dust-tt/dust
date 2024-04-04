import type {
  MembershipInvitationType,
  WithAPIErrorReponse,
} from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { getInvitation, updateInvitationStatus } from "@app/lib/api/invitation";
import { Authenticator, getSession } from "@app/lib/auth";
import { apiError, withLogging } from "@app/logger/withlogging";

export type PostMemberInvitationsResponseBody = {
  invitation: MembershipInvitationType;
};

export const PostMemberInvitationBodySchema = t.type({
  status: t.literal("revoked"),
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorReponse<PostMemberInvitationsResponseBody>>
): Promise<void> {
  const session = await getSession(req, res);
  const auth = await Authenticator.fromSession(
    session,
    req.query.wId as string
  );

  const owner = auth.workspace();
  if (!owner) {
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

  if (!(typeof req.query.iId === "string")) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid query parameters, `iId` (string) is required.",
      },
    });
  }

  const invitationId = req.query.iId;
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

      invitation = await updateInvitationStatus(auth, {
        invitation,
        status: body.status,
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

export default withLogging(handler);
