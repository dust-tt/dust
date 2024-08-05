import type { NextApiRequest, NextApiResponse } from "next";

import { Authenticator, getAPIKey } from "@app/lib/auth";
import { apiError, withLogging } from "@app/logger/withlogging";
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
  res: NextApiResponse
): Promise<void> {
  const keyRes = await getAPIKey(req);
  if (keyRes.isErr()) {
    return apiError(req, res, keyRes.error);
  }

  const { workspaceAuth } = await Authenticator.fromKey(
    keyRes.value,
    req.query.wId as string
  );

  const owner = workspaceAuth.workspace();
  const plan = workspaceAuth.plan();
  const isSystemKey = keyRes.value.isSystem;
  if (!owner || !plan || !workspaceAuth.isBuilder() || !isSystemKey) {
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
      return handlePostTableCsvUpsertRequest(workspaceAuth, req, res);

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
