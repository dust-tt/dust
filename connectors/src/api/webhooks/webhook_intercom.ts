import type { WithConnectorsAPIErrorReponse } from "@dust-tt/types";
import type { Request, Response } from "express";

import type { IntercomConversationWithPartsType } from "@connectors/connectors/intercom/lib/intercom_api";
import { syncConversation } from "@connectors/connectors/intercom/temporal/sync_conversation";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { Connector } from "@connectors/lib/models";
import {
  IntercomTeam,
  IntercomWorkspace,
} from "@connectors/lib/models/intercom";
import mainLogger from "@connectors/logger/logger";
import { withLogging } from "@connectors/logger/withlogging";

const logger = mainLogger.child({ provider: "intercom" });

type IntercombWebhookResBody = WithConnectorsAPIErrorReponse<null>;

const _webhookIntercomAPIHandler = async (
  req: Request<
    Record<string, string>,
    IntercombWebhookResBody,
    {
      topic?: string;
      type: "notification_event";
      app_id: string; // That's the Intercom workspace id
      data?: {
        item: IntercomConversationWithPartsType;
      };
    }
  >,
  res: Response<IntercombWebhookResBody>
) => {
  const event = req.body;
  logger.info("[Intercom] Received Intercom webhook", { event });

  if (event.topic !== "conversation.admin.closed") {
    logger.error("[Intercom] Received Intercom webhook with unknown topic", {
      event,
    });
  }

  const intercomWorkspaceId = event.app_id;
  if (!intercomWorkspaceId) {
    logger.error("[Intercom] Received Intercom webhook with no workspace id", {
      event,
    });
    return res.status(200).end();
  }

  const conversation = event.data?.item;
  if (!conversation) {
    logger.error("[Intercom] Received Intercom webhook with no conversation", {
      event,
    });
    return res.status(200).end();
  }

  // Find IntercomWorkspace
  const intercomWorskpace = await IntercomWorkspace.findOne({
    where: {
      intercomWorkspaceId,
    },
  });
  if (!intercomWorskpace) {
    logger.error("[Intercom] Received Intercom webhook for unknown workspace", {
      event,
    });
    return res.status(200).end();
  }

  // Find Connector
  const connector = await Connector.findOne({
    where: {
      id: intercomWorskpace.connectorId,
      type: "intercom",
    },
  });
  if (!connector) {
    logger.error("[Intercom] Received Intercom webhook for unknown connector", {
      event,
    });
    return res.status(200).end();
  }

  // Check we have the permissions to sync this conversation
  if (!conversation.team_assignee_id) {
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

  logger.info("[Intercom] Upserted conversation from webhook", { loggerArgs });

  return res.status(200).end();
};

export const webhookIntercomAPIHandler = withLogging(
  _webhookIntercomAPIHandler
);
