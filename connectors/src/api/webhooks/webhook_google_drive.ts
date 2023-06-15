import { Request, Response } from "express";

import { launchGoogleDriveIncrementalSyncWorkflow } from "@connectors/connectors/google_drive/temporal/client";
import { APIErrorWithStatusCode } from "@connectors/lib/error";
import { GoogleDriveWebhook } from "@connectors/lib/models";
import { apiError, withLogging } from "@connectors/logger/withlogging";

type GoogleDriveWebhookResBody = null | APIErrorWithStatusCode;

const _webhookGoogleDriveAPIHandler = async (
  req: Request<Record<string, string>, GoogleDriveWebhookResBody>,
  res: Response<GoogleDriveWebhookResBody>
) => {
  const channelId = req.headers["x-goog-channel-id"];
  if (!channelId) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        message: "Missing x-goog-channel-id header",
        type: "invalid_request_error",
      },
    });
  }
  const webhook = await GoogleDriveWebhook.findOne({
    where: {
      webhookId: channelId,
    },
  });
  if (!webhook) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        message: "Webhook not found",
        type: "invalid_request_error",
      },
    });
  }

  const workflowRes = await launchGoogleDriveIncrementalSyncWorkflow(
    webhook.connectorId.toString()
  );
  if (workflowRes.isErr()) {
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        message: `Failed starting the incremental sync workflow. Error: ${workflowRes.error.message}`,
        type: "invalid_request_error",
      },
    });
  }

  return res.status(200).end();
};

export const webhookGoogleDriveAPIHandler = withLogging(
  _webhookGoogleDriveAPIHandler
);
