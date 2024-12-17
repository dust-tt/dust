import { NextApiRequest, NextApiResponse } from "next";
import { WithAPIErrorResponse } from "@app/src/lib/errors";
import * as t from "io-ts";
import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";
import { apiError } from "@app/logger/withlogging";

const WorkspaceSearchPostBodySchema = t.type({
  sId: t.string
})

export type WorkspaceSearchResponseBody = {
  success: boolean;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<WorkspaceSearchResponseBody>>,
) {
  switch (req.method) {
    case "GET":
      const bodyValidation = WorkspaceSearchPostBodySchema.decode(req.body)
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
  }
  res.status(200).json({ success: true });
  return
}