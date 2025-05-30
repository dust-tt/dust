import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import { setInternalWorkspaceSegmentation } from "@app/lib/api/workspace";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { apiError } from "@app/logger/withlogging";
import type { LightWorkspaceType, WithAPIErrorResponse } from "@app/types";

export const WorkspaceTypeSchema = t.type({
  segmentation: t.union([t.literal("interesting"), t.null]),
});

export type SegmentWorkspaceResponseBody = {
  workspace: LightWorkspaceType;
};

export type DeleteWorkspaceResponseBody = {
  success: true;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      SegmentWorkspaceResponseBody | DeleteWorkspaceResponseBody
    >
  >,
  session: SessionWithUser
): Promise<void> {
  const auth = await Authenticator.fromSuperUserSession(
    session,
    req.query.wId as string
  );

  const owner = auth.workspace();

  if (!owner || !auth.isDustSuperUser()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "user_not_found",
        message: "Could not find the user.",
      },
    });
  }

  switch (req.method) {
    case "PATCH":
      const bodyValidation = WorkspaceTypeSchema.decode(req.body);
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

      const workspace = await setInternalWorkspaceSegmentation(
        auth,
        body.segmentation
      );

      return res.status(200).json({
        workspace,
      });

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, PATCH OR DELETE is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForPoke(handler);
