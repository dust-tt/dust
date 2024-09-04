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
import { syncFailed } from "@connectors/lib/sync_status";
import mainLogger from "@connectors/logger/logger";
import { withLogging } from "@connectors/logger/withlogging";
import { ConnectorResource } from "@connectors/resources/connector_resource";

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
    dataSourceId: dataSourceConfig.dataSourceId,
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

export const webhookIntercomAPIHandler = withLogging(
  _webhookIntercomAPIHandler
);

const _webhookIntercomUninstallAPIHandler = async (
  req: Request<
    Record<string, string>,
    IntercombWebhookResBody,
    {
      app_id: string; // That's the Intercom workspace id
    }
  >,
  res: Response<IntercombWebhookResBody>
) => {
  const event = req.body;
  logger.info({ event }, "[Intercom] Received Intercom uninstall webhook");

  const intercomWorkspaceId = event.app_id;
  if (!intercomWorkspaceId) {
    logger.error(
      {
        event,
      },
      "[Intercom] Received Intercom uninstall webhook with no workspace id"
    );
    return res.status(200).end();
  }

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
      "[Intercom] Received Intercom uninstall webhook for unknown workspace"
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
      "[Intercom] Received Intercom uninstall webhook for unknown connector"
    );
    return res.status(200).end();
  }

  // Stop the underlying sync workflow to avoid churning.
  const stopRes = await stopIntercomSyncWorkflow(connector.id);
  if (stopRes.isErr()) {
    logger.error(
      {
        connectorId: connector.id,
        error: stopRes.error,
      },
      "Failed to stop Intercom sync workflow (intercom uninstall webhook)"
    );
    return res.status(200).end();
  }

  // Mark the connector as errored so that the user is notified.
  await syncFailed(connector.id, "oauth_token_revoked");

  const dataSourceConfig = dataSourceConfigFromConnector(connector);
  const loggerArgs = {
    workspaceId: dataSourceConfig.workspaceId,
    connectorId: connector.id,
    provider: "intercom",
    dataSourceId: dataSourceConfig.dataSourceId,
    intercomWorkspaceId,
  };

  logger.info(
    loggerArgs,
    "[Intercom] Errored connector from uninstall webhook"
  );

  return res.status(200).end();
};

export const webhookIntercomUninstallAPIHandler = withLogging(
  _webhookIntercomUninstallAPIHandler
);
