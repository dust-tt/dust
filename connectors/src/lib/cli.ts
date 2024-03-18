import type {
  AdminSuccessResponseType,
  BatchCommandType,
  ConnectorsCommandType,
  GithubCommandType,
  GoogleDriveCheckFileResponseType,
  GoogleDriveCommandType,
  NotionCheckUrlResponseType,
  NotionCommandType,
  NotionMeResponseType,
  NotionRestartAllResponseType,
  NotionSearchPagesResponseType,
  NotionUpsertResponseType,
  Result,
  SlackCommandType,
  TemporalCheckQueueResponseType,
  TemporalCommandType,
  TemporalUnprocessedWorkflowsResponseType,
  WebcrawlerCommandType,
} from "@dust-tt/types";
import { isConnectorError } from "@dust-tt/types";
import { Client } from "@notionhq/client";
import PQueue from "p-queue";
import readline from "readline";

import {
  DELETE_CONNECTOR_BY_TYPE,
  GARBAGE_COLLECT_BY_TYPE,
  RESUME_CONNECTOR_BY_TYPE,
  STOP_CONNECTOR_BY_TYPE,
  SYNC_CONNECTOR_BY_TYPE,
} from "@connectors/connectors";
import { getOctokit } from "@connectors/connectors/github/lib/github_api";
import {
  launchGithubCodeSyncWorkflow,
  launchGithubFullSyncWorkflow,
} from "@connectors/connectors/github/temporal/client";
import { registerWebhook } from "@connectors/connectors/google_drive/lib";
import {
  launchGoogleDriveIncrementalSyncWorkflow,
  launchGoogleDriveRenewWebhooksWorkflow,
} from "@connectors/connectors/google_drive/temporal/client";
import { MIME_TYPES_TO_EXPORT } from "@connectors/connectors/google_drive/temporal/mime_types";
import {
  getAuthObject,
  getDocumentId,
  getDriveClient,
} from "@connectors/connectors/google_drive/temporal/utils";
import {
  checkNotionUrl,
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
import { toggleSlackbot } from "@connectors/connectors/slack/bot";
import { maybeLaunchSlackSyncWorkflowForChannelId } from "@connectors/connectors/slack/lib/cli";
import { launchSlackSyncOneThreadWorkflow } from "@connectors/connectors/slack/temporal/client";
import { launchCrawlWebsiteSchedulerWorkflow } from "@connectors/connectors/webcrawler/temporal/client";
import { GithubConnectorState } from "@connectors/lib/models/github";
import {
  GoogleDriveFiles,
  GoogleDriveWebhook,
} from "@connectors/lib/models/google_drive";
import { NotionDatabase, NotionPage } from "@connectors/lib/models/notion";
import { SlackConfiguration } from "@connectors/lib/models/slack";
import { nango_client } from "@connectors/lib/nango_client";
import {
  getTemporalClient,
  terminateAllWorkflowsForConnectorId,
} from "@connectors/lib/temporal";
import { default as topLogger } from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
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

  switch (command) {
    case "stop": {
      await throwOnError(STOP_CONNECTOR_BY_TYPE[provider](connector.id));
      return { success: true };
    }
    case "delete": {
      await throwOnError(
        DELETE_CONNECTOR_BY_TYPE[provider](connector.id, true)
      );
      await terminateAllWorkflowsForConnectorId(connector.id);
      return { success: true };
    }
    case "resume": {
      await throwOnError(RESUME_CONNECTOR_BY_TYPE[provider](connector.id));
      return { success: true };
    }
    case "full-resync": {
      let fromTs: number | null = null;
      if (args.fromTs) {
        fromTs = parseInt(args.fromTs as string, 10);
      }
      await throwOnError(
        SYNC_CONNECTOR_BY_TYPE[provider](connector.id, fromTs)
      );
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
      await throwOnError(STOP_CONNECTOR_BY_TYPE[provider](connector.id));
      await throwOnError(RESUME_CONNECTOR_BY_TYPE[provider](connector.id));
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

      const installationId = connector.connectionId;

      const octokit = await getOctokit(installationId);

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
  | NotionRestartAllResponseType
  | NotionUpsertResponseType
  | NotionSearchPagesResponseType
  | NotionCheckUrlResponseType
  | NotionMeResponseType
> => {
  const logger = topLogger.child({ majorCommand: "notion", command, args });
  switch (command) {
    case "restart-all": {
      const queue = new PQueue({ concurrency: 10 });
      const promises: Promise<void>[] = [];
      const connectors = await ConnectorModel.findAll({
        where: {
          type: "notion",
          errorType: null,
        },
      });
      for (const connector of connectors) {
        promises.push(
          queue.add(async () => {
            await throwOnError(
              STOP_CONNECTOR_BY_TYPE[connector.type](connector.id)
            );
            await throwOnError(
              RESUME_CONNECTOR_BY_TYPE[connector.type](connector.id)
            );
          })
        );
      }
      let success = 0;
      let failed = 0;

      const logInfo = () => {
        const completed = success + failed;

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
        success++;
        logInfo();
      });
      queue.on("error", () => {
        failed++;
        logInfo();
      });

      await Promise.all(promises);

      return { restartSuccesses: success, restartFailures: failed };
    }

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
          GARBAGE_COLLECT_BY_TYPE[connector.type](connector.id)
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
    case "restart-google-webhooks": {
      await throwOnError(launchGoogleDriveRenewWebhooksWorkflow());
      return { success: true };
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
    case "register-webhook": {
      // Re-register a webhook for a given connectors. Used for selected connectors who eneded up
      // without GoogleDriveWebhook.
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
        },
      });
      if (!connector) {
        throw new Error(
          `Could not find connector for workspace ${args.wId} and data source ${args.dataSourceName}`
        );
      }

      const webhookInfo = await registerWebhook(connector);
      if (webhookInfo.isErr()) {
        throw webhookInfo.error;
      } else {
        await GoogleDriveWebhook.create({
          webhookId: webhookInfo.value.id,
          expiresAt: new Date(webhookInfo.value.expirationTsMs),
          renewAt: new Date(webhookInfo.value.expirationTsMs),
          connectorId: connector.id,
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
      await throwOnError(toggleSlackbot(connector.id, true));
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

      const slackConfigurations = await SlackConfiguration.findAll();
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
      await SlackConfiguration.update(
        {
          whitelistedDomains: whitelistedDomainsArray,
        },
        {
          where: {
            connectorId: connector.id,
          },
        }
      );

      return { success: true };
    }

    default:
      throw new Error("Unknown slack command: " + command);
  }
};

export const batch = async ({
  command,
  args,
}: BatchCommandType): Promise<AdminSuccessResponseType> => {
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
          SYNC_CONNECTOR_BY_TYPE[connector.type](connector.id, fromTs)
        );
        logger.info(
          `[Admin] Triggered for connector id:${connector.id} - ${connector.type} - workspace:${connector.workspaceId} - dataSource:${connector.dataSourceName} - fromTs:${fromTs}`
        );
      }
      return { success: true };
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
