import type { Request, Response } from "express";

import { launchNotionWebhookProcessingWorkflow } from "@connectors/connectors/notion/temporal/client";
import type { NotionWebhookEvent } from "@connectors/connectors/notion/temporal/signals";
import { NotionConnectorState } from "@connectors/lib/models/notion";
import mainLogger from "@connectors/logger/logger";
import { withLogging } from "@connectors/logger/withlogging";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { WithConnectorsAPIErrorReponse } from "@connectors/types";

const logger = mainLogger.child({ provider: "notion" });

type NotionWebhookResBody = WithConnectorsAPIErrorReponse<null>;

type NotionWebhookVerification = {
  verification_token: string;
};

type NotionWebhookPayload = NotionWebhookVerification | NotionWebhookEvent;

const _webhookNotionAPIHandler = async (
  req: Request<
    Record<string, string>,
    NotionWebhookResBody,
    NotionWebhookPayload
  >,
  res: Response<NotionWebhookResBody>
) => {
  const payload = req.body;

  // Handle verification token (one-time setup event)
  // TODO: need a cleaner way of doing the initial verification handshake with Notion
  if ("verification_token" in payload) {
    logger.info(
      {
        verification_token: payload.verification_token,
      },
      "Received Notion webhook verification token"
    );
    return res.status(200).end();
  }

  // REVIEW: do we need to add signature verification, or is this covered by having a secret URL?
  // If we want verification, we need to store the verification token somewhere.

  const notionWorkspaceId = payload.workspace_id;
  if (!notionWorkspaceId) {
    logger.error(
      {
        payload,
      },
      "Received Notion webhook with no workspace_id"
    );
    return res.status(400).json({
      error: {
        type: "invalid_request_error",
        message: "Missing workspace_id in webhook payload",
      },
    });
  }

  // Find the connector state from the Notion workspace ID
  const notionConnectorState = await NotionConnectorState.findOne({
    where: { notionWorkspaceId },
  });

  if (!notionConnectorState) {
    logger.warn(
      { notionWorkspaceId },
      "Received Notion webhook for unknown Notion workspace"
    );
    return res.status(200).end();
  }

  // Now get the actual connector
  const connector = await ConnectorResource.fetchById(
    notionConnectorState.connectorId
  );

  if (!connector || connector.type !== "notion") {
    logger.error(
      {
        connectorId: notionConnectorState.connectorId,
        notionWorkspaceId,
      },
      "Received Notion webhook for unknown or invalid connector"
    );
    return res.status(200).end();
  }

  if (connector.isPaused()) {
    logger.info(
      { connectorId: connector.id },
      "Received webhook for paused connector, skipping."
    );
    return res.status(200).end();
  }

  logger.info(
    {
      connectorId: connector.id,
      workspaceId: notionWorkspaceId,
      type: payload.type,
      entity: payload.entity?.id,
    },
    "Received Notion webhook event"
  );

  // Launch or signal the webhook processing workflow
  try {
    await launchNotionWebhookProcessingWorkflow(connector.id, payload);
  } catch (err) {
    logger.error(
      {
        err,
        connectorId: connector.id,
        notionWorkspaceId,
      },
      "Failed to launch Notion webhook processing workflow"
    );
    return res.status(500).end();
  }

  return res.status(200).end();
};

export const webhookNotionAPIHandler = withLogging(_webhookNotionAPIHandler);
