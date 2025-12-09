import type { Request, Response } from "express";

import type { NotionWebhookEvent } from "@connectors/connectors/notion/lib/webhooks";
import { processNotionWebhookEvent } from "@connectors/connectors/notion/lib/webhooks";
import { NotionConnectorStateModel } from "@connectors/lib/models/notion";
import mainLogger from "@connectors/logger/logger";
import { withLogging } from "@connectors/logger/withlogging";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { WithConnectorsAPIErrorReponse } from "@connectors/types";
import { normalizeError } from "@connectors/types";

const logger = mainLogger.child({ provider: "notion" });

type NotionWebhookResBody = WithConnectorsAPIErrorReponse<null>;

type NotionWebhookVerification = {
  verification_token: string;
};

type NotionWebhookEventPayload = {
  workspace_id: string;
  type: NotionWebhookEvent["type"];
  entity?: {
    id: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

type NotionWebhookPayload =
  | NotionWebhookVerification
  | NotionWebhookEventPayload;

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

  // TODO: we need to add signature verification. We'll need to store the verification token somewhere.

  const notionWorkspaceId = payload.workspace_id;
  if (!notionWorkspaceId) {
    logger.warn(
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
  const notionConnectorState = await NotionConnectorStateModel.findOne({
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
    logger.warn(
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
      "Received Notion webhook for paused connector, skipping."
    );
    return res.status(200).end();
  }

  logger.info(
    {
      connectorId: connector.id,
      type: payload.type,
      entity: payload.entity?.id,
    },
    "Received Notion webhook event"
  );

  if (payload.entity == null) {
    logger.warn(
      {
        connectorId: connector.id,
        payload,
      },
      "Received Notion webhook event with no entity, skipping."
    );
    return res.status(200).end();
  }

  // Process the webhook event
  try {
    await processNotionWebhookEvent({
      connectorId: connector.id,
      event: {
        type: payload.type,
        entity_id: payload.entity?.id,
      },
    });
  } catch (err) {
    logger.error(
      {
        err: normalizeError(err),
        connectorId: connector.id,
        notionWorkspaceId,
      },
      "Failed to process Notion webhook event"
    );
    return res.status(500).end();
  }

  return res.status(200).end();
};

export const webhookNotionAPIHandler = withLogging(_webhookNotionAPIHandler);
