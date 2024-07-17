import type {
  AdminCommandType,
  AdminSuccessResponseType,
  BatchCommandType,
  BatchRestartAllResponseType,
  ConnectorsCommandType,
  GithubCommandType,
  GoogleDriveCheckFileResponseType,
  GoogleDriveCommandType,
  IntercomCheckConversationResponseType,
  IntercomCheckMissingConversationsResponseType,
  IntercomCheckTeamsResponseType,
  IntercomCommandType,
  IntercomFetchConversationResponseType,
  NotionCheckUrlResponseType,
  NotionCommandType,
  NotionMeResponseType,
  NotionSearchPagesResponseType,
  NotionUpsertResponseType,
  Result,
  SlackCommandType,
  TemporalCheckQueueResponseType,
  TemporalCommandType,
  TemporalUnprocessedWorkflowsResponseType,
  WebcrawlerCommandType,
} from "@dust-tt/types";
import {
  assertNever,
  googleDriveIncrementalSyncWorkflowId,
  isConnectorError,
} from "@dust-tt/types";
import { Client } from "@notionhq/client";
import PQueue from "p-queue";
import readline from "readline";
import { Op } from "sequelize";

import { getConnectorManager } from "@connectors/connectors";
import { getOctokit } from "@connectors/connectors/github/lib/github_api";
import {
  launchGithubCodeSyncWorkflow,
  launchGithubFullSyncWorkflow,
} from "@connectors/connectors/github/temporal/client";
import { launchGoogleDriveIncrementalSyncWorkflow } from "@connectors/connectors/google_drive/temporal/client";
import { MIME_TYPES_TO_EXPORT } from "@connectors/connectors/google_drive/temporal/mime_types";
import {
  getAuthObject,
  getDocumentId,
  getDriveClient,
} from "@connectors/connectors/google_drive/temporal/utils";
import {
  fetchIntercomConversation,
  fetchIntercomConversationsForDay,
  fetchIntercomTeams,
} from "@connectors/connectors/intercom/lib/intercom_api";
import {
  checkNotionUrl,
  findNotionUrl,
  searchNotionPagesForQuery,
} from "@connectors/connectors/notion/lib/cli";
import { getNotionAccessToken } from "@connectors/connectors/notion/temporal/activities";
import { stopNotionGarbageCollectorWorkflow } from "@connectors/connectors/notion/temporal/client";
import { QUEUE_NAME } from "@connectors/connectors/notion/temporal/config";
import {
  upsertDatabaseWorkflow,
  upsertPageWorkflow,
} from "@connectors/connectors/notion/temporal/workflows";
import { uninstallSlack } from "@connectors/connectors/slack";
import { maybeLaunchSlackSyncWorkflowForChannelId } from "@connectors/connectors/slack/lib/cli";
import { launchSlackSyncOneThreadWorkflow } from "@connectors/connectors/slack/temporal/client";
import { launchCrawlWebsiteSchedulerWorkflow } from "@connectors/connectors/webcrawler/temporal/client";
import { GithubConnectorState } from "@connectors/lib/models/github";
import { GoogleDriveFiles } from "@connectors/lib/models/google_drive";
import {
  IntercomConversation,
  IntercomTeam,
} from "@connectors/lib/models/intercom";
import { NotionDatabase, NotionPage } from "@connectors/lib/models/notion";
import { nango_client } from "@connectors/lib/nango_client";
import {
  getTemporalClient,
  terminateAllWorkflowsForConnectorId,
  terminateWorkflow,
} from "@connectors/lib/temporal";
import { default as topLogger } from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { SlackConfigurationResource } from "@connectors/resources/slack_configuration_resource";
import { ConnectorModel } from "@connectors/resources/storage/models/connector_model";

const { NANGO_SLACK_CONNECTOR_ID, INTERACTIVE_CLI } = process.env;

async function getConnectorOrThrow({
  connectorType,
  workspaceId,
}: {
  connectorType: string;
  workspaceId: string | undefined;
}): Promise<ConnectorModel> {
  if (!workspaceId) {
    throw new Error("Missing workspace ID (wId)");
  }
  const connector = await ConnectorModel.findOne({
    where: {
      type: connectorType,
      workspaceId: workspaceId,
      dataSourceName: "managed-" + connectorType,
    },
  });
  if (!connector) {
    throw new Error(
      `No connector found for ${connectorType} workspace with ID ${workspaceId}`
    );
  }
  return connector;
}

export const connectors = async ({
  command,
  args,
}: ConnectorsCommandType): Promise<AdminSuccessResponseType> => {
  if (!args.wId) {
    throw new Error("Missing --wId argument");
  }
  if (!args.dataSourceName) {
    throw new Error("Missing --dataSourceName argument");
  }

  // We retrieve by data source name as we can have multiple data source with the same provider for
  // a given workspace.
  const connector = await ConnectorModel.findOne({
    where: {
      workspaceId: `${args.wId}`,
      dataSourceName: args.dataSourceName,
    },
  });

  if (!connector) {
    throw new Error(
      `Could not find connector for provider ${args.provider} and workspace ${args.wId}`
    );
  }
  const provider = connector.type;
  const manager = getConnectorManager({
    connectorId: connector.id,
    connectorProvider: provider,
  });
  switch (command) {
    case "stop": {
      await throwOnError(manager.stop());
      return { success: true };
    }
    case "delete": {
      await throwOnError(manager.clean({ force: true }));
      await terminateAllWorkflowsForConnectorId(connector.id);
      return { success: true };
    }
    case "resume": {
      await throwOnError(manager.resume());
      return { success: true };
    }
    case "full-resync": {
      let fromTs: number | null = null;
      if (args.fromTs) {
        fromTs = parseInt(args.fromTs as string, 10);
      }
      await throwOnError(manager.sync({ fromTs }));
      return { success: true };
    }

    case "set-error": {
      if (!args.error) {
        throw new Error("Missing --error argument");
      }
      if (!isConnectorError(args.error)) {
        throw new Error(`Invalid error: ${args.error}`);
      }
      connector.errorType = args.error;
      await connector.save();
      return { success: true };
    }

    case "restart": {
      await throwOnError(manager.stop());
      await throwOnError(manager.resume());
      return { success: true };
    }
    default:
      throw new Error(`Unknown workspace command: ${command}`);
  }
};

export const github = async ({
  command,
  args,
}: GithubCommandType): Promise<AdminSuccessResponseType> => {
  const logger = topLogger.child({ majorCommand: "github", command, args });
  switch (command) {
    case "resync-repo": {
      if (!args.wId) {
        throw new Error("Missing --wId argument");
      }
      if (!args.dataSourceName) {
        throw new Error("Missing --dataSourceName argument");
      }
      if (!args.owner) {
        throw new Error("Missing --owner argument");
      }
      if (!args.repo) {
        throw new Error("Missing --repo argument");
      }

      const connector = await ConnectorModel.findOne({
        where: {
          type: "github",
          workspaceId: `${args.wId}`,
          dataSourceName: args.dataSourceName,
        },
      });

      if (!connector) {
        throw new Error(
          `Could not find connector for workspace ${args.wId}, data source ${args.dataSourceName}`
        );
      }
      logger.info("[Admin] Resyncing repo " + args.owner + "/" + args.repo);

      const octokit = await getOctokit(connector.connectionId);

      const { data } = await octokit.rest.repos.get({
        owner: args.owner,
        repo: args.repo,
      });

      const repoId = data.id;

      await launchGithubCodeSyncWorkflow(
        connector.id,
        args.owner,
        args.repo,
        repoId
      );

      return { success: true };
    }

    case "code-sync": {
      if (!args.wId) {
        throw new Error("Missing --wId argument");
      }
      if (!args.dataSourceName) {
        throw new Error("Missing --dataSourceName argument");
      }
      if (!args.enable) {
        throw new Error("Missing --enable (true/false) argument");
      }
      if (!["true", "false"].includes(args.enable)) {
        throw new Error("--enable must be true or false");
      }

      const enable = args.enable === "true";

      const connector = await ConnectorModel.findOne({
        where: {
          type: "github",
          workspaceId: `${args.wId}`,
          dataSourceName: args.dataSourceName,
        },
      });

      if (!connector) {
        throw new Error(
          `Could not find connector for workspace ${args.wId}, data source ${args.dataSourceName}`
        );
      }

      const connectorState = await GithubConnectorState.findOne({
        where: {
          connectorId: connector.id,
        },
      });
      if (!connectorState) {
        throw new Error(
          `Connector state not found for connector ${connector.id}`
        );
      }

      await connectorState.update({
        codeSyncEnabled: enable,
      });

      // full-resync, code sync only.
      await launchGithubFullSyncWorkflow({
        connectorId: connector.id,
        syncCodeOnly: true,
      });

      return { success: true };
    }
    default:
      throw new Error("Unknown github command: " + command);
  }
};

export const notion = async ({
  command,
  args,
}: NotionCommandType): Promise<
  | AdminSuccessResponseType
  | NotionUpsertResponseType
  | NotionSearchPagesResponseType
  | NotionCheckUrlResponseType
  | NotionMeResponseType
> => {
  const logger = topLogger.child({ majorCommand: "notion", command, args });
  switch (command) {
    case "skip-page": {
      if (!args.wId) {
        throw new Error("Missing --wId argument");
      }
      if (!args.dataSourceName) {
        throw new Error("Missing --dataSourceName argument");
      }
      if (!args.pageId) {
        throw new Error("Missing --pageId argument");
      }
      const pageId = parseNotionResourceId(args.pageId);

      const connector = await ConnectorModel.findOne({
        where: {
          type: "notion",
          workspaceId: `${args.wId}`,
          dataSourceName: args.dataSourceName,
        },
      });
      if (!connector) {
        throw new Error(
          `Could not find connector for workspace ${args.wId}, data source ${args.dataSourceName} and type notion`
        );
      }
      const connectorId = connector.id;
      const existingPage = await NotionPage.findOne({
        where: {
          notionPageId: pageId,
          connectorId: connector.id,
        },
      });

      if (args.remove) {
        if (existingPage) {
          logger.info(`[Admin] Removing skipped page reason for ${pageId}`);
          await existingPage.update({
            skipReason: null,
          });
        } else {
          logger.info(
            `[Admin] Page ${pageId} is not skipped, nothing to remove`
          );
        }
        return { success: true };
      }

      const skipReason = args.reason || "blacklisted";

      if (existingPage) {
        await existingPage.update({
          skipReason,
        });
      } else {
        await NotionPage.create({
          notionPageId: pageId,
          skipReason,
          connectorId,
          lastSeenTs: new Date(),
        });
      }
      return { success: true };
    }

    case "skip-database": {
      if (!args.wId) {
        throw new Error("Missing --wId argument");
      }
      if (!args.dataSourceName) {
        throw new Error("Missing --dataSourceName argument");
      }
      if (!args.databaseId) {
        throw new Error("Missing --databaseId argument");
      }
      const databaseId = parseNotionResourceId(args.databaseId);

      const connector = await ConnectorModel.findOne({
        where: {
          type: "notion",
          workspaceId: `${args.wId}`,
          dataSourceName: args.dataSourceName,
        },
      });

      if (!connector) {
        throw new Error(
          `Could not find connector for workspace ${args.wId}, data source ${args.dataSourceName}, and type notion`
        );
      }

      const connectorId = connector.id;

      const existingDatabase = await NotionDatabase.findOne({
        where: {
          notionDatabaseId: databaseId,
          connectorId,
        },
      });

      if (args.remove) {
        if (existingDatabase) {
          logger.info(
            `[Admin] Removing skipped database reason for ${databaseId}`
          );
          await existingDatabase.update({
            skipReason: null,
          });
        } else {
          logger.info(
            `[Admin] Database ${databaseId} is not skipped, nothing to remove`
          );
        }
        return { success: true };
      }

      if (existingDatabase) {
        if (args.reason) {
          logger.info(
            `[Admin] Updating existing skipped database ${databaseId} with skip reason ${args.reason}`
          );
          await existingDatabase.update({
            skipReason: args.reason,
          });
          return { success: true };
        }
        logger.info(
          `[Admin] Database ${databaseId} is already skipped with reason ${existingDatabase.skipReason}`
        );
        return { success: true };
      }

      const skipReason = args.reason || "blacklisted";

      logger.info(
        `[Admin] Creating new skipped database ${databaseId} with reason ${skipReason}`
      );

      await NotionDatabase.create({
        notionDatabaseId: databaseId,
        skipReason,
        connectorId,
        lastSeenTs: new Date(),
      });

      return { success: true };
    }
    case "upsert-page": {
      if (!args.wId) {
        throw new Error("Missing --wId argument");
      }
      if (!args.pageId) {
        throw new Error("Missing --pageId argument");
      }
      const pageId = parseNotionResourceId(args.pageId);
      const connector = await ConnectorModel.findOne({
        where: {
          type: "notion",
          workspaceId: `${args.wId}`,
          dataSourceName: "managed-notion",
        },
      });
      if (!connector) {
        throw new Error(
          `Could not find connector for workspace ${args.wId}, data source ${args.dataSourceName} and type notion`
        );
      }
      logger.info({ pageId }, "[Admin] Upserting page");
      const connectorId = connector.id;
      const client = await getTemporalClient();
      const wf = await client.workflow.start(upsertPageWorkflow, {
        args: [
          {
            connectorId,
            pageId,
          },
        ],
        taskQueue: QUEUE_NAME,
        workflowId: `notion-force-sync-upsert-page-${pageId}-connector-${connectorId}`,
        searchAttributes: {
          connectorId: [connectorId],
        },
        memo: {
          connectorId: connectorId,
        },
      });

      const wfId = wf.workflowId;
      const temporalNamespace = process.env.TEMPORAL_NAMESPACE;
      if (!temporalNamespace) {
        logger.info(`[Admin] Started temporal workflow with id: ${wfId}`);
      } else {
        logger.info(
          `[Admin] Started temporal workflow with id: ${wfId} - https://cloud.temporal.io/namespaces/${temporalNamespace}/workflows/${wfId}`
        );
      }
      return {
        workflowId: wfId,
        workflowUrl: temporalNamespace
          ? `https://cloud.temporal.io/namespaces/${temporalNamespace}/workflows/${wfId}`
          : undefined,
      };
    }

    case "upsert-database": {
      if (!args.wId) {
        throw new Error("Missing --wId argument");
      }
      if (!args.databaseId) {
        throw new Error("Missing --databaseId argument");
      }
      const databaseId = parseNotionResourceId(args.databaseId);
      const connector = await ConnectorModel.findOne({
        where: {
          type: "notion",
          workspaceId: `${args.wId}`,
          dataSourceName: "managed-notion",
        },
      });
      if (!connector) {
        throw new Error(
          `Could not find connector for workspace ${args.wId}, data source ${args.dataSourceName} and type notion`
        );
      }
      logger.info({ databaseId }, "[Admin] Upserting database");
      const connectorId = connector.id;
      const client = await getTemporalClient();
      const wf = await client.workflow.start(upsertDatabaseWorkflow, {
        args: [
          {
            connectorId,
            databaseId,
            forceResync: !!args.forceResync,
          },
        ],
        taskQueue: QUEUE_NAME,
        workflowId: `notion-force-sync-upsert-database-${databaseId}-connector-${connectorId}`,
        searchAttributes: {
          connectorId: [connectorId],
        },
        memo: {
          connectorId: connectorId,
        },
      });

      const wfId = wf.workflowId;
      const temporalNamespace = process.env.TEMPORAL_NAMESPACE;
      if (!temporalNamespace) {
        logger.info(`[Admin] Started temporal workflow with id: ${wfId}`);
      } else {
        logger.info(
          `[Admin] Started temporal workflow with id: ${wfId} - https://cloud.temporal.io/namespaces/${temporalNamespace}/workflows/${wfId}`
        );
      }
      return {
        workflowId: wfId,
        workflowUrl: temporalNamespace
          ? `https://cloud.temporal.io/namespaces/${temporalNamespace}/workflows/${wfId}`
          : undefined,
      };
    }

    case "search-pages": {
      const { query, wId } = args;

      if (!query) {
        throw new Error("Missing --query argument");
      }

      const connector = await getConnectorOrThrow({
        connectorType: "notion",
        workspaceId: wId,
      });

      const pages = await searchNotionPagesForQuery({
        connectorId: connector.id,
        connectionId: connector.connectionId,
        query,
      });

      return { pages };
    }

    case "check-url": {
      const { url, wId } = args;

      if (!url) {
        throw new Error("Missing --url argument");
      }

      const connector = await getConnectorOrThrow({
        connectorType: "notion",
        workspaceId: wId,
      });

      const r = await checkNotionUrl({
        connectorId: connector.id,
        connectionId: connector.connectionId,
        url,
      });

      return r;
    }

    case "find-url": {
      const { url, wId } = args;

      if (!url) {
        throw new Error("Missing --url argument");
      }

      const connector = await getConnectorOrThrow({
        connectorType: "notion",
        workspaceId: wId,
      });

      const r = await findNotionUrl({
        connectorId: connector.id,
        url,
      });

      return r;
    }

    case "me": {
      const { wId } = args;

      const connector = await getConnectorOrThrow({
        connectorType: "notion",
        workspaceId: wId,
      });

      const notionAccessToken = await getNotionAccessToken(
        connector.connectionId
      );

      const notionClient = new Client({
        auth: notionAccessToken,
      });
      const me = await notionClient.users.me({});
      // @ts-expect-error untyped bot field
      return { me, botOwner: me.bot.owner };
    }

    case "stop-all-garbage-collectors": {
      const connectors = await ConnectorModel.findAll({
        where: {
          type: "notion",
        },
      });
      logger.info(
        {
          connectorsCount: connectors.length,
        },
        "[Admin] Stopping all notion garbage collectors"
      );
      for (const connector of connectors) {
        logger.info(
          { connectorId: connector.id },
          "[Admin] Stopping notion garbage collector"
        );
        await stopNotionGarbageCollectorWorkflow(connector.id);
      }
      return { success: true };
    }

    default:
      throw new Error("Unknown notion command: " + command);
  }
};

export const google_drive = async ({
  command,
  args,
}: GoogleDriveCommandType): Promise<
  AdminSuccessResponseType | GoogleDriveCheckFileResponseType
> => {
  const logger = topLogger.child({
    majorCommand: "google_drive",
    command,
    args,
  });
  switch (command) {
    case "garbage-collect-all": {
      const connectors = await ConnectorModel.findAll({
        where: {
          type: "google_drive",
        },
      });
      for (const connector of connectors) {
        await throwOnError(
          getConnectorManager({
            connectorId: connector.id,
            connectorProvider: "google_drive",
          }).garbageCollect()
        );
      }
      return { success: true };
    }
    case "check-file": {
      if (!args.connectorId) {
        throw new Error("Missing --connectorId argument");
      }
      if (!args.fileId) {
        throw new Error("Missing --fileId argument");
      }
      if (
        !args.fileType ||
        (args.fileType !== "document" && args.fileType !== "presentation")
      ) {
        throw new Error(
          `Invalid or missing --fileType argument: ${args.fileType}`
        );
      }
      logger.info("[Admin] Checking gdrive file");
      const connector = await ConnectorResource.fetchById(args.connectorId);
      if (!connector) {
        throw new Error(`Connector ${args.connectorId} not found`);
      }
      const drive = await getDriveClient(
        await getAuthObject(connector.connectionId)
      );
      const res = await drive.files.export({
        fileId: args.fileId,
        mimeType:
          MIME_TYPES_TO_EXPORT[
            args.fileType === "document"
              ? "application/vnd.google-apps.document"
              : "application/vnd.google-apps.presentation"
          ],
      });
      return { status: res.status, content: res.data, type: typeof res.data };
    }

    case "start-incremental-sync": {
      if (!args.wId) {
        throw new Error("Missing --wId argument");
      }
      if (!args.dataSourceName) {
        throw new Error("Missing --dataSourceName argument");
      }

      const connector = await ConnectorModel.findOne({
        where: {
          workspaceId: `${args.wId}`,
          dataSourceName: args.dataSourceName,
          type: "google_drive",
        },
      });
      if (!connector) {
        throw new Error(
          `Could not find connector for workspace ${args.wId} and data source ${args.dataSourceName}`
        );
      }
      await throwOnError(
        launchGoogleDriveIncrementalSyncWorkflow(connector.id)
      );
      return { success: true };
    }
    case "restart-all-incremental-sync-workflows": {
      const connectors = await ConnectorModel.findAll({
        where: {
          type: "google_drive",
          errorType: null,
          pausedAt: null,
        },
      });
      for (const connector of connectors) {
        const workflowId = googleDriveIncrementalSyncWorkflowId(connector.id);
        await terminateWorkflow(workflowId);
        await throwOnError(
          launchGoogleDriveIncrementalSyncWorkflow(connector.id)
        );
      }
      return { success: true };
    }

    case "skip-file": {
      if (!args.wId) {
        throw new Error("Missing --wId argument");
      }
      if (!args.dataSourceName) {
        throw new Error("Missing --dataSourceName argument");
      }
      if (!args.fileId) {
        throw new Error("Missing --fileId argument");
      }

      const connector = await ConnectorModel.findOne({
        where: {
          workspaceId: `${args.wId}`,
          dataSourceName: args.dataSourceName,
        },
      });
      if (!connector) {
        throw new Error(
          `Could not find connector for workspace ${args.wId} and data source ${args.dataSourceName}`
        );
      }

      const existingFile = await GoogleDriveFiles.findOne({
        where: {
          driveFileId: args.fileId,
          connectorId: connector.id,
        },
      });
      if (existingFile) {
        await existingFile.update({
          skipReason: args.reason || "blacklisted",
        });
      } else {
        await GoogleDriveFiles.create({
          driveFileId: args.fileId,
          dustFileId: getDocumentId(args.fileId),
          name: "unknown",
          mimeType: "unknown",
          connectorId: connector.id,
          skipReason: args.reason || "blacklisted",
        });
      }

      return { success: true };
    }

    default:
      throw new Error("Unknown google command: " + command);
  }
};

export const slack = async ({
  command,
  args,
}: SlackCommandType): Promise<AdminSuccessResponseType> => {
  const logger = topLogger.child({ majorCommand: "slack", command, args });
  switch (command) {
    case "enable-bot": {
      if (!args.wId) {
        throw new Error("Missing --wId argument");
      }
      const connector = await ConnectorModel.findOne({
        where: {
          workspaceId: `${args.wId}`,
          type: "slack",
        },
      });
      if (!connector) {
        throw new Error(`Could not find connector for workspace ${args.wId}`);
      }
      const slackConfig = await SlackConfigurationResource.fetchByConnectorId(
        connector.id
      );
      if (!slackConfig) {
        throw new Error(
          `Could not find slack configuration for connector ${connector.id}`
        );
      }

      const res = await slackConfig.enableBot();
      if (res.isErr()) {
        throw res.error;
      }
      return { success: true };
    }

    case "sync-channel": {
      const { channelId, wId } = args;

      if (!wId) {
        throw new Error("Missing --wId argument");
      }
      if (!channelId) {
        throw new Error("Missing --channelId argument");
      }

      const connector = await ConnectorModel.findOne({
        where: {
          workspaceId: wId,
          type: "slack",
        },
      });
      if (!connector) {
        throw new Error(`Could not find connector for workspace ${wId}`);
      }

      await throwOnError(
        maybeLaunchSlackSyncWorkflowForChannelId(connector.id, channelId)
      );

      return { success: true };
    }

    case "sync-thread": {
      if (!args.wId) {
        throw new Error("Missing --wId argument");
      }
      if (!args.threadId) {
        throw new Error("Missing --threadId argument");
      }
      if (!args.channelId) {
        throw new Error("Missing --channelId argument");
      }
      const connector = await ConnectorModel.findOne({
        where: {
          workspaceId: `${args.wId}`,
          type: "slack",
        },
      });
      if (!connector) {
        throw new Error(`Could not find connector for workspace ${args.wId}`);
      }
      await throwOnError(
        launchSlackSyncOneThreadWorkflow(
          connector.id,
          args.channelId,
          args.threadId
        )
      );

      return { success: true };
    }

    case "uninstall-for-unknown-team-ids": {
      if (!NANGO_SLACK_CONNECTOR_ID) {
        throw new Error("NANGO_SLACK_CONNECTOR_ID is not defined");
      }

      const slackConfigurations = await SlackConfigurationResource.listAll();
      const connections = await nango_client().listConnections();

      const oneHourAgo = new Date();
      oneHourAgo.setHours(oneHourAgo.getHours() - 1);

      const slackConnections = connections.connections.filter(
        (connection: {
          id: number;
          connection_id: string;
          provider: string;
          created: string;
        }) => {
          const createdAt = new Date(connection.created);
          return (
            connection.provider === NANGO_SLACK_CONNECTOR_ID &&
            createdAt < oneHourAgo
          );
        }
      );

      const askQuestion = async (query: string): Promise<string> => {
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });

        return new Promise((resolve) => {
          rl.question(query, (answer) => {
            rl.close();
            resolve(answer);
          });
        });
      };

      for (const connection of slackConnections) {
        const connectionDetail = await nango_client().getConnection(
          connection.provider,
          connection.connection_id
        );
        const slackTeamId = connectionDetail.credentials.raw.team.id;

        if (!slackConfigurations.find((sc) => sc.slackTeamId === slackTeamId)) {
          if (INTERACTIVE_CLI) {
            const answer: string = await askQuestion(
              `Do you want to delete Nango connection ${connection.connection_id} and auth token for team ${slackTeamId}? (y/N) `
            );
            if (answer.toLowerCase() !== "y") {
              continue;
            }
          }
          logger.info(
            "[Admin] Uninstalling Slack and cleaning connection id..."
          );
          await uninstallSlack(connection.connection_id);
        }
      }
      return { success: true };
    }

    case "whitelist-domains": {
      const { wId, whitelistedDomains } = args;
      if (!wId) {
        throw new Error("Missing --wId argument");
      }
      if (!whitelistedDomains) {
        throw new Error("Missing --whitelistedDomains argument");
      }

      const connector = await ConnectorModel.findOne({
        where: {
          workspaceId: `${args.wId}`,
          type: "slack",
        },
      });

      if (!connector) {
        throw new Error(`Could not find connector for workspace ${args.wId}`);
      }

      const whitelistedDomainsArray = whitelistedDomains.split(",");
      // TODO(2024-01-10 flav) Add domain validation.
      logger.info(
        `[Admin] Whitelisting following domains for slack:\n- ${whitelistedDomainsArray.join(
          "\n-"
        )}`
      );

      const slackConfig = await SlackConfigurationResource.fetchByConnectorId(
        connector.id
      );
      if (slackConfig) {
        await slackConfig.setWhitelistedDomains(whitelistedDomainsArray);
      }

      return { success: true };
    }

    case "whitelist-bot": {
      const { wId, botName } = args;
      if (!wId) {
        throw new Error("Missing --wId argument");
      }
      if (!botName) {
        throw new Error("Missing --botName argument");
      }

      const connector = await ConnectorModel.findOne({
        where: {
          workspaceId: `${args.wId}`,
          type: "slack",
        },
      });

      if (!connector) {
        throw new Error(`Could not find connector for workspace ${args.wId}`);
      }

      logger.info(`[Admin] Whitelisting following bot for slack: ${botName}`);

      const slackConfig = await SlackConfigurationResource.fetchByConnectorId(
        connector.id
      );
      if (slackConfig) {
        await slackConfig.whitelistBot(botName);
      }

      return { success: true };
    }

    default:
      throw new Error("Unknown slack command: " + command);
  }
};

export const batch = async ({
  command,
  args,
}: BatchCommandType): Promise<
  AdminSuccessResponseType | BatchRestartAllResponseType
> => {
  const logger = topLogger.child({ majorCommand: "batch", command, args });
  switch (command) {
    case "full-resync": {
      if (!args.provider) {
        throw new Error("Missing --provider argument");
      }
      let fromTs: number | null = null;
      if (args.fromTs) {
        fromTs = parseInt(args.fromTs as string, 10);
      }

      const connectors = await ConnectorModel.findAll({
        where: {
          type: args.provider,
        },
      });

      if (INTERACTIVE_CLI) {
        const answer: string = await new Promise((resolve) => {
          const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
          });
          rl.question(
            `Are you sure you want to trigger full sync for ${connectors.length} connectors of type ${args.provider}? (y/N) `,
            (answer) => {
              rl.close();
              resolve(answer);
            }
          );
        });

        if (answer !== "y") {
          logger.info("[Admin] Cancelled");
          return { success: true };
        }
      }

      for (const connector of connectors) {
        await throwOnError(
          getConnectorManager({
            connectorId: connector.id,
            connectorProvider: connector.type,
          }).sync({ fromTs })
        );
        logger.info(
          `[Admin] Triggered for connector id:${connector.id} - ${connector.type} - workspace:${connector.workspaceId} - dataSource:${connector.dataSourceName} - fromTs:${fromTs}`
        );
      }
      return { success: true };
    }
    case "restart-all": {
      if (!args.provider) {
        throw new Error("Missing --provider argument");
      }
      const PROVIDERS_ALLOWING_RESTART = [
        "notion",
        "intercom",
        "confluence",
        "github",
      ];
      if (!PROVIDERS_ALLOWING_RESTART.includes(args.provider)) {
        throw new Error(
          `Can't restart-all for ${
            args.provider
          }. Allowed providers: ${PROVIDERS_ALLOWING_RESTART.join(" ")}`
        );
      }

      const queue = new PQueue({ concurrency: 10 });
      const promises: Promise<void>[] = [];
      const connectors = await ConnectorModel.findAll({
        where: {
          type: args.provider,
          errorType: null,
          pausedAt: null,
        },
      });
      for (const connector of connectors) {
        promises.push(
          queue.add(async () => {
            await throwOnError(
              getConnectorManager({
                connectorId: connector.id,
                connectorProvider: connector.type,
              }).stop()
            );
            await throwOnError(
              getConnectorManager({
                connectorId: connector.id,
                connectorProvider: connector.type,
              }).resume()
            );
          })
        );
      }
      let succeeded = 0;
      let failed = 0;

      const logInfo = () => {
        const completed = succeeded + failed;

        if (
          (completed && completed % 10 === 0) ||
          completed === connectors.length
        ) {
          logger.info(
            `[Admin] completed ${completed} / ${connectors.length} (${failed} failed)`
          );
        }
      };

      queue.on("completed", () => {
        succeeded++;
        logInfo();
      });
      queue.on("error", () => {
        failed++;
        logInfo();
      });

      await Promise.all(promises);

      return { succeeded, failed };
    }
    default:
      throw new Error("Unknown batch command: " + command);
  }
};

export const webcrawler = async ({
  command,
}: WebcrawlerCommandType): Promise<AdminSuccessResponseType> => {
  switch (command) {
    case "start-scheduler": {
      await throwOnError(launchCrawlWebsiteSchedulerWorkflow());
      return { success: true };
    }
  }
};

export const temporal = async ({
  command,
  args,
}: TemporalCommandType): Promise<
  | AdminSuccessResponseType
  | TemporalCheckQueueResponseType
  | TemporalUnprocessedWorkflowsResponseType
> => {
  const logger = topLogger.child({ majorCommand: "temporal", command, args });
  switch (command) {
    case "check-queue": {
      const q = args.queue;
      if (!q) {
        throw new Error("Missing --queue argument");
      }
      const c = await getTemporalClient();
      const describeTqRes = await c.workflowService.describeTaskQueue({
        namespace: process.env.TEMPORAL_NAMESPACE || "default",
        taskQueue: { name: q },
      });
      logger.info({ describeTqRes }, "[Admin] DescribeTqRes");
      return { taskQueue: describeTqRes.toJSON() };
    }

    case "find-unprocessed-workflows": {
      const c = await getTemporalClient();
      const queues = new Set<string>();

      const openWfRes = await c.workflowService.listWorkflowExecutions({
        namespace: process.env.TEMPORAL_NAMESPACE || "default",
        pageSize: 5000,
        query: `ExecutionStatus="Running"`,
      });
      if (openWfRes.executions?.length) {
        logger.info(`[Admin] got ${openWfRes.executions.length} results`);
        for (const x of openWfRes.executions) {
          if (x.taskQueue) {
            queues.add(x.taskQueue);
          }
        }
      }

      const queuesAndPollers = [];
      for (const q of queues) {
        const qRes = await c.workflowService.describeTaskQueue({
          namespace: process.env.TEMPORAL_NAMESPACE || "default",
          taskQueue: { name: q },
        });
        logger.info(
          { qRes },
          "[Admin] Queue has " + qRes.pollers?.length + " pollers"
        );
        queuesAndPollers.push({
          queue: q,
          pollers: qRes.pollers?.length || 0,
        });
      }
      return {
        queuesAndPollers,
        unprocessedQueues: queuesAndPollers
          .filter((q) => q.pollers === 0)
          .map((q) => q.queue),
      };
    }
  }
};

export const intercom = async ({
  command,
  args,
}: IntercomCommandType): Promise<
  | IntercomCheckConversationResponseType
  | IntercomFetchConversationResponseType
  | IntercomCheckTeamsResponseType
  | IntercomCheckMissingConversationsResponseType
> => {
  const logger = topLogger.child({ majorCommand: "intercom", command, args });

  if (!args.connectorId) {
    throw new Error("Missing --connectorId argument");
  }
  const connectorId = args.connectorId.toString();

  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(`Connector ${connectorId} not found`);
  }
  if (connector.type !== "intercom") {
    throw new Error(`Connector ${args.connectorId} is not of type intercom`);
  }

  switch (command) {
    case "check-conversation": {
      if (!args.conversationId) {
        throw new Error("Missing --conversationId argument");
      }
      const conversationId = args.conversationId.toString();

      logger.info("[Admin] Checking conversation");

      const conversationOnIntercom = await fetchIntercomConversation({
        nangoConnectionId: connector.connectionId,
        conversationId,
      });
      const teamIdOnIntercom =
        typeof conversationOnIntercom?.team_assignee_id === "number"
          ? conversationOnIntercom.team_assignee_id.toString()
          : undefined;

      const conversationOnDB = await IntercomConversation.findOne({
        where: {
          conversationId,
          connectorId,
        },
      });

      return {
        isConversationOnIntercom: conversationOnIntercom !== null,
        isConversationOnDB: conversationOnDB !== null,
        conversationTeamIdOnIntercom: teamIdOnIntercom,
        conversationTeamIdOnDB: conversationOnDB?.teamId,
      };
    }
    case "fetch-conversation": {
      if (!args.conversationId) {
        throw new Error("Missing --conversationId argument");
      }
      const conversationId = args.conversationId.toString();

      logger.info("[Admin] Checking conversation");

      const conversationOnIntercom = await fetchIntercomConversation({
        nangoConnectionId: connector.connectionId,
        conversationId,
      });

      return {
        conversation: conversationOnIntercom,
      };
    }
    case "check-missing-conversations": {
      if (!args.day) {
        throw new Error("Missing --day argument");
      }
      if (!args.day.match(/^\d{4}-\d{2}-\d{2}$/)) {
        throw new Error("Invalid --day argument format");
      }

      const startOfDay = new Date(args.day);
      startOfDay.setHours(0, 0, 0, 0);

      const endOfDay = new Date(args.day);
      endOfDay.setHours(23, 59, 59, 999);

      logger.info("[Admin] Checking conversations for day");

      // Fetch all conversations for the day from Intercom
      const convosOnIntercom = [];
      let cursor = null;
      let convosOnIntercomRes;

      do {
        convosOnIntercomRes = await fetchIntercomConversationsForDay({
          nangoConnectionId: connector.connectionId,
          minCreatedAt: startOfDay.getTime() / 1000,
          maxCreatedAt: endOfDay.getTime() / 1000,
          cursor,
          pageSize: 50,
        });
        convosOnIntercom.push(...convosOnIntercomRes.conversations);
        cursor = convosOnIntercomRes.pages.next
          ? convosOnIntercomRes.pages.next.starting_after
          : null;
      } while (cursor);

      // Fetch all conversations for the day from DB
      const convosOnDB = await IntercomConversation.findAll({
        where: {
          connectorId,
          conversationCreatedAt: {
            [Op.gte]: startOfDay,
            [Op.lte]: endOfDay,
          },
        },
      });

      // Get missing conversations in DB
      const missingConversations = convosOnIntercom.filter(
        (convo) =>
          !convosOnDB.some((c) => c.conversationId === convo.id.toString())
      );

      return {
        missingConversations: missingConversations.map((convo) => ({
          conversationId: convo.id,
          teamId: convo.team_assignee_id,
          open: convo.open,
          createdAt: convo.created_at,
        })),
      };
    }
    case "check-teams": {
      logger.info("[Admin] Checking teams");

      const teamsOnIntercom = await fetchIntercomTeams(connector.connectionId);
      const teamsOnDb = await IntercomTeam.findAll({
        where: {
          connectorId,
        },
      });

      return {
        teams: teamsOnIntercom.map((team) => ({
          teamId: team.id,
          name: team.name,
          isTeamOnDB: teamsOnDb.some((t) => t.teamId === team.id),
        })),
      };
    }
  }
};

export async function runCommand(adminCommand: AdminCommandType) {
  switch (adminCommand.majorCommand) {
    case "connectors":
      return connectors(adminCommand);
    case "batch":
      return batch(adminCommand);
    case "notion":
      return notion(adminCommand);
    case "github":
      return github(adminCommand);
    case "google_drive":
      return google_drive(adminCommand);
    case "slack":
      return slack(adminCommand);
    case "webcrawler":
      return webcrawler(adminCommand);
    case "temporal":
      return temporal(adminCommand);
    case "intercom":
      return intercom(adminCommand);
    default:
      assertNever(adminCommand);
  }
}

async function throwOnError<T>(p: Promise<Result<T, Error>>) {
  const res = await p;
  if (res.isErr()) {
    throw res.error;
  }
  return res;
}

function parseNotionResourceId(resourceId: unknown): string {
  if (typeof resourceId !== "string") {
    throw new Error(`Invalid Notion resource id: ${resourceId}.`);
  }

  if (!resourceId.includes("-")) {
    if (resourceId.length !== 32) {
      throw new Error(`Invalid Notion resource id: ${resourceId}.`);
    }

    // add dashes
    return [
      resourceId.slice(0, 8),
      resourceId.slice(8, 12),
      resourceId.slice(12, 16),
      resourceId.slice(16, 20),
      resourceId.slice(20),
    ].join("-");
  }

  const regex =
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
  if (!regex.test(resourceId)) {
    throw new Error(`Invalid Notion resource id: ${resourceId}.`);
  }

  return resourceId;
}
