import { Client, isFullDataSource, isFullPage } from "@notionhq/client";
import { Op } from "sequelize";

import { getNotionAccessToken } from "@connectors/connectors/notion/lib/access_token";
import { updateAllParentsFields } from "@connectors/connectors/notion/lib/parents";
import { pageOrDbIdFromUrl } from "@connectors/connectors/notion/lib/utils";
import {
  clearParentsLastUpdatedAt,
  deleteDatabase,
  deletePage,
  updateParentsFields,
} from "@connectors/connectors/notion/temporal/activities";
import {
  launchUpdateOrphanedResourcesParentsWorkflow,
  stopNotionGarbageCollectorWorkflow,
} from "@connectors/connectors/notion/temporal/client";
import { QUEUE_NAME } from "@connectors/connectors/notion/temporal/config";
import {
  getUpsertDatabaseWorkflowId,
  getUpsertPageWorkflowId,
  upsertDatabaseWorkflow,
  upsertPageWorkflow,
} from "@connectors/connectors/notion/temporal/workflows/admins";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { NotionDatabase, NotionPage } from "@connectors/lib/models/notion";
import { getTemporalClient } from "@connectors/lib/temporal";
import mainLogger from "@connectors/logger/logger";
import { default as topLogger } from "@connectors/logger/logger";
import { ConnectorModel } from "@connectors/resources/storage/models/connector_model";
import type {
  AdminSuccessResponseType,
  NotionApiRequestResponseType,
  NotionCheckUrlResponseType,
  NotionCommandType,
  NotionDeleteUrlResponseType,
  NotionFindUrlResponseType,
  NotionMeResponseType,
  NotionSearchPagesResponseType,
  NotionUpsertResponseType,
} from "@connectors/types";
import type { ModelId } from "@connectors/types";

import { getParsedDatabase, retrievePage } from "./notion_api";

const logger = mainLogger.child({ provider: "notion" });

const getConnector = async (args: NotionCommandType["args"]) => {
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
      type: "notion",
      ...(args.dsId ? { dataSourceId: args.dsId } : {}),
      ...(args.connectorId ? { id: args.connectorId } : {}),
    },
  });

  if (!connector) {
    throw new Error("Could not find connector");
  }

  return connector;
};

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
  query,
}: {
  connectorId: ModelId;
  connectionId: string;
  query: string;
}) {
  const notionAccessToken = await getNotionAccessToken(connectorId);

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
    isSkipped: p.object === "data_source" && skippedDatabaseIds.has(p.id),
    isFull: p.object === "data_source" ? isFullDataSource(p) : isFullPage(p),
  }));
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
    logger.info({ pageOrDbId, url, page }, "findNotionUrl: Page found");
    page._model;
    return { page: page.dataValues, db: null };
  } else {
    logger.info({ pageOrDbId, url }, "findNotionUrl: Page not found");
  }

  const db = await NotionDatabase.findOne({
    where: {
      notionDatabaseId: pageOrDbId,
      connectorId,
    },
  });

  if (db) {
    logger.info({ pageOrDbId, url, db }, "findNotionUrl: Database found");
    return { page: null, db: db.dataValues };
  } else {
    logger.info({ pageOrDbId, url }, "findNotionUrl: Database not found");
  }

  return { page: null, db: null };
}

export async function deleteNotionUrl({
  connector,
  url,
}: {
  connector: ConnectorModel;
  url: string;
}) {
  const pageOrDbId = pageOrDbIdFromUrl(url);

  const dataSourceConfig = await dataSourceConfigFromConnector(connector);

  const page = await NotionPage.findOne({
    where: {
      notionPageId: pageOrDbId,
      connectorId: connector.id,
    },
  });
  if (page) {
    await deletePage({
      connectorId: connector.id,
      dataSourceConfig,
      pageId: page.notionPageId,
      logger,
    });
  }

  const db = await NotionDatabase.findOne({
    where: {
      notionDatabaseId: pageOrDbId,
      connectorId: connector.id,
    },
  });

  if (db) {
    await deleteDatabase({
      connectorId: connector.id,
      dataSourceConfig,
      databaseId: db.notionDatabaseId,
      logger,
    });
  }

  return { deletedPage: !!page, deletedDb: !!db };
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
  const notionAccessToken = await getNotionAccessToken(connectorId);

  const pageOrDbId = pageOrDbIdFromUrl(url);

  const page = await retrievePage({
    accessToken: notionAccessToken,
    pageId: pageOrDbId,
    loggerArgs: { connectorId, connectionId },
  });

  if (page) {
    logger.info({ pageOrDbId, url, page }, "checkNotionUrl: Page found");
    return { page, db: null };
  } else {
    logger.info({ pageOrDbId, url }, "checkNotionUrl: Page not found");
  }

  const db = await getParsedDatabase(notionAccessToken, pageOrDbId, {
    connectorId,
    connectionId,
  });

  if (db) {
    logger.info({ pageOrDbId, url, db }, "checkNotionUrl: Database found");
    return { page: null, db };
  } else {
    logger.info({ pageOrDbId, url }, "checkNotionUrl: Database not found");
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
  | NotionApiRequestResponseType
  | NotionUpsertResponseType
  | NotionSearchPagesResponseType
  | NotionCheckUrlResponseType
  | NotionDeleteUrlResponseType
  | NotionMeResponseType
> => {
  const logger = topLogger.child({ majorCommand: "notion", command, args });
  switch (command) {
    case "skip-page": {
      const connector = await getConnector(args);
      if (!args.pageId) {
        throw new Error("Missing --pageId argument");
      }
      const pageId = parseNotionResourceId(args.pageId);

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
      const connector = await getConnector(args);

      if (!args.databaseId) {
        throw new Error("Missing --databaseId argument");
      }
      const databaseId = parseNotionResourceId(args.databaseId);

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
      const connector = await getConnector(args);

      if (!args.pageId) {
        throw new Error("Missing --pageId argument");
      }
      const pageId = parseNotionResourceId(args.pageId);

      logger.info({ pageId }, "[Admin] Upserting page");
      const connectorId = connector.id;
      const client = await getTemporalClient();
      const wf = await client.workflow.start(upsertPageWorkflow, {
        args: [
          {
            connectorId,
            pageId,
            upsertParents: true,
          },
        ],
        taskQueue: QUEUE_NAME,
        workflowId: getUpsertPageWorkflowId(pageId, connectorId),
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
      const connector = await getConnector(args);
      if (!args.databaseId) {
        throw new Error("Missing --databaseId argument");
      }
      const databaseId = parseNotionResourceId(args.databaseId);
      logger.info({ databaseId }, "[Admin] Upserting database");
      const connectorId = connector.id;
      const client = await getTemporalClient();
      const wf = await client.workflow.start(upsertDatabaseWorkflow, {
        args: [
          {
            connectorId,
            databaseId,
            forceResync: !!args.forceResync,
            upsertParents: true,
          },
        ],
        taskQueue: QUEUE_NAME,
        workflowId: getUpsertDatabaseWorkflowId(databaseId, connectorId),
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

    // To use when we have many nodes in "syncing" state for a connector that have a
    // You can check with the following SQL query on core:
    // SELECT count(*) FROM data_sources_nodes dsn JOIN data_sources ds ON (dsn.data_source = ds.id) WHERE 'notion-syncing' = ANY(parents)
    // AND mime_type != 'application/vnd.dust.notion.syncing-folder' AND ds.data_source_id = 'XXX'
    // Clearing the parentsLastUpdatedAt field will force a resync of all parents at the end of the next sync
    case "clear-parents-last-updated-at": {
      const connector = await getConnector(args);
      await clearParentsLastUpdatedAt({ connectorId: connector.id });
      return { success: true };
    }

    // Update the parents of all orphaned resources of a notion connector.
    case "update-orphaned-resources-parents": {
      const connectors = await (async () => {
        if (args.all) {
          logger.info(
            "[Admin] Updating orphaned resources parents for all active notion connectors"
          );
          return ConnectorModel.findAll({
            where: {
              type: "notion",
              errorType: null,
              pausedAt: null,
            },
          });
        }
        logger.info(
          "[Admin] Updating orphaned resources parents for notion connector",
          { connectorId: args.connectorId }
        );
        const connector = await getConnector(args);
        return [connector];
      })();
      for (const connector of connectors) {
        await launchUpdateOrphanedResourcesParentsWorkflow(connector.id);
      }
      return { success: true };
    }

    case "update-core-parents": {
      const connector = await getConnector(args);

      // if no pageId or databaseId is provided, we update all parents fields for
      // all pages and databases for the connector
      if (args.all) {
        // Note from seb: I am not sure the "all" case is working as expected without clearing the parentsLastUpdatedAt field first
        // As updateParentsFields() only run on nodes moved or created after the last parentsLastUpdatedAt
        let cursors:
          | {
              pageCursor: string | null;
              databaseCursor: string | null;
            }
          | undefined;
        do {
          cursors = await updateParentsFields({
            connectorId: connector.id,
            cursors,
            runTimestamp: Date.now(),
          });
        } while (cursors?.pageCursor || cursors?.databaseCursor);
      } else {
        const pageId = args.pageId && parseNotionResourceId(args.pageId);
        const databaseId =
          args.databaseId && parseNotionResourceId(args.databaseId);

        if (!pageId && !databaseId && !args.all) {
          throw new Error("Missing --pageId or --databaseId or --all argument");
        }

        await updateAllParentsFields(
          connector.id,
          pageId ? [pageId] : [],
          databaseId ? [databaseId] : [],
          `${Date.now()}`,
          async () => {}
        );
      }
      return { success: true };
    }

    case "search-pages": {
      const connector = await getConnector(args);
      const { query } = args;

      if (!query) {
        throw new Error("Missing --query argument");
      }

      const pages = await searchNotionPagesForQuery({
        connectorId: connector.id,
        connectionId: connector.connectionId,
        query,
      });

      return { pages };
    }

    case "check-url": {
      const connector = await getConnector(args);
      const { url } = args;

      if (!url) {
        throw new Error("Missing --url argument");
      }

      const r = await checkNotionUrl({
        connectorId: connector.id,
        connectionId: connector.connectionId,
        url,
      });

      return r;
    }

    case "find-url": {
      const connector = await getConnector(args);
      const { url } = args;

      if (!url) {
        throw new Error("Missing --url argument");
      }

      const r = await findNotionUrl({
        connectorId: connector.id,
        url,
      });

      return r;
    }

    // WARNING: This is meant to be used on pages deleted from Notion but not
    // yet from Dust Since garbage collection can be long, we allow manually
    // deleting pages from Dust before it finishes It is not meant to be used on
    // pages that are still synced in Notion
    case "delete-url": {
      const connector = await getConnector(args);
      const { url } = args;

      if (!url) {
        throw new Error("Missing --url argument");
      }

      const r = await deleteNotionUrl({
        connector,
        url,
      });

      return r;
    }

    case "me": {
      const connector = await getConnector(args);

      const notionAccessToken = await getNotionAccessToken(connector.id);

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

    case "api-request": {
      const connector = await getConnector(args);
      const { url, method, body } = args;

      if (!url) {
        throw new Error("Missing --url argument");
      }
      if (!method || !["GET", "POST"].includes(method)) {
        throw new Error("Invalid --method argument (must be GET or POST)");
      }

      // Restrict POST to only the search endpoint, to prevent data modification
      if (method === "POST" && url !== "search") {
        throw new Error(
          "POST method is only allowed for the 'search' endpoint"
        );
      }

      logger.info(
        { url, method, connectorId: connector.id },
        "[Admin] Making Notion API request"
      );

      const notionAccessToken = await getNotionAccessToken(connector.id);
      const fullUrl = `https://api.notion.com/v1/${url}`;

      const response = await fetch(fullUrl, {
        method,
        headers: {
          Authorization: `Bearer ${notionAccessToken}`,
          "Notion-Version": "2022-06-28",
          "Content-Type": "application/json",
        },
        ...(method === "POST" && body ? { body } : {}),
      });

      const data = await response.json();

      logger.info(
        {
          url,
          method,
          status: response.status,
          connectorId: connector.id,
        },
        "[Admin] Notion API request completed"
      );

      return { status: response.status, data };
    }

    default:
      throw new Error("Unknown notion command: " + command);
  }
};
