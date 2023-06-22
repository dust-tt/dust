import { NextApiRequest, NextApiResponse } from "next";

import { Authenticator, getAPIKey } from "@app/lib/auth";
import { apiError, withLogging } from "@app/logger/withlogging";

export type GetDocumentTrackerShouldRunResponseBody = {
  should_run: boolean;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GetDocumentTrackerShouldRunResponseBody>
): Promise<void> {
  // TODO: check that it is a system API key
  const keyRes = await getAPIKey(req);
  if (keyRes.isErr()) {
    return apiError(req, res, keyRes.error);
  }
  const { auth } = await Authenticator.fromKey(
    keyRes.value,
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

  switch (req.method) {
    case "GET":
      if (
        !req.body ||
        typeof req.body.dataSourceName !== "string" ||
        typeof req.body.documentId !== "string"
      ) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "Invalid request body, `dataSourceName` (string) and `documentId` (string) are required.",
          },
        });
      }
      res.status(200).json({ should_run: false });
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
