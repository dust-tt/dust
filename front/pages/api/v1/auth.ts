import type { NextApiRequest, NextApiResponse } from "next";

import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

export type AuthResponseType = {
  auth: "auth0" | "workos";
};

/**
 * @ignoreswagger
 * undocumented.
 * TODO(workos) Remove the endpoint once migrated.
 */

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<AuthResponseType>>
): Promise<void> {
  logger.info("auth endpoint called", {
    method: req.method,
  });
  switch (req.method) {
    case "GET":
      return res.status(200).json({ auth: "auth0" });

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

export default handler;
