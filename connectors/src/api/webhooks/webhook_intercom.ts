import type { Request, Response } from "express";

import type { IntercomConversationWithPartsType } from "@connectors/connectors/intercom/lib/types";
import {
  stopIntercomFullSyncWorkflow,
  stopIntercomScheduledWorkflows,
} from "@connectors/connectors/intercom/temporal/client";
import { syncConversation } from "@connectors/connectors/intercom/temporal/sync_conversation";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import {
  IntercomTeamModel,
  IntercomWorkspaceModel,
} from "@connectors/lib/models/intercom";
import { syncFailed } from "@connectors/lib/sync_status";
import mainLogger from "@connectors/logger/logger";
import { withLogging } from "@connectors/logger/withlogging";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { WithConnectorsAPIErrorReponse } from "@connectors/types";

const logger = mainLogger.child(
  { provider: "intercom" },
  {
    msgPrefix: "[Intercom] ",
  }
);

type IntercomWebhookResBody = WithConnectorsAPIErrorReponse<null>;

const _webhookIntercomAPIHandler = async (
  req: Request<
    Record<string, string>,
    IntercomWebhookResBody,
    {
      topic?: string;
      type: "notification_event";
      app_id: string; // That's the Intercom workspace id
      data?: {
        item: IntercomConversationWithPartsType;
      };
    }
  >,
  res: Response<IntercomWebhookResBody>
) => {
  const event = req.body;
  logger.info("Received Intercom webhook", { event });

  if (event.topic !== "conversation.admin.closed") {
    logger.error(
      {
        event,
      },
      "Received Intercom webhook with unknown topic"
    );
    return res.status(200).end();
  }

  const intercomWorkspaceId = event.app_id;
  if (!intercomWorkspaceId) {
    logger.error(
      {
        event,
      },
      "Received Intercom webhook with no workspace id"
    );
    return res.status(200).end();
  }

  const conversation = event.data?.item;
  if (!conversation) {
    logger.error(
      {
        event,
      },
      "Received Intercom webhook with no conversation"
    );
    return res.status(200).end();
  }

  // Find IntercomWorkspace
  const intercomWorkspace = await IntercomWorkspaceModel.findOne({
    where: {
      intercomWorkspaceId,
    },
  });
  if (!intercomWorkspace) {
    logger.error(
      {
        event,
      },
      "Received Intercom webhook for unknown workspace"
    );
    return res.status(200).end();
  }

  // Find Connector
  const connector = await ConnectorResource.fetchById(
    intercomWorkspace.connectorId
  );

  if (!connector || connector.type !== "intercom") {
    logger.error(
      {
        event,
      },
      "Received Intercom webhook for unknown connector"
    );
    return res.status(200).end();
  }

  if (connector.isPaused()) {
    logger.info(
      {
        connectorId: connector.id,
      },
      "Received webhook for paused connector, skipping."
    );
    return res.status(200).end();
  }

  const isSelectedAllConvos =
    intercomWorkspace.syncAllConversations === "activated";

  if (!isSelectedAllConvos) {
    if (!conversation.team_assignee_id) {
      // Check we have the permissions to sync this conversation
      logger.info("Received webhook for conversation without team, skipping.");
      return res.status(200).end();
    } else {
      const team = await IntercomTeamModel.findOne({
        where: {
          connectorId: connector.id,
          teamId: conversation.team_assignee_id.toString(),
        },
      });
      if (!team || team.permission !== "read") {
        logger.info(
          "Received webhook for conversation attached to team without read permission, skipping."
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

  logger.info(loggerArgs, "Upserted conversation from webhook");

  return res.status(200).end();
};

export const webhookIntercomAPIHandler = withLogging(
  _webhookIntercomAPIHandler
);

const _webhookIntercomUninstallAPIHandler = async (
  req: Request<
    Record<string, string>,
    IntercomWebhookResBody,
    {
      app_id: string; // That's the Intercom workspace id
    }
  >,
  res: Response<IntercomWebhookResBody>
) => {
  const event = req.body;
  logger.info({ event }, "Received Intercom uninstall webhook");

  const intercomWorkspaceId = event.app_id;
  if (!intercomWorkspaceId) {
    logger.error(
      {
        event,
      },
      "Received Intercom uninstall webhook with no workspace id"
    );
    return res.status(200).end();
  }

  const intercomWorkspace = await IntercomWorkspaceModel.findOne({
    where: {
      intercomWorkspaceId,
    },
  });
  if (!intercomWorkspace) {
    logger.error(
      {
        event,
      },
      "Received Intercom uninstall webhook for unknown workspace"
    );
    return res.status(200).end();
  }

  // Find Connector
  const connector = await ConnectorResource.fetchById(
    intercomWorkspace.connectorId
  );
  if (!connector || connector.type !== "intercom") {
    logger.error(
      {
        event,
      },
      "Received Intercom uninstall webhook for unknown connector"
    );
    return res.status(200).end();
  }

  // Stop the underlying sync workflows to avoid churning.
  const stopSchedulesRes = await stopIntercomScheduledWorkflows(connector);
  if (stopSchedulesRes.isErr()) {
    logger.error(
      {
        connectorId: connector.id,
        error: stopSchedulesRes.error,
      },
      "Failed to stop Intercom scheduled workflows (intercom uninstall webhook)"
    );
    return res.status(200).end();
  }

  const stopFullSyncRes = await stopIntercomFullSyncWorkflow(connector.id);
  if (stopFullSyncRes.isErr()) {
    logger.error(
      {
        connectorId: connector.id,
        error: stopFullSyncRes.error,
      },
      "Failed to stop Intercom full sync workflow (intercom uninstall webhook)"
    );
    return res.status(200).end();
  }

  // Mark the connector as errored so that the user is notified.
  await syncFailed(connector.id, "oauth_token_revoked");

  logger.info(
    {
      workspaceId: connector.workspaceId,
      connectorId: connector.id,
      provider: "intercom",
      dataSourceId: connector.dataSourceId,
      intercomWorkspaceId,
    },
    "Errored connector from uninstall webhook"
  );

  return res.status(200).end();
};

export const webhookIntercomUninstallAPIHandler = withLogging(
  _webhookIntercomUninstallAPIHandler
);
