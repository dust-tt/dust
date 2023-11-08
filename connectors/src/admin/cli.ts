import parseArgs from "minimist";
import PQueue from "p-queue";

import {
  DELETE_CONNECTOR_BY_TYPE,
  RESUME_CONNECTOR_BY_TYPE,
  STOP_CONNECTOR_BY_TYPE,
  SYNC_CONNECTOR_BY_TYPE,
} from "@connectors/connectors";
import { getDocumentId } from "@connectors/connectors/google_drive/temporal/activities";
import {
  launchGoogleDriveIncrementalSyncWorkflow,
  launchGoogleDriveRenewWebhooksWorkflow,
} from "@connectors/connectors/google_drive/temporal/client";
import { toggleSlackbot } from "@connectors/connectors/slack/bot";
import { launchSlackSyncOneThreadWorkflow } from "@connectors/connectors/slack/temporal/client";
import {
  Connector,
  GoogleDriveFiles,
  NotionDatabase,
  NotionPage,
} from "@connectors/lib/models";
import { Result } from "@connectors/lib/result";

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
    }
  }
};

const google = async (command: string, args: parseArgs.ParsedArgs) => {
  switch (command) {
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
  }
};

const batch = async (command: string, args: parseArgs.ParsedArgs) => {
  switch (command) {
    case "full-resync": {
      if (!args.provider) {
        throw new Error("Missing --provider argument");
      }
      const connectors = await Connector.findAll({
        where: {
          type: args.provider,
        },
      });
      let fromTs: number | null = null;
      if (args.fromTs) {
        fromTs = parseInt(args.fromTs as string, 10);
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
    case "google":
      await google(command, argv);
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
