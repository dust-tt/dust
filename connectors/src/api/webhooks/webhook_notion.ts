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

  // Note that Notion signature verification is handled in Firebase, before reaching this code.

  // We should not normally receive these, as they are handled in Firebase.
  if ("verification_token" in payload) {
    logger.warn("Received unexpected Notion webhook verification token");
    return res.status(200).end();
  }

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

  // Find all connector states from the Notion workspace ID
  const notionConnectorStates = await NotionConnectorStateModel.findAll({
    where: { notionWorkspaceId },
  });

  if (notionConnectorStates.length === 0) {
    logger.warn(
      { notionWorkspaceId },
      "Received Notion webhook for unknown Notion workspace"
    );
    return res.status(200).end();
  }

  if (payload.entity == null) {
    logger.warn(
      {
        notionWorkspaceId,
        payload,
      },
      "Received Notion webhook event with no entity, skipping."
    );
    return res.status(200).end();
  }

  logger.info(
    {
      notionWorkspaceId,
      connectorCount: notionConnectorStates.length,
      notionConnectorStates: notionConnectorStates.map((n) => n.connectorId),
      type: payload.type,
      entity: payload.entity?.id,
    },
    "Received Notion webhook event"
  );

  // Process the webhook event for all matching connectors sequentially
  for (const notionConnectorState of notionConnectorStates) {
    try {
      // Get the actual connector
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
        continue;
      }

      if (connector.isPaused()) {
        logger.info(
          { connectorId: connector.id },
          "Received Notion webhook for paused connector, skipping."
        );
        continue;
      }

      // Process the webhook event
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
          connectorId: notionConnectorState.connectorId,
          notionWorkspaceId,
        },
        "Failed to process Notion webhook event, continuing with next connector"
      );
    }
  }

  return res.status(200).end();
};

export const webhookNotionAPIHandler = withLogging(_webhookNotionAPIHandler);
