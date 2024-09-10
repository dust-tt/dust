import type { NextApiRequest, NextApiResponse } from "next";

import { withPublicApiAuthentication } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import { handlePostTableCsvUpsertRequest } from "@app/pages/api/w/[wId]/data_sources/[name]/tables/csv";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "50mb",
    },
  },
};

/**
 * @ignoreswagger
 * System API key only endpoint. Undocumented.
 */

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  auth: Authenticator
): Promise<void> {
  if (!auth.isSystemKey()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "The workspace was not found.",
      },
    });
  }

  switch (req.method) {
    case "POST":
      return handlePostTableCsvUpsertRequest(auth, req, res);

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

export default withPublicApiAuthentication(handler);
