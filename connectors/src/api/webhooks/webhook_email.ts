import type { WithConnectorsAPIErrorReponse } from "@dust-tt/types";
import type { Request, Response } from "express";

import type { IntercomConversationWithPartsType } from "@connectors/connectors/intercom/lib/types";
import { stopIntercomSyncWorkflow } from "@connectors/connectors/intercom/temporal/client";
import { syncConversation } from "@connectors/connectors/intercom/temporal/sync_conversation";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import {
  IntercomTeam,
  IntercomWorkspace,
} from "@connectors/lib/models/intercom";
import { nangoDeleteConnection } from "@connectors/lib/nango_client";
import { syncFailed } from "@connectors/lib/sync_status";
import mainLogger from "@connectors/logger/logger";
import { withLogging } from "@connectors/logger/withlogging";
import { ConnectorResource } from "@connectors/resources/connector_resource";

const { NANGO_INTERCOM_CONNECTOR_ID = "" } = process.env;

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
      data?: {
        item: IntercomConversationWithPartsType;
      };
    }
  >,
  res: Response<EmailWebhookResBody>
) => {
  const event = req.body;
  logger.info("[Intercom] Received Intercom webhook", { event });

  if (event.topic !== "conversation.admin.closed") {
    logger.error(
      {
        event,
      },
      "[Intercom] Received Intercom webhook with unknown topic"
    );
    return res.status(200).end();
  }

  const intercomWorkspaceId = event.app_id;
  if (!intercomWorkspaceId) {
    logger.error(
      {
        event,
      },
      "[Intercom] Received Intercom webhook with no workspace id"
    );
    return res.status(200).end();
  }

  const conversation = event.data?.item;
  if (!conversation) {
    logger.error(
      {
        event,
      },
      "[Intercom] Received Intercom webhook with no conversation"
    );
    return res.status(200).end();
  }

  // Find IntercomWorkspace
  const intercomWorskpace = await IntercomWorkspace.findOne({
    where: {
      intercomWorkspaceId,
    },
  });
  if (!intercomWorskpace) {
    logger.error(
      {
        event,
      },
      "[Intercom] Received Intercom webhook for unknown workspace"
    );
    return res.status(200).end();
  }

  // Find Connector
  const connector = await ConnectorResource.fetchById(
    intercomWorskpace.connectorId
  );

  if (!connector || connector.type !== "intercom") {
    logger.error(
      {
        event,
      },
      "[Intercom] Received Intercom webhook for unknown connector"
    );
    return res.status(200).end();
  }

  if (connector.isPaused()) {
    logger.info(
      {
        connectorId: connector.id,
      },
      "[Intercom] Received webhook for paused connector, skipping."
    );
    return res.status(200).end();
  }

  const isSelectedAllConvos =
    intercomWorskpace.syncAllConversations === "activated";

  if (!isSelectedAllConvos) {
    if (!conversation.team_assignee_id) {
      // Check we have the permissions to sync this conversation
      logger.info(
        "[Intercom] Received webhook for conversation without team, skipping."
      );
      return res.status(200).end();
    } else {
      const team = await IntercomTeam.findOne({
        where: {
          connectorId: connector.id,
          teamId: conversation.team_assignee_id.toString(),
        },
      });
      if (!team || team.permission !== "read") {
        logger.info(
          "[Intercom] Received webhook for conversation attached to team without read permission, skipping."
        );
        return res.status(200).end();
      }
    }
  }

  // Sync conversation
  const connectorId = connector.id;
  const dataSourceConfig = dataSourceConfigFromConnector(connector);
  const loggerArgs = {
    workspaceId: dataSourceConfig.workspaceId,
    connectorId,
    provider: "intercom",
    dataSourceName: dataSourceConfig.dataSourceName,
    intercomWorkspaceId,
    conversationId: conversation.id,
  };
  await syncConversation({
    connectorId: connector.id,
    dataSourceConfig,
    conversation,
    currentSyncMs: Date.now(),
    syncType: "incremental",
    loggerArgs,
  });

  logger.info(loggerArgs, "[Intercom] Upserted conversation from webhook");

  return res.status(200).end();
};

export const webhookEmailAPIHandler = withLogging(_webhookEmailAPIHandler);
