import { WorkspaceType } from "@dust-tt/types";
import { ReturnedAPIErrorType } from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import { NextApiRequest, NextApiResponse } from "next";

import { setInternalWorkspaceSegmentation } from "@app/lib/api/workspace";
import { Authenticator, getSession } from "@app/lib/auth";
import { apiError, withLogging } from "@app/logger/withlogging";

export const WorkspaceTypeSchema = t.type({
  segmentation: t.union([t.literal("interesting"), t.null]),
});

export type SegmentWorkspaceResponseBody = {
  workspace: WorkspaceType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SegmentWorkspaceResponseBody | ReturnedAPIErrorType>
): Promise<void> {
  const session = await getSession(req, res);
  const auth = await Authenticator.fromSuperUserSession(
    session,
    req.query.wId as string
  );
  const user = auth.user();
  const owner = auth.workspace();

  if (!user || !owner || !auth.isDustSuperUser()) {
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
          message: "The method passed is not supported, POST is expected.",
        },
      });
  }
}

export default withLogging(handler);
