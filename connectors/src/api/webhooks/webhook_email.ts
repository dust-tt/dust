import type { WithConnectorsAPIErrorReponse } from "@dust-tt/types";
import type { Request, Response } from "express";

import mainLogger from "@connectors/logger/logger";
import { withLogging } from "@connectors/logger/withlogging";

const logger = mainLogger.child({ provider: "email" });

type EmailWebhookResBody = WithConnectorsAPIErrorReponse<null>;

const _webhookEmailAPIHandler = async (
  req: Request<
    Record<string, string>,
    EmailWebhookResBody,
    {
      topic?: string;
      type: "notification_event";
      app_id: string; // That's the Intercom workspace id
      data?: any;
    }
  >,
  res: Response<EmailWebhookResBody>
) => {
  const event = req.body;
  logger.info("[Intercom] Received Intercom webhook", { event });

  return res.status(200).end();
};

export const webhookEmailAPIHandler = withLogging(_webhookEmailAPIHandler);
