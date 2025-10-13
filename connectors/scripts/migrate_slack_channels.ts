/**
 * Script to migrate Slack channels from legacy "slack" connectors to "slack_bot" connectors.
 *
 * Usage:
 *   DRY RUN:            NODE_ENV=development npx tsx scripts/migrate_slack_channels.ts -w <workspaceId1> -w <workspaceId2>
 *   AUTO-DISCOVER DRY:  NODE_ENV=development npx tsx scripts/migrate_slack_channels.ts
 *   LIVE MODE:          NODE_ENV=development npx tsx scripts/migrate_slack_channels.ts -w <workspaceId1> -w <workspaceId2> -e
 *   AUTO + LIVE:        NODE_ENV=development npx tsx scripts/migrate_slack_channels.ts -e
 *
 * Note: Use NODE_ENV=development for colorized, human-readable logs in the terminal.
 *       Without it, logs will be in JSON format which is harder to read.
 *
 * The script will:
 * 1. Find legacy "slack" connector and new "slack_bot" connector for each workspace
 * 2. Copy channels from legacy connector to new connector, but only channels with agentConfigurationId
 * 3. Skip channels that already exist (collision detection by slackChannelId)
 * 4. Skip channels with null agentConfigurationId (channels without agent configurations)
 * 5. Preserve original attributes (timestamps, names, agent config, etc.) but set permission to "write"
 * 6. Provide verbose logging throughout the process
 * 7. Run in dry run mode by default (shows what would be migrated). Use -e flag to execute.
 * 8. Auto-discover workspaces if none specified (finds workspaces with both connector types)
 */
import type { CreationAttributes } from "sequelize";

import { SlackChannel } from "@connectors/lib/models/slack";
import { ConnectorResource } from "@connectors/resources/connector_resource";

import { makeScript } from "./helpers";

makeScript(
  {
    workspaceIds: {
      alias: "w",
      type: "array",
      demandOption: false,
      describe:
        "The Workspace ID(s) - can provide multiple, or leave empty to auto-discover",
    },
  },
  async (argv, logger) => {
    let { workspaceIds } = argv;
    const { execute } = argv;

    if (!execute) {
      logger.info(`🔍 DRY RUN MODE - No actual migration will be performed`);
    } else {
      logger.info(`🚀 LIVE MODE - Migration will be executed`);
    }

    // Auto-discover workspaces if none provided
    if (!workspaceIds || workspaceIds.length === 0) {
      // Find all workspaces that have both slack and slack_bot connectors
      const connectors = await ConnectorResource.model.findAll({
        where: {
          type: ["slack", "slack_bot"],
        },
        attributes: ["workspaceId", "type"],
      });

      const slackWorkspaces: Set<string> = new Set();
      const slackBotWorkspaces: Set<string> = new Set();

      connectors.forEach((connector) => {
        if (connector.type === "slack") {
          slackWorkspaces.add(connector.workspaceId);
        } else if (connector.type === "slack_bot") {
          slackBotWorkspaces.add(connector.workspaceId);
        }
      });

      // Find intersection - workspaces that have both
      workspaceIds = Array.from(slackWorkspaces).filter((workspaceId) =>
        slackBotWorkspaces.has(workspaceId)
      );

      logger.info(
        {
          totalSlackWorkspaces: slackWorkspaces.size,
          totalSlackBotWorkspaces: slackBotWorkspaces.size,
          workspacesWithBoth: workspaceIds.length,
          discoveredWorkspaces: workspaceIds,
        },
        `📊 Auto-discovery results:`
      );
    }

    logger.info(
      `📋 Processing ${workspaceIds.length} workspace(s): ${workspaceIds.join(", ")}`
    );

    for (const workspaceId of workspaceIds) {
      logger.info(`🚀 Starting migration for workspace: ${workspaceId}`);

      // Find both connectors concurrently
      const [legacyConnector, connector] = await Promise.all([
        ConnectorResource.findByWorkspaceIdAndType(workspaceId, "slack"),
        ConnectorResource.findByWorkspaceIdAndType(workspaceId, "slack_bot"),
      ]);

      if (!legacyConnector || !connector) {
        logger.info(
          {
            hasLegacySlackConnector: !!legacyConnector,
            hasSlackBotConnector: !!connector,
            legacyConnectorId: legacyConnector?.id,
            newConnectorId: connector?.id,
          },
          `⚠️  Missing connector(s) for workspace ${workspaceId}`
        );
        continue;
      }
      const [legacyChannels, existingChannels] = await Promise.all([
        SlackChannel.findAll({
          where: {
            connectorId: legacyConnector.id,
          },
        }),
        SlackChannel.findAll({
          where: {
            connectorId: connector.id,
          },
        }),
      ]);

      logger.info(
        {
          legacyChannelCount: legacyChannels.length,
          existingChannelCount: existingChannels.length,
          legacyConnectorId: legacyConnector.id,
          newConnectorId: connector.id,
        },
        `📈 Channel fetch results:`
      );

      // Create a set of existing slackChannelIds for collision detection
      const existingChannelIds = new Set(
        existingChannels.map(({ slackChannelId }) => slackChannelId)
      );

      // Filter out channels to migrate (either because they would collide or because they don't have an agent configuration)
      const channelsToMigrate = legacyChannels.filter(
        ({ slackChannelId, agentConfigurationId }) =>
          !existingChannelIds.has(slackChannelId) &&
          agentConfigurationId !== null
      );

      logger.info(
        {
          totalLegacyChannels: legacyChannels.length,
          channelsToMigrate: channelsToMigrate.length,
        },
        `📊 Migration summary:`
      );

      if (channelsToMigrate.length === 0) {
        logger.info(`✅ No channels to migrate for workspace ${workspaceId}`);
        continue;
      }

      // Create migration records
      logger.info(
        `🔧 Preparing ${channelsToMigrate.length} channels for migration...`
      );
      const creationRecords = channelsToMigrate.map(
        (channel): CreationAttributes<SlackChannel> => ({
          connectorId: connector.id, // Update to slack_bot connector ID
          createdAt: channel.createdAt, // Keep the original createdAt field
          updatedAt: channel.updatedAt, // Keep the original updatedAt field
          slackChannelId: channel.slackChannelId,
          slackChannelName: channel.slackChannelName,
          skipReason: channel.skipReason,
          private: channel.private,
          permission: "write", // Set permission to write
          agentConfigurationId: channel.agentConfigurationId,
        })
      );

      if (!execute) {
        // Dry run mode - just show what would be migrated
        creationRecords.forEach((record, index) => {
          logger.info(
            {
              slackChannelName: record.slackChannelName,
              slackChannelId: record.slackChannelId,
            },
            `🔍  DRY RUN: Would create channel #${index + 1}:`
          );
        });
      } else {
        // Live mode - perform actual migration
        logger.info(`🚀 Migrating ${creationRecords.length} channels...`);

        try {
          const createdChannels =
            await SlackChannel.bulkCreate(creationRecords);
          logger.info(
            `✅ Successfully migrated ${createdChannels.length} channels for workspace ${workspaceId}`
          );
        } catch (error) {
          logger.error(
            `❌ Failed to migrate channels for workspace ${workspaceId}:`,
            error
          );
          logger.info(
            `⚠️  Skipping workspace ${workspaceId} due to migration error. No channels were migrated for this workspace.`
          );
          continue;
        }
      }
    }

    if (!execute) {
      logger.info(`🔍 DRY RUN: All migration previews completed successfully!`);
    } else {
      logger.info(`🏁 All migrations completed successfully!`);
    }
  }
);
