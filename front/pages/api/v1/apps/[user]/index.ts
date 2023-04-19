import { APIError } from "@app/lib/error";
import logger from "@app/logger/logger";
import { statsDClient, withLogging } from "@app/logger/withlogging";
import { legacyUserToWorkspace } from "@app/pages/api/v1/legacy_user_to_workspace";
import { AppType } from "@app/types/app";
import { NextApiRequest, NextApiResponse } from "next";

import wIdHandler from "@app/pages/api/v1/w/[wId]/apps/index";

export type GetAppsResponseBody = {
  apps: AppType[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GetAppsResponseBody | APIError>
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
      url: req.url,
    },
    "Legacy user to workspace rewrite"
  );

  const tags = [
    `method:${req.method}`,
    `url:${req.url}`,
    `user:${req.query.user}`,
    `wId:${wId}`,
  ];

  statsDClient.increment("legacyAPIUser.rewrite", 1, tags);

  req.query.wId = wId;

  return wIdHandler(req, res);
}

export default withLogging(handler);
