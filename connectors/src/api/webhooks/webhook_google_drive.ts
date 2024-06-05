import type { WithConnectorsAPIErrorReponse } from "@dust-tt/types";
import { RateLimitError } from "@dust-tt/types";
import type { Request, Response } from "express";

import { launchGoogleDriveIncrementalSyncWorkflow } from "@connectors/connectors/google_drive/temporal/client";
import { GoogleDriveWebhook } from "@connectors/lib/models/google_drive";
import logger from "@connectors/logger/logger";
import { apiError, withLogging } from "@connectors/logger/withlogging";
import { ConnectorResource } from "@connectors/resources/connector_resource";

type GoogleDriveWebhookResBody = WithConnectorsAPIErrorReponse<null>;

const _webhookGoogleDriveAPIHandler = async (
  req: Request<Record<string, string>, GoogleDriveWebhookResBody>,
  res: Response<GoogleDriveWebhookResBody>
) => {
  const channelId = req.headers["x-goog-channel-id"];
  logger.info(
    { channelId, url: req.originalUrl },
    "Processing Google Drive webhook."
  );
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
      status_code: 400,
      api_error: {
        type: "google_drive_webhook_not_found",
        message: `Could not find a webhook with id ${channelId}`,
      },
    });
  }
  const { connectorId, webhookId } = webhook;
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    logger.info(
      {
        connectorId,
      },
      "Received Gdrive webhook for a deleted connector."
    );
    return res.status(200).end();
  }
  if (connector.isPaused()) {
    logger.info(
      {
        connectorId: connectorId,
        webhookId: webhookId,
      },
      "Did not signal a Gdrive webhook to the incremental sync workflow because the connector is paused"
    );
    return res.status(200).end();
  }

  const workflowRes = await launchGoogleDriveIncrementalSyncWorkflow(
    connectorId
  );

  if (workflowRes.isErr()) {
    if (workflowRes.error instanceof RateLimitError) {
      logger.info(
        {
          connectorId: connectorId,
          webhookId: webhookId,
        },
        "Did not signal a Gdrive webhook to the incremental sync workflow because of rate limit"
      );
      return res.status(200).end();
    }
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: `Failed starting the incremental sync workflow. Error: ${workflowRes.error.message}`,
      },
    });
  }

  return res.status(200).end();
};

export const webhookGoogleDriveAPIHandler = withLogging(
  _webhookGoogleDriveAPIHandler
);
