import type {
  AdminSuccessResponseType,
  ModelId,
  NotionCheckUrlResponseType,
  NotionCommandType,
  NotionFindUrlResponseType,
  NotionMeResponseType,
  NotionSearchPagesResponseType,
  NotionUpsertResponseType,
} from "@dust-tt/types";
import { Client, isFullDatabase, isFullPage } from "@notionhq/client";
import { Op } from "sequelize";

import { getNotionAccessToken } from "@connectors/connectors/notion/temporal/activities";
import { stopNotionGarbageCollectorWorkflow } from "@connectors/connectors/notion/temporal/client";
import { QUEUE_NAME } from "@connectors/connectors/notion/temporal/config";
import {
  upsertDatabaseWorkflow,
  upsertPageWorkflow,
} from "@connectors/connectors/notion/temporal/workflows/admins";
import { getConnectorOrThrow } from "@connectors/lib/cli";
import { NotionDatabase, NotionPage } from "@connectors/lib/models/notion";
import { getTemporalClient } from "@connectors/lib/temporal";
import mainLogger from "@connectors/logger/logger";
import { default as topLogger } from "@connectors/logger/logger";
import { ConnectorModel } from "@connectors/resources/storage/models/connector_model";

import { getParsedDatabase, retrievePage } from "./notion_api";

const logger = mainLogger.child({ provider: "notion" });

async function listSkippedDatabaseIdsForConnectorId(connectorId: ModelId) {
  const skippedDatabases = await NotionDatabase.findAll({
    where: {
      connectorId: connectorId,
      skipReason: {
        [Op.not]: null,
      },
    },
  });

  return new Set(skippedDatabases.map((db) => db.notionDatabaseId));
}

export async function searchNotionPagesForQuery({
  connectorId,
  connectionId,
  query,
}: {
  connectorId: ModelId;
  connectionId: string;
  query: string;
}) {
  const notionAccessToken = await getNotionAccessToken(connectionId);

  const notionClient = new Client({
    auth: notionAccessToken,
  });

  const pages = await notionClient.search({
    query,
    page_size: 20,
  });

  const skippedDatabaseIds =
    await listSkippedDatabaseIdsForConnectorId(connectorId);

  return pages.results.map((p) => ({
    id: p.id,
    type: p.object,
    title: "title" in p ? p.title[0]?.plain_text : "<unknown>",
    isSkipped: p.object === "database" && skippedDatabaseIds.has(p.id),
    isFull: p.object === "database" ? isFullDatabase(p) : isFullPage(p),
  }));
}

function pageOrDbIdFromUrl(url: string) {
  // parse URL
  const u = new URL(url);
  const last = u.pathname.split("/").pop();
  if (!last) {
    throw new Error(`Unhandled URL (could not get "last"): ${url}`);
  }
  const id = last.split("-").pop();
  if (!id || id.length !== 32) {
    throw new Error(`Unhandled URL (could not get 32 char ID): ${url}`);
  }

  const pageOrDbId =
    id.slice(0, 8) +
    "-" +
    id.slice(8, 12) +
    "-" +
    id.slice(12, 16) +
    "-" +
    id.slice(16, 20) +
    "-" +
    id.slice(20);

  return pageOrDbId;
}

export async function findNotionUrl({
  connectorId,
  url,
}: {
  connectorId: ModelId;
  url: string;
}): Promise<NotionFindUrlResponseType> {
  const pageOrDbId = pageOrDbIdFromUrl(url);

  const page = await NotionPage.findOne({
    where: {
      notionPageId: pageOrDbId,
      connectorId,
    },
  });

  if (page) {
    logger.info({ pageOrDbId, url, page }, "Page found");
    page._model;
    return { page: page.dataValues, db: null };
  } else {
    logger.info({ pageOrDbId, url }, "Page not found");
  }

  const db = await NotionDatabase.findOne({
    where: {
      notionDatabaseId: pageOrDbId,
      connectorId,
    },
  });

  if (db) {
    logger.info({ pageOrDbId, url, db }, "Database found");
    return { page: null, db: db.dataValues };
  } else {
    logger.info({ pageOrDbId, url }, "Database not found");
  }

  return { page: null, db: null };
}

export async function checkNotionUrl({
  connectorId,
  connectionId,
  url,
}: {
  connectorId: ModelId;
  connectionId: string;
  url: string;
}) {
  const notionAccessToken = await getNotionAccessToken(connectionId);

  const pageOrDbId = pageOrDbIdFromUrl(url);

  const page = await retrievePage({
    accessToken: notionAccessToken,
    pageId: pageOrDbId,
    loggerArgs: { connectorId, connectionId },
  });

  if (page) {
    logger.info({ pageOrDbId, url, page }, "Page found");
    return { page, db: null };
  } else {
    logger.info({ pageOrDbId, url }, "Page not found");
  }

  const db = await getParsedDatabase(notionAccessToken, pageOrDbId, {
    connectorId,
    connectionId,
  });

  if (db) {
    logger.info({ pageOrDbId, url, db }, "Database found");
    return { page: null, db };
  } else {
    logger.info({ pageOrDbId, url }, "Database not found");
  }

  return { page: null, db: null };
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
      if (!args.dsId) {
        throw new Error("Missing --dsId argument");
      }
      if (!args.pageId) {
        throw new Error("Missing --pageId argument");
      }
      const pageId = parseNotionResourceId(args.pageId);

      const connector = await ConnectorModel.findOne({
        where: {
          type: "notion",
          workspaceId: `${args.wId}`,
          dataSourceId: args.dsId,
        },
      });
      if (!connector) {
        throw new Error(
          `Could not find connector for workspace ${args.wId}, data source ${args.dsId} and type notion`
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
      if (!args.dsId) {
        throw new Error("Missing --dsId argument");
      }
      if (!args.databaseId) {
        throw new Error("Missing --databaseId argument");
      }
      const databaseId = parseNotionResourceId(args.databaseId);

      const connector = await ConnectorModel.findOne({
        where: {
          type: "notion",
          workspaceId: `${args.wId}`,
          dataSourceId: args.dsId,
        },
      });

      if (!connector) {
        throw new Error(
          `Could not find connector for workspace ${args.wId}, data source ${args.dsId}, and type notion`
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
      if (!args.dsId) {
        throw new Error("Missing --dsId argument");
      }
      if (!args.pageId) {
        throw new Error("Missing --pageId argument");
      }
      const pageId = parseNotionResourceId(args.pageId);
      const connector = await ConnectorModel.findOne({
        where: {
          type: "notion",
          workspaceId: `${args.wId}`,
          dataSourceId: args.dsId,
        },
      });
      if (!connector) {
        throw new Error(
          `Could not find connector for workspace ${args.wId}, data source ${args.dsId} and type notion`
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
      if (!args.dsId) {
        throw new Error("Missing --dsId argument");
      }
      if (!args.databaseId) {
        throw new Error("Missing --databaseId argument");
      }
      const databaseId = parseNotionResourceId(args.databaseId);
      const connector = await ConnectorModel.findOne({
        where: {
          type: "notion",
          workspaceId: `${args.wId}`,
          dataSourceId: args.dsId,
        },
      });
      if (!connector) {
        throw new Error(
          `Could not find connector for workspace ${args.wId}, data source ${args.dsId} and type notion`
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
      const { query, wId, dsId } = args;

      if (!query) {
        throw new Error("Missing --query argument");
      }

      const connector = await getConnectorOrThrow({
        dataSourceId: dsId,
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
      const { url, wId, dsId } = args;

      if (!url) {
        throw new Error("Missing --url argument");
      }

      const connector = await getConnectorOrThrow({
        dataSourceId: dsId,
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
      const { url, wId, dsId } = args;

      if (!url) {
        throw new Error("Missing --url argument");
      }

      const connector = await getConnectorOrThrow({
        dataSourceId: dsId,
        workspaceId: wId,
      });

      const r = await findNotionUrl({
        connectorId: connector.id,
        url,
      });

      return r;
    }

    case "me": {
      const { wId, dsId } = args;

      const connector = await getConnectorOrThrow({
        dataSourceId: dsId,
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
