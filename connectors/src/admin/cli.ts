import parseArgs from "minimist";
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
import {
  getAuthObject,
  getDocumentId,
  getDriveClient,
  MIME_TYPES_TO_EXPORT,
} from "@connectors/connectors/google_drive/temporal/activities";
import {
  launchGoogleDriveIncrementalSyncWorkflow,
  launchGoogleDriveRenewWebhooksWorkflow,
} from "@connectors/connectors/google_drive/temporal/client";
import { QUEUE_NAME } from "@connectors/connectors/notion/temporal/config";
import { upsertPageWorkflow } from "@connectors/connectors/notion/temporal/workflows";
import { uninstallSlack } from "@connectors/connectors/slack";
import { toggleSlackbot } from "@connectors/connectors/slack/bot";
import { maybeLaunchSlackSyncWorkflowForChannelId } from "@connectors/connectors/slack/lib/cli";
import { launchSlackSyncOneThreadWorkflow } from "@connectors/connectors/slack/temporal/client";
import { Connector } from "@connectors/lib/models";
import { GithubConnectorState } from "@connectors/lib/models/github";
import { GoogleDriveFiles } from "@connectors/lib/models/google_drive";
import { NotionDatabase, NotionPage } from "@connectors/lib/models/notion";
import { SlackConfiguration } from "@connectors/lib/models/slack";
import { nango_client } from "@connectors/lib/nango_client";
import { Result } from "@connectors/lib/result";
import {
  getTemporalClient,
  terminateAllWorkflowsForConnectorId,
} from "@connectors/lib/temporal";
import logger from "@connectors/logger/logger";

const { NANGO_SLACK_CONNECTOR_ID } = process.env;

const connectors = async (command: string, args: parseArgs.ParsedArgs) => {
  if (!args.wId) {
    throw new Error("Missing --wId argument");
  }
  if (!args.dataSourceName) {
    throw new Error("Missing --dataSourceName argument");
  }

  // We retrieve by data source name as we can have multiple data source with the same provider for
  // a given workspace.
  const connector = await Connector.findOne({
    where: {
      workspaceId: args.wId,
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
      await throwOnError(
        STOP_CONNECTOR_BY_TYPE[provider](connector.id.toString())
      );
      return;
    }
    case "delete": {
      await throwOnError(
        DELETE_CONNECTOR_BY_TYPE[provider](connector.id.toString(), true)
      );
      await terminateAllWorkflowsForConnectorId(connector.id);
      return;
    }
    case "resume": {
      await throwOnError(
        RESUME_CONNECTOR_BY_TYPE[provider](connector.id.toString())
      );
      return;
    }
    case "full-resync": {
      let fromTs: number | null = null;
      if (args.fromTs) {
        fromTs = parseInt(args.fromTs as string, 10);
      }
      await throwOnError(
        SYNC_CONNECTOR_BY_TYPE[provider](connector.id.toString(), fromTs)
      );
      return;
    }

    case "restart": {
      await throwOnError(
        STOP_CONNECTOR_BY_TYPE[provider](connector.id.toString())
      );
      await throwOnError(
        RESUME_CONNECTOR_BY_TYPE[provider](connector.id.toString())
      );
      return;
    }
    default:
      throw new Error(`Unknown workspace command: ${command}`);
  }
};

const github = async (command: string, args: parseArgs.ParsedArgs) => {
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

      const connector = await Connector.findOne({
        where: {
          type: "github",
          workspaceId: args.wId,
          dataSourceName: args.dataSourceName,
        },
      });

      if (!connector) {
        throw new Error(
          `Could not find connector for workspace ${args.wId}, data source ${args.dataSourceName}`
        );
      }

      console.log("Resyncing repo " + args.owner + "/" + args.repo);

      const installationId = connector.connectionId;

      const octokit = await getOctokit(installationId);

      const { data } = await octokit.rest.repos.get({
        owner: args.owner,
        repo: args.repo,
      });

      const repoId = data.id;

      await launchGithubCodeSyncWorkflow(
        connector.id.toString(),
        args.owner,
        args.repo,
        repoId
      );

      return;
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

      const connector = await Connector.findOne({
        where: {
          type: "github",
          workspaceId: args.wId,
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
        connectorId: connector.id.toString(),
        syncCodeOnly: true,
      });

      return;
    }
    default:
      throw new Error("Unknown github command: " + command);
  }
};

const notion = async (command: string, args: parseArgs.ParsedArgs) => {
  switch (command) {
    case "restart-all": {
      const queue = new PQueue({ concurrency: 10 });
      const promises: Promise<void>[] = [];
      const connectors = await Connector.findAll({
        where: {
          type: "notion",
        },
      });
      for (const connector of connectors) {
        promises.push(
          queue.add(async () => {
            await throwOnError(
              STOP_CONNECTOR_BY_TYPE[connector.type](connector.id.toString())
            );
            await throwOnError(
              RESUME_CONNECTOR_BY_TYPE[connector.type](connector.id.toString())
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
          console.log(
            `completed ${completed} / ${connectors.length} (${failed} failed)`
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

      return;
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
      const pageId = args.pageId as string;

      const connector = await Connector.findOne({
        where: {
          type: "notion",
          workspaceId: args.wId,
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
      return;
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
      const databaseId = args.databaseId as string;

      const connector = await Connector.findOne({
        where: {
          type: "notion",
          workspaceId: args.wId,
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

      if (existingDatabase) {
        if (args.reason) {
          console.log(
            `Updating existing skipped database ${databaseId} with skip reason ${args.reason}`
          );
          await existingDatabase.update({
            skipReason: args.reason,
          });
          return;
        }
        console.log(
          `Database ${databaseId} is already skipped with reason ${existingDatabase.skipReason}`
        );
        return;
      }

      const skipReason = args.reason || "blacklisted";

      console.log(
        `Creating new skipped database ${databaseId} with reason ${skipReason}`
      );

      await NotionDatabase.create({
        notionDatabaseId: databaseId,
        skipReason,
        connectorId,
        lastSeenTs: new Date(),
      });

      return;
    }
    case "upsert-page": {
      if (!args.wId) {
        throw new Error("Missing --wId argument");
      }
      if (!args.pageId) {
        throw new Error("Missing --pageId argument");
      }
      const connector = await Connector.findOne({
        where: {
          type: "notion",
          workspaceId: args.wId,
          dataSourceName: "managed-notion",
        },
      });
      if (!connector) {
        throw new Error(
          `Could not find connector for workspace ${args.wId}, data source ${args.dataSourceName} and type notion`
        );
      }
      logger.info("Upserting page", { pageId: args.pageId });
      const connectorId = connector.id;
      const client = await getTemporalClient();
      await client.workflow.start(upsertPageWorkflow, {
        args: [
          {
            connectorId,
            pageId: args.pageId,
            runTimestamp: new Date().getTime(),
            isBatchSync: false,
            pageIndex: -1,
          },
        ],
        taskQueue: QUEUE_NAME,
        workflowId: `notion-test-upsert-page-${args.pageId}-connector-${connectorId}`,
        searchAttributes: {
          connectorId: [connectorId],
        },
        memo: {
          connectorId: connectorId,
        },
      });
      break;
    }

    default:
      throw new Error("Unknown notion command: " + command);
  }
};

const google_drive = async (command: string, args: parseArgs.ParsedArgs) => {
  switch (command) {
    case "garbage-collect-all": {
      const connectors = await Connector.findAll({
        where: {
          type: "google_drive",
        },
      });
      for (const connector of connectors) {
        await throwOnError(
          GARBAGE_COLLECT_BY_TYPE[connector.type](connector.id)
        );
      }
      return;
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
      console.log(`Checking gdrive file`);
      const connector = await Connector.findByPk(args.connectorId);
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
      console.log(`Status: ${res.status}`);
      console.log(`Type: ${typeof res.data}`);
      console.log(`Content:`);
      console.log(res.data);
      return;
    }
    case "restart-google-webhooks": {
      await throwOnError(launchGoogleDriveRenewWebhooksWorkflow());
      return;
    }
    case "start-incremental-sync": {
      if (!args.wId) {
        throw new Error("Missing --wId argument");
      }
      if (!args.dataSourceName) {
        throw new Error("Missing --dataSourceName argument");
      }

      const connector = await Connector.findOne({
        where: {
          workspaceId: args.wId,
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
        launchGoogleDriveIncrementalSyncWorkflow(connector.id.toString())
      );
      return;
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

      const connector = await Connector.findOne({
        where: {
          workspaceId: args.wId,
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

      return;
    }
    default:
      throw new Error("Unknown google command: " + command);
  }
};

const slack = async (command: string, args: parseArgs.ParsedArgs) => {
  switch (command) {
    case "enable-bot": {
      if (!args.wId) {
        throw new Error("Missing --wId argument");
      }
      const connector = await Connector.findOne({
        where: {
          workspaceId: args.wId,
          type: "slack",
        },
      });
      if (!connector) {
        throw new Error(`Could not find connector for workspace ${args.wId}`);
      }
      await throwOnError(toggleSlackbot(connector.id, true));
      break;
    }

    case "sync-channel": {
      const { channelId, wId } = args;

      if (!wId) {
        throw new Error("Missing --wId argument");
      }
      if (!channelId) {
        throw new Error("Missing --channelId argument");
      }

      const connector = await Connector.findOne({
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

      break;
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
      const connector = await Connector.findOne({
        where: {
          workspaceId: args.wId,
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

      break;
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
          const answer: string = await askQuestion(
            `Do you want to delete Nango connection ${connection.connection_id} and auth token for team ${slackTeamId}? (y/N) `
          );
          if (answer.toLowerCase() !== "y") {
            continue;
          }
          console.log("Uninstalling Slack and cleaning connection id...");
          await uninstallSlack(connection.connection_id);
        }
      }
      break;
    }

    case "whitelist-domains": {
      const { wId, whitelistedDomains } = args;
      if (!wId) {
        throw new Error("Missing --wId argument");
      }
      if (!whitelistedDomains) {
        throw new Error("Missing --whitelistedDomains argument");
      }

      const connector = await Connector.findOne({
        where: {
          workspaceId: args.wId,
          type: "slack",
        },
      });
      if (!connector) {
        throw new Error(`Could not find connector for workspace ${args.wId}`);
      }

      const whitelistedDomainsArray = whitelistedDomains.split(",");
      // TODO(2024-01-10 flav) Add domain validation.
      console.log(
        `Whitelisting following domains for slack:\n- ${whitelistedDomainsArray.join(
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

      break;
    }

    default:
      throw new Error("Unknown slack command: " + command);
  }
};

const batch = async (command: string, args: parseArgs.ParsedArgs) => {
  switch (command) {
    case "full-resync": {
      if (!args.provider) {
        throw new Error("Missing --provider argument");
      }
      let fromTs: number | null = null;
      if (args.fromTs) {
        fromTs = parseInt(args.fromTs as string, 10);
      }

      const connectors = await Connector.findAll({
        where: {
          type: args.provider,
        },
      });

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
        console.log("Cancelled");
        return;
      }

      for (const connector of connectors) {
        await throwOnError(
          SYNC_CONNECTOR_BY_TYPE[connector.type](
            connector.id.toString(),
            fromTs
          )
        );
        console.log(
          `Triggered for connector id:${connector.id} - ${connector.type} - workspace:${connector.workspaceId} - dataSource:${connector.dataSourceName} - fromTs:${fromTs}`
        );
      }
      return;
    }
    default:
      throw new Error("Unknown batch command: " + command);
  }
};

const main = async () => {
  const argv = parseArgs(process.argv.slice(2));

  if (argv._.length < 2) {
    throw new Error(
      "Expects object type and command as first two arguments, eg: `cli connectors stop ...`"
    );
  }

  const [objectType, command] = argv._;

  if (!command) {
    throw new Error(
      "Expects object type and command as first two arguments, eg: `cli connectors stop ...`"
    );
  }

  switch (objectType) {
    case "connectors":
      await connectors(command, argv);
      return;
    case "batch":
      await batch(command, argv);
      return;
    case "notion":
      await notion(command, argv);
      return;
    case "github":
      await github(command, argv);
      return;
    case "google_drive":
      await google_drive(command, argv);
      return;
    case "slack":
      await slack(command, argv);
      return;
    default:
      throw new Error(`Unknown object type: ${objectType}`);
  }
};

main()
  .then(() => {
    console.error("\x1b[32m%s\x1b[0m", `Done`);
    process.exit(0);
  })
  .catch((err) => {
    console.error("\x1b[31m%s\x1b[0m", `Error: ${err.message}`);
    console.log(err);
    process.exit(1);
  });

async function throwOnError<T>(p: Promise<Result<T, Error>>) {
  const res = await p;
  if (res.isErr()) {
    throw res.error;
  }
  return res;
}
