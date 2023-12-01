import { DocumentType } from "@dust-tt/types";
import { ReturnedAPIErrorType } from "@dust-tt/types";
import { NextApiRequest, NextApiResponse } from "next";

import logger from "@app/logger/logger";
import { apiError, statsDClient, withLogging } from "@app/logger/withlogging";
import { legacyUserToWorkspace } from "@app/pages/api/v1/legacy_user_to_workspace";
import wIdHandler from "@app/pages/api/v1/w/[wId]/data_sources/[name]/documents/index";

export type GetDocumentsResponseBody = {
  documents: Array<DocumentType>;
  total: number;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GetDocumentsResponseBody | ReturnedAPIErrorType>
): Promise<void> {
  const wId = legacyUserToWorkspace[req.query.user as string];
  if (!wId) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "user_not_found",
        message:
          "The legacy user you're trying to query was not found (check out our docs for updated workspace based URLs).",
      },
    });
  }

  logger.info(
    {
      user: req.query.user,
      wId,
      url: req.url,
    },
    "Legacy user to workspace rewrite"
  );

  const tags = [
    `method:${req.method}`,
    // `url:${req.url}`,
    `user:${req.query.user}`,
    `wId:${wId}`,
  ];

  statsDClient.increment("legacyAPIUser.rewrite", 1, tags);

  req.query.wId = wId;

  return wIdHandler(req, res);
}

export default withLogging(handler);
