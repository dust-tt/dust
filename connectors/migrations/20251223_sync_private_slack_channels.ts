/**
 * Script to sync all private Slack channels for a given connector or all Slack connectors.
 *
 * Usage:
 *   DRY RUN (single connector):   npx tsx migrations/20251223_sync_private_slack_channels.ts --connectorId 123
 *   DRY RUN (all connectors):     npx tsx migrations/20251223_sync_private_slack_channels.ts
 *   EXECUTE (single connector):   npx tsx migrations/20251223_sync_private_slack_channels.ts --connectorId 123 -e
 *   EXECUTE (all connectors):     npx tsx migrations/20251223_sync_private_slack_channels.ts -e
 *
 * The script will:
 * 1. Find all private channels with permission "read" or "read_write" (and no skipReason)
 * 2. Launch a sync workflow for each channel
 */
import { Op } from "sequelize";

import { makeScript } from "scripts/helpers";

import { launchSlackSyncWorkflow } from "@connectors/connectors/slack/temporal/client";
import { SlackChannelModel } from "@connectors/lib/models/slack";
import { ConnectorResource } from "@connectors/resources/connector_resource";

const SLACK_CONNECTOR_TYPE = "slack";

makeScript(
  {
    connectorId: {
      type: "number",
      demandOption: false,
      describe:
        "Optional connector ID to sync. If not provided, syncs all Slack connectors.",
    },
  },
  async ({ connectorId, execute }, logger) => {
    const connectors = connectorId
      ? await ConnectorResource.fetchByIds(SLACK_CONNECTOR_TYPE, [connectorId])
      : await ConnectorResource.listByType(SLACK_CONNECTOR_TYPE, {});

    if (connectors.length === 0) {
      logger.info("No Slack connectors found.");
      return;
    }

    logger.info(
      `Processing ${connectors.length} Slack connector(s) for private channel sync`
    );

    let totalChannelsSynced = 0;
    let totalFailures = 0;

    for (const connector of connectors) {
      logger.info(
        { connectorId: connector.id },
        "Fetching private channels for connector"
      );

      const privateChannels = await SlackChannelModel.findAll({
        where: {
          connectorId: connector.id,
          private: true,
          skipReason: null,
          permission: {
            [Op.in]: ["read", "read_write"],
          },
        },
      });

      if (privateChannels.length === 0) {
        logger.info(
          { connectorId: connector.id },
          "No private channels with read/read_write permission found"
        );
        continue;
      }

      logger.info(
        {
          connectorId: connector.id,
          channelCount: privateChannels.length,
        },
        "Found private channels to sync"
      );

      for (const channel of privateChannels) {
        if (execute) {
          logger.info(
            {
              connectorId: connector.id,
              channelId: channel.slackChannelId,
              channelName: channel.slackChannelName,
            },
            "Launching sync workflow for private channel"
          );

          const result = await launchSlackSyncWorkflow(connector.id, null, [
            channel.slackChannelId,
          ]);

          if (result.isErr()) {
            logger.error(
              {
                connectorId: connector.id,
                channelId: channel.slackChannelId,
                error: result.error,
              },
              "Failed to launch sync workflow"
            );
            totalFailures++;
          } else {
            logger.info(
              {
                connectorId: connector.id,
                channelId: channel.slackChannelId,
                workflowId: result.value,
              },
              "Sync workflow launched successfully"
            );
            totalChannelsSynced++;
          }
        } else {
          logger.info(
            {
              connectorId: connector.id,
              channelId: channel.slackChannelId,
              channelName: channel.slackChannelName,
              permission: channel.permission,
            },
            "DRY RUN: Would launch sync workflow for private channel"
          );
          totalChannelsSynced++;
        }
      }
    }

    if (execute) {
      if (totalFailures > 0) {
        logger.warn(
          { totalChannelsSynced, totalFailures },
          "Sync completed with failures"
        );
      } else {
        logger.info(
          { totalChannelsSynced },
          "Sync workflows launched successfully"
        );
      }
    } else {
      logger.info(
        { totalChannelsSynced },
        "DRY RUN: Would have synced channels"
      );
    }
  }
);
