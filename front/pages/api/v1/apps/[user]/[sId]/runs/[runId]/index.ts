import { APIError } from "@app/lib/error";
import logger from "@app/logger/logger";
import { statsDClient, withLogging } from "@app/logger/withlogging";
import { legacyUserToWorkspace } from "@app/pages/api/v1/legacy_user_to_workspace";
import { RunType } from "@app/types/run";
import { NextApiRequest, NextApiResponse } from "next";

import wIdHandler from "@app/pages/api/v1/w/[wId]/apps/[aId]/runs/[runId]/index";

export const config = {
  api: {
    responseLimit: "8mb",
  },
};

export type GetRunResponseBody = {
  run: RunType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<APIError | GetRunResponseBody>
): Promise<void> {
  let wId = legacyUserToWorkspace[req.query.user as string];
  if (!wId) {
    res.status(404).json({
      error: {
        type: "user_not_found",
        message:
          "The legacy user you're trying to query was not found \
          (check out our docs for updated workspace based URLs).",
      },
    });
  }

  logger.info(
    {
      user: req.query.user,
      wId,
      aId: req.query.sId,
      url: req.url,
    },
    "Legacy user to workspace rewrite"
  );

  const tags = [
    `method:${req.method}`,
    `url:${req.url}`,
    `user:${req.query.user}`,
    `wId:${wId}`,
    `aId:${req.query.sId}`,
  ];

  statsDClient.increment("legacyAPIUser.rewrite", 1, tags);

  req.query.wId = wId;
  req.query.aId = req.query.sId;

  return wIdHandler(req, res);
}

export default withLogging(handler);
