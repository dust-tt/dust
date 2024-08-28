import type { ModelId } from "@dust-tt/types";
import {
  ConfluenceClientError,
  isConfluenceNotFoundError,
} from "@dust-tt/types";
import { Op } from "sequelize";
import TurndownService from "turndown";

import {
  getActiveChildPageIds,
  pageHasReadRestrictions,
} from "@connectors/connectors/confluence/lib/confluence_api";
import type { ConfluencePageWithBodyType } from "@connectors/connectors/confluence/lib/confluence_client";
import { ConfluenceClient } from "@connectors/connectors/confluence/lib/confluence_client";
import { isConfluencePageSkipped } from "@connectors/connectors/confluence/lib/confluence_page";
import {
  getConfluencePageParentIds,
  getSpaceHierarchy,
} from "@connectors/connectors/confluence/lib/hierarchy";
import {
  makeConfluenceDocumentUrl,
  makeConfluencePageId,
} from "@connectors/connectors/confluence/temporal/utils";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { concurrentExecutor } from "@connectors/lib/async_utils";
import {
  deleteFromDataSource,
  renderDocumentTitleAndContent,
  renderMarkdownSection,
  updateDocumentParentsField,
  upsertToDatasource,
} from "@connectors/lib/data_sources";
import {
  ExternalOAuthTokenError,
  isNotFoundError,
} from "@connectors/lib/error";
import {
  ConfluenceConfiguration,
  ConfluencePage,
  ConfluenceSpace,
} from "@connectors/lib/models/confluence";
import { getOAuthConnectionAccessTokenWithThrow } from "@connectors/lib/oauth";
import { syncStarted, syncSucceeded } from "@connectors/lib/sync_status";
import mainLogger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { DataSourceConfig } from "@connectors/types/data_source_config";

const logger = mainLogger.child({
  provider: "confluence",
});

const turndownService = new TurndownService();

async function fetchConfluenceConnector(connectorId: ModelId) {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error("Connector not found.");
  }

  return connector;
}

async function getConfluenceAccessTokenWithThrow(connectionId: string) {
  const token = await getOAuthConnectionAccessTokenWithThrow({
    logger,
    provider: "confluence",
    connectionId,
  });

  return token.access_token;
}

async function getConfluenceClient(config: {
  cloudId?: string;
  connectorId: ModelId;
}): Promise<ConfluenceClient>;
async function getConfluenceClient(
  config: { cloudId?: string },
  connector: ConnectorResource
): Promise<ConfluenceClient>;
async function getConfluenceClient(
  config: {
    cloudId?: string;
    connectorId?: ModelId;
  },
  connector?: ConnectorResource
) {
  const { cloudId, connectorId } = config;

  // Ensure connector is fetched if not directly provided.
  const effectiveConnector =
    connector ??
    (connectorId ? await fetchConfluenceConnector(connectorId) : undefined);

  if (!effectiveConnector) {
    throw new Error("A valid connector or connectorId must be provided.");
  }

  const accessToken = await getConfluenceAccessTokenWithThrow(
    effectiveConnector.connectionId
  );

  return new ConfluenceClient(accessToken, { cloudId });
}

export async function getSpaceIdsToSyncActivity(connectorId: ModelId) {
  const spaces = await ConfluenceSpace.findAll({
    attributes: ["spaceId"],
    where: {
      connectorId: connectorId,
    },
  });

  return spaces.map((s) => s.spaceId);
}

export async function fetchConfluenceConfigurationActivity(
  connectorId: ModelId
) {
  const confluenceConfig = await ConfluenceConfiguration.findOne({
    where: {
      connectorId,
    },
  });
  if (!confluenceConfig) {
    throw new Error(
      `Confluence configuration not found (connectorId: ${connectorId})`
    );
  }

  return confluenceConfig;
}

export async function confluenceSaveStartSyncActivity(connectorId: ModelId) {
  const connector = await fetchConfluenceConnector(connectorId);

  const res = await syncStarted(connector.id);
  if (res.isErr()) {
    throw res.error;
  }
}

export async function confluenceSaveSuccessSyncActivity(connectorId: ModelId) {
  const connector = await fetchConfluenceConnector(connectorId);

  const res = await syncSucceeded(connector.id);
  if (res.isErr()) {
    throw res.error;
  }
}

export async function confluenceGetSpaceNameActivity({
  confluenceCloudId,
  connectorId,
  spaceId,
}: {
  confluenceCloudId: string;
  connectorId: ModelId;
  spaceId: string;
}) {
  const localLogger = logger.child({
    spaceId,
  });

  const client = await getConfluenceClient({
    cloudId: confluenceCloudId,
    connectorId,
  });

  try {
    const space = await client.getSpaceById(spaceId);

    return space.name;
  } catch (err) {
    if (isNotFoundError(err) || isConfluenceNotFoundError(err)) {
      localLogger.info("Deleting stale Confluence space.");

      return null;
    }

    if (err instanceof ConfluenceClientError && err.status === 403) {
      localLogger.info(
        "Confluence space is not accessible (status code 403). Deleting."
      );

      return null;
    }

    throw err;
  }
}

async function upsertConfluencePageInDb(
  connectorId: ModelId,
  page: ConfluencePageWithBodyType,
  visitedAtMs: number
) {
  await ConfluencePage.upsert({
    connectorId,
    pageId: page.id,
    spaceId: page.spaceId,
    parentId: page.parentId,
    title: page.title,
    externalUrl: page._links.tinyui,
    version: page.version.number,
    lastVisitedAt: new Date(visitedAtMs),
  });
}

interface ConfluenceCheckAndUpsertPageActivityInput {
  connectorId: ModelId;
  isBatchSync: boolean;
  pageId: string;
  spaceId: string;
  spaceName: string;
  forceUpsert: boolean;
  visitedAtMs: number;
}

export async function confluenceCheckAndUpsertPageActivity({
  connectorId,
  isBatchSync,
  pageId,
  spaceId,
  spaceName,
  forceUpsert,
  visitedAtMs,
}: ConfluenceCheckAndUpsertPageActivityInput) {
  const connector = await fetchConfluenceConnector(connectorId);
  const dataSourceConfig = dataSourceConfigFromConnector(connector);

  const loggerArgs = {
    connectorId,
    dataSourceName: dataSourceConfig.dataSourceName,
    pageId,
    spaceId,
    workspaceId: dataSourceConfig.workspaceId,
  };
  const localLogger = logger.child(loggerArgs);

  const isPageSkipped = await isConfluencePageSkipped(connectorId, pageId);
  if (isPageSkipped) {
    logger.info("Confluence page skipped.");
    return true;
  }

  const confluenceConfig =
    await fetchConfluenceConfigurationActivity(connectorId);

  const client = await getConfluenceClient(
    {
      cloudId: confluenceConfig?.cloudId,
    },
    connector
  );

  localLogger.info("Upserting Confluence page.");

  // There is a small delta between the page being listed and the page being imported.
  // If the page has been deleted in the meantime, we should ignore it.
  const page = await client.getPageById(pageId);
  if (!page) {
    localLogger.info("Confluence page not found.");
    // Return true so we still try to import the child pages.
    return true;
  }

  const hasReadRestrictions = await pageHasReadRestrictions(client, pageId);
  if (hasReadRestrictions) {
    localLogger.info("Skipping restricted Confluence page.");
    return false;
  }

  const pageAlreadyInDb = await ConfluencePage.findOne({
    attributes: ["version"],
    where: {
      connectorId,
      pageId,
    },
  });
  const isSameVersion =
    pageAlreadyInDb && pageAlreadyInDb.version === page.version.number;
  // Only index in DB if the page does not exist or we want to upsert.
  if (isSameVersion && !forceUpsert) {
    // Simply record that we visited the page.
    await upsertConfluencePageInDb(connectorId, page, visitedAtMs);
    return true;
  }

  const markdown = turndownService.turndown(page.body.storage.value);
  const pageCreatedAt = new Date(page.createdAt);
  const lastPageVersionCreatedAt = new Date(page.version.createdAt);

  if (markdown) {
    const renderedMarkdown = await renderMarkdownSection(
      dataSourceConfig,
      markdown
    );
    const renderedPage = await renderDocumentTitleAndContent({
      dataSourceConfig,
      title: `Page ${page.title} Space ${spaceName}`,
      createdAt: pageCreatedAt,
      updatedAt: lastPageVersionCreatedAt,
      content: renderedMarkdown,
    });

    const documentId = makeConfluencePageId(pageId);
    const documentUrl = makeConfluenceDocumentUrl({
      baseUrl: confluenceConfig.url,
      suffix: page._links.tinyui,
    });

    // We log the number of labels to help define the importance of labels in the future.
    if (page.labels.results.length > 0) {
      localLogger.info(
        { labelsCount: page.labels.results.length },
        "Confluence page has labels."
      );
    }

    // Limit to 10 custom tags.
    const customTags = page.labels.results
      .slice(0, 10)
      .map((l) => `labels:${l.id}`);

    const tags = [
      `createdAt:${pageCreatedAt.getTime()}`,
      `space:${spaceName}`,
      `title:${page.title}`,
      `updatedAt:${lastPageVersionCreatedAt.getTime()}`,
      `version:${page.version.number}`,
      ...customTags,
    ];

    await upsertToDatasource({
      dataSourceConfig,
      documentContent: renderedPage,
      documentId,
      documentUrl,
      loggerArgs,
      // Parent Ids will be computed after all page imports within the space have been completed.
      parents: [],
      tags,
      timestampMs: lastPageVersionCreatedAt.getTime(),
      upsertContext: {
        sync_type: isBatchSync ? "batch" : "incremental",
      },
      async: true,
    });
  }

  localLogger.info("Upserting Confluence page in DB.");

  await upsertConfluencePageInDb(connector.id, page, visitedAtMs);

  return true;
}

export async function confluenceGetActiveChildPageIdsActivity({
  connectorId,
  parentPageId,
  confluenceCloudId,
  pageCursor,
  spaceId,
}: {
  connectorId: ModelId;
  parentPageId: string;
  confluenceCloudId: string;
  pageCursor: string;
  spaceId: string;
}) {
  const localLogger = logger.child({
    connectorId,
    pageCursor,
    parentPageId,
    spaceId,
  });

  const client = await getConfluenceClient({
    cloudId: confluenceCloudId,
    connectorId,
  });

  localLogger.info("Fetching Confluence child pages in space.");

  return getActiveChildPageIds(client, parentPageId, pageCursor);
}

// Confluence has a single main landing page.
// However, users have the ability to create "orphaned" root pages that don't link from the main landing.
// It's important to ensure these pages are also imported.
export async function confluenceGetRootPageIdsActivity({
  connectorId,
  confluenceCloudId,
  spaceId,
}: {
  connectorId: ModelId;
  confluenceCloudId: string;
  spaceId: string;
}): Promise<string[]> {
  const localLogger = logger.child({
    connectorId,
    spaceId,
  });

  const client = await getConfluenceClient({
    cloudId: confluenceCloudId,
    connectorId,
  });

  localLogger.info("Fetching Confluence root page in space.");

  try {
    const { pages: rootPages } = await client.getPagesInSpace(spaceId, "root");
    return rootPages.map((rp) => rp.id);
  } catch (err) {
    if (err instanceof ConfluenceClientError && err.status === 404) {
      localLogger.info(
        "Confluence space pages API returned 404. Returning empty page set"
      );
      return [];
    }
    throw err;
  }
}

export async function confluenceGetTopLevelPageIdsActivity({
  confluenceCloudId,
  connectorId,
  pageCursor,
  rootPageId,
  spaceId,
}: {
  confluenceCloudId: string;
  connectorId: ModelId;
  pageCursor: string | null;
  rootPageId: string;
  spaceId: string;
}) {
  const localLogger = logger.child({
    connectorId,
    rootPageId,
    spaceId,
  });

  const client = await getConfluenceClient({
    cloudId: confluenceCloudId,
    connectorId,
  });

  localLogger.info("Fetching Confluence top-level page in space.");

  const { childPageIds, nextPageCursor } = await getActiveChildPageIds(
    client,
    rootPageId,
    pageCursor
  );

  localLogger.info(
    {
      topLevelPagesCount: childPageIds.length,
    },
    "Found Confluence top-level pages in space."
  );

  return { topLevelPageIds: childPageIds, nextPageCursor };
}

export async function confluenceUpdatePagesParentIdsActivity(
  connectorId: ModelId,
  spaceId: string,
  visitedAtMs: number
) {
  const connector = await fetchConfluenceConnector(connectorId);

  const pages = await ConfluencePage.findAll({
    attributes: ["id", "pageId", "parentId", "spaceId"],
    where: {
      connectorId,
      spaceId,
      lastVisitedAt: visitedAtMs,
      parentId: {
        [Op.not]: null,
      },
    },
  });

  logger.info(
    {
      connectorId,
      confluencePagesCount: pages.length,
    },
    "Start updating pages parent ids."
  );

  // Utilize an in-memory map to cache page hierarchies, thereby reducing database queries.
  const cachedHierarchy = await getSpaceHierarchy(connectorId, spaceId);

  await concurrentExecutor(
    pages,
    async (page) => {
      // Retrieve parents using the internal ID, which aligns with the permissions
      // view rendering and RAG requirements.
      const parentIds = await getConfluencePageParentIds(
        connectorId,
        page,
        cachedHierarchy
      );

      await updateDocumentParentsField({
        dataSourceConfig: {
          dataSourceName: connector.dataSourceName,
          workspaceId: connector.workspaceId,
          workspaceAPIKey: connector.workspaceAPIKey,
        },
        documentId: makeConfluencePageId(page.pageId),
        parents: parentIds,
      });
    },
    { concurrency: 10 }
  );

  logger.info({ connectorId }, "Done updating pages parent ids.");
}

export async function confluenceRemoveUnvisitedPagesActivity({
  connectorId,
  lastVisitedAt,
  spaceId,
}: {
  connectorId: ModelId;
  lastVisitedAt: number;
  spaceId: string;
}) {
  const connector = await fetchConfluenceConnector(connectorId);

  const unvisitedPages = await ConfluencePage.findAll({
    attributes: ["pageId"],
    where: {
      connectorId,
      spaceId,
      lastVisitedAt: {
        [Op.ne]: new Date(lastVisitedAt),
      },
    },
  });

  const dataSourceConfig = dataSourceConfigFromConnector(connector);

  for (const page of unvisitedPages) {
    // TODO(2024-01-22 flav) Add an extra check to ensure that the page does not exist anymore in Confluence.
    await deletePage(connectorId, page.pageId, dataSourceConfig);
  }
}

async function deletePage(
  connectorId: ModelId,
  pageId: string,
  dataSourceConfig: DataSourceConfig
) {
  const loggerArgs = {
    connectorId,
    pageId,
  };

  const localLogger = logger.child(loggerArgs);

  const documentId = makeConfluencePageId(pageId);
  localLogger.info(
    { documentId },
    "Deleting Confluence page from Dust data source."
  );

  await deleteFromDataSource(dataSourceConfig, documentId, {
    connectorId,
    pageId,
  });

  localLogger.info("Deleting Confluence page from database.");
  await ConfluencePage.destroy({
    where: {
      connectorId,
      pageId,
    },
  });
}

export async function confluenceRemoveSpaceActivity(
  connectorId: ModelId,
  spaceId: string
) {
  const localLogger = logger.child({
    spaceId,
    connectorId,
  });

  const connector = await fetchConfluenceConnector(connectorId);

  const dataSourceConfig = dataSourceConfigFromConnector(connector);

  const allPages = await ConfluencePage.findAll({
    attributes: ["pageId"],
    where: {
      connectorId,
      spaceId,
    },
  });

  localLogger.info(
    {
      numberOfPages: allPages.length,
    },
    "Delete Confluence space"
  );

  for (const page of allPages) {
    await deletePage(connectorId, page.pageId, dataSourceConfig);
  }
}

export async function fetchConfluenceSpaceIdsForConnectorActivity({
  connectorId,
}: {
  connectorId: ModelId;
}) {
  const spacesForConnector = await ConfluenceSpace.findAll({
    attributes: ["spaceId"],
    where: {
      connectorId,
    },
  });

  return spacesForConnector.map((s) => s.spaceId);
}

// Personal Data Reporting logic.

interface ConfluenceUserAccountAndConnectorId {
  connectorId: ModelId;
  userAccountId: string;
}

export async function fetchConfluenceUserAccountAndConnectorIdsActivity(): Promise<
  ConfluenceUserAccountAndConnectorId[]
> {
  return ConfluenceConfiguration.findAll({
    attributes: ["connectorId", "userAccountId"],
  });
}

export async function confluenceGetReportPersonalActionActivity(
  params: ConfluenceUserAccountAndConnectorId
) {
  const { connectorId, userAccountId } = params;

  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    return false;
  }
  if (connector.isAuthTokenRevoked) {
    return false;
  }
  if (connector.isThirdPartyInternalError) {
    return false;
  }

  // We look for the oldest updated data.
  const oldestPageSync = await ConfluencePage.findOne({
    where: {
      connectorId,
    },
    order: [["lastVisitedAt", "ASC"]],
  });

  if (oldestPageSync) {
    try {
      const client = await getConfluenceClient({}, connector);

      const result = await client.reportAccount({
        accountId: userAccountId,
        updatedAt: oldestPageSync.lastVisitedAt,
      });

      if (result && result.status === "closed") {
        logger.info(
          { connectorId, userAccountId },
          "Confluence report accounts API, account closed."
        );
        return true;
      }
    } catch (err) {
      logger.error(
        { connectorId, userAccountId, err },
        "Error while reporting Confluence account."
      );

      // If token has been revoked, return false.
      if (err instanceof ExternalOAuthTokenError) {
        return false;
      }

      throw err;
    }
  }

  return false;
}
