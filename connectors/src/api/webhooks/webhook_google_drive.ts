import type { WithConnectorsAPIErrorReponse } from "@dust-tt/types";
import type { Request, Response } from "express";

import { withLogging } from "@connectors/logger/withlogging";

type GoogleDriveWebhookResBody = WithConnectorsAPIErrorReponse<null>;

const _webhookGoogleDriveAPIHandler = async (
  req: Request<Record<string, string>, GoogleDriveWebhookResBody>,
  res: Response<GoogleDriveWebhookResBody>
) => {
  // @todo (Aric) remove this endpoint when all webhooks subscriptions are expired.
  return res.status(200).end();
};

export const webhookGoogleDriveAPIHandler = withLogging(
  _webhookGoogleDriveAPIHandler
);
