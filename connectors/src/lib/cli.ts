import type { Result } from "@dust-tt/client";
import { assertNever } from "@dust-tt/client";
import { isLeft } from "fp-ts/lib/Either";
import fs from "fs";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import PQueue from "p-queue";
import readline from "readline";

import { getConnectorManager } from "@connectors/connectors";
import { confluence } from "@connectors/connectors/confluence/lib/cli";
import { github } from "@connectors/connectors/github/lib/cli";
import { gong } from "@connectors/connectors/gong/lib/cli";
import { google_drive } from "@connectors/connectors/google_drive/lib/cli";
import { intercom } from "@connectors/connectors/intercom/lib/cli";
import { microsoft } from "@connectors/connectors/microsoft/lib/cli";
import { notion } from "@connectors/connectors/notion/lib/cli";
import { salesforce } from "@connectors/connectors/salesforce/lib/cli";
import { slack } from "@connectors/connectors/slack/lib/cli";
import { snowflake } from "@connectors/connectors/snowflake/lib/cli";
import {
  launchCrawlWebsiteScheduler,
  updateCrawlerActions,
  updateCrawlerCrawlFrequency,
} from "@connectors/connectors/webcrawler/temporal/client";
import { zendesk } from "@connectors/connectors/zendesk/lib/cli";
import { getTemporalClient } from "@connectors/lib/temporal";
import { default as topLogger } from "@connectors/logger/logger";
import { ConnectorModel } from "@connectors/resources/storage/models/connector_model";
import type {
  AdminCommandType,
  AdminSuccessResponseType,
  BatchAllResponseType,
  BatchCommandType,
  ConnectorPermission,
  ConnectorsCommandType,
  TemporalCheckQueueResponseType,
  TemporalCommandType,
  TemporalUnprocessedWorkflowsResponseType,
  WebcrawlerCommandType,
} from "@connectors/types";
import { isConnectorError } from "@connectors/types";

// Schema for permissions file validation
const PermissionsFileSchema = t.record(
  t.string,
  t.union([
    t.literal("read"),
    t.literal("write"),
    t.literal("read_write"),
    t.literal("none"),
  ])
);

const { INTERACTIVE_CLI } = process.env;

export async function runCommand(adminCommand: AdminCommandType) {
  switch (adminCommand.majorCommand) {
    case "batch":
      return batch(adminCommand);
    case "confluence":
      return confluence(adminCommand);
    case "connectors":
      return connectors(adminCommand);
    case "github":
      return github(adminCommand);
    case "gong":
      return gong(adminCommand);
    case "google_drive":
      return google_drive(adminCommand);
    case "intercom":
      return intercom(adminCommand);
    case "microsoft":
      return microsoft(adminCommand);
    case "notion":
      return notion(adminCommand);
    case "slack":
      return slack(adminCommand);
    case "snowflake":
      return snowflake(adminCommand);
    case "temporal":
      return temporal(adminCommand);
    case "webcrawler":
      return webcrawler(adminCommand);
    case "zendesk":
      return zendesk(adminCommand);
    case "salesforce":
      return salesforce(adminCommand);
    default:
      assertNever(adminCommand);
  }
}

export async function getConnectorOrThrow({
  workspaceId,
  dataSourceId,
}: {
  workspaceId: string | undefined;
  dataSourceId: string | undefined;
}): Promise<ConnectorModel> {
  if (!workspaceId) {
    throw new Error("Missing workspace ID (wId)");
  }
  if (!dataSourceId) {
    throw new Error("Missing dataSource ID (dsId)");
  }
  const connector = await ConnectorModel.findOne({
    where: {
      workspaceId: workspaceId,
      dataSourceId: dataSourceId,
    },
  });
  if (!connector) {
    throw new Error(
      `No connector found for ${dataSourceId} workspace with ID ${workspaceId}`
    );
  }
  return connector;
}

export async function throwOnError<T>(p: Promise<Result<T, Error>>) {
  const res = await p;
  if (res.isErr()) {
    throw res.error;
  }
  return res;
}

export const connectors = async ({
  command,
  args,
}: ConnectorsCommandType): Promise<AdminSuccessResponseType> => {
  if (!args.wId) {
    throw new Error("Missing --wId argument");
  }
  if (!args.dsId && !args.connectorId) {
    throw new Error("Missing --dsId or --connectorId argument");
  }

  // We retrieve by data source name as we can have multiple data source with the same provider for
  // a given workspace.
  const connector = await ConnectorModel.findOne({
    where: {
      workspaceId: `${args.wId}`,
      ...(args.dsId ? { dataSourceId: args.dsId } : {}),
      ...(args.connectorId ? { id: args.connectorId } : {}),
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
    case "pause": {
      await throwOnError(manager.pauseAndStop());
      return { success: true };
    }
    case "unpause": {
      await throwOnError(manager.unpauseAndResume());
      return { success: true };
    }
    case "resume": {
      if (connector.pausedAt) {
        throw new Error("Cannot resume a paused connector");
      }

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

    case "clear-error": {
      connector.errorType = null;
      await connector.save();
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
      if (connector.pausedAt) {
        throw new Error("Cannot restart a paused connector");
      }

      await throwOnError(manager.stop());
      await throwOnError(manager.resume());
      return { success: true };
    }

    case "garbage-collect": {
      await throwOnError(manager.garbageCollect());
      return { success: true };
    }

    case "set-permission": {
      const { permissionKey, permissionValue, permissionsFile } = args;

      let permissions: Record<string, ConnectorPermission> = {};

      if (permissionsFile) {
        // Read permissions from JSON file
        if (!fs.existsSync(permissionsFile)) {
          throw new Error(`Permissions file not found: ${permissionsFile}`);
        }

        try {
          const fileContent = fs.readFileSync(permissionsFile, "utf8");
          const parsedPermissions = JSON.parse(fileContent);

          // Validate using io-ts schema
          const validation = PermissionsFileSchema.decode(parsedPermissions);

          if (isLeft(validation)) {
            const pathError = reporter.formatValidationErrors(validation.left);
            throw new Error(`Invalid permissions file format: ${pathError}`);
          }

          permissions = validation.right;
        } catch (error) {
          if (error instanceof SyntaxError) {
            throw new Error(
              `Invalid JSON in permissions file: ${error.message}`
            );
          }
          throw error;
        }
      } else {
        // Use existing permissionKey/permissionValue arguments
        if (!permissionKey) {
          throw new Error(
            "Missing --permissionKey argument (or use --permissionsFile)"
          );
        }
        if (!permissionValue) {
          throw new Error(
            "Missing --permissionValue argument (or use --permissionsFile)"
          );
        }
        if (
          !["read", "write", "read_write", "none"].includes(permissionValue)
        ) {
          throw new Error("Invalid permissionValue argument");
        }

        permissions = {
          [permissionKey as string]: permissionValue as ConnectorPermission,
        };
      }

      const setPermissionsRes = await manager.setPermissions({
        permissions,
      });

      if (setPermissionsRes.isErr()) {
        throw new Error(`Cannot set permissions: ${setPermissionsRes.error}`);
      }

      return { success: true };
    }

    default:
      throw new Error(`Unknown workspace command: ${command}`);
  }
};

export const batch = async ({
  command,
  args,
}: BatchCommandType): Promise<
  AdminSuccessResponseType | BatchAllResponseType
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
          `[Admin] Triggered for connector id:${connector.id} - ${connector.type} - workspace:${connector.workspaceId} - dataSource:${connector.dataSourceId} - fromTs:${fromTs}`
        );
      }
      return { success: true };
    }

    case "restart-all":
    case "resume-all":
    case "stop-all": {
      if (!args.provider) {
        throw new Error("Missing --provider argument");
      }

      const PROVIDERS_ALLOWING_RESTART = [
        "notion",
        "intercom",
        "confluence",
        "github",
        "microsoft",
        "google_drive",
        "snowflake",
        "zendesk",
        "bigquery",
      ];
      if (!PROVIDERS_ALLOWING_RESTART.includes(args.provider)) {
        throw new Error(
          `Can't ${command} for ${
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
            if (["restart-all", "stop-all"].includes(command)) {
              await throwOnError(
                getConnectorManager({
                  connectorId: connector.id,
                  connectorProvider: connector.type,
                }).stop()
              );
            }
            if (["restart-all", "resume-all"].includes(command)) {
              await throwOnError(
                getConnectorManager({
                  connectorId: connector.id,
                  connectorProvider: connector.type,
                }).resume()
              );
            }
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
  args,
}: WebcrawlerCommandType): Promise<AdminSuccessResponseType> => {
  switch (command) {
    case "start-scheduler": {
      await throwOnError(launchCrawlWebsiteScheduler());
      return { success: true };
    }
    case "update-frequency": {
      if (!args.connectorId) {
        throw new Error("Missing --connectorId argument");
      }

      if (!args.crawlFrequency) {
        throw new Error("Missing --crawlFrequency argument");
      }

      await throwOnError(
        updateCrawlerCrawlFrequency(args.connectorId, args.crawlFrequency)
      );

      return { success: true };
    }
    case "set-actions": {
      if (!args.connectorId) {
        throw new Error("Missing --connectorId argument");
      }

      if (args.actions == null) {
        throw new Error("Missing --actions argument");
      }

      await throwOnError(updateCrawlerActions(args.connectorId, args.actions));

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
