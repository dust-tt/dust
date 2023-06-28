import { NextApiRequest, NextApiResponse } from "next";

import { Authenticator, getSession } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { apiError, withLogging } from "@app/logger/withlogging";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse
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
        message: "workspace not found.",
      },
    });
  }

  switch (req.method) {
    case "POST": {
      if (!req.body || typeof req.body !== "object") {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "request body expected: JSON object.",
          },
        });
      }
      logger.info(req.body.data);
      res.status(200).end();
      return;
    }
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
