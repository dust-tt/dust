import type { ModelId } from "@dust-tt/types";
import {
  ConfluenceClientError,
  isConfluenceNotFoundError,
  MIME_TYPES,
} from "@dust-tt/types";
import { Op } from "sequelize";
import TurndownService from "turndown";

import type { ConfluencePageRef } from "@connectors/connectors/confluence/lib/confluence_api";
import {
  bulkFetchConfluencePageRefs,
  getActiveChildPageRefs,
  pageHasReadRestrictions,
} from "@connectors/connectors/confluence/lib/confluence_api";
import type { ConfluencePageWithBodyType } from "@connectors/connectors/confluence/lib/confluence_client";
import { ConfluenceClient } from "@connectors/connectors/confluence/lib/confluence_client";
import {
  getConfluencePageParentIds,
  getSpaceHierarchy,
} from "@connectors/connectors/confluence/lib/hierarchy";
import {
  makePageInternalId,
  makeSpaceInternalId,
} from "@connectors/connectors/confluence/lib/internal_ids";
import { makeConfluenceDocumentUrl } from "@connectors/connectors/confluence/temporal/workflow_ids";
import { filterCustomTags } from "@connectors/connectors/shared/tags";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { concurrentExecutor } from "@connectors/lib/async_utils";
import type { UpsertDataSourceDocumentParams } from "@connectors/lib/data_sources";
import {
  deleteDataSourceDocument,
  deleteDataSourceFolder,
  renderDocumentTitleAndContent,
  renderMarkdownSection,
  updateDataSourceDocumentParents,
  upsertDataSourceDocument,
  upsertDataSourceFolder,
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

/**
 * This type represents the ID that should be passed as parentId to a content node to hide it from the UI.
 * This behavior is typically used to hide content nodes whose position in the ContentNodeTree cannot be resolved at time of upsertion.
 */
export const HiddenContentNodeParentId = "__hidden_syncing_content__";

const UPSERT_CONCURRENT_LIMIT = 10;

export interface SpaceBlob {
  id: string;
  key: string;
  name: string;
}

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

export async function getConfluenceClient(config: {
  cloudId?: string;
  connectorId: ModelId;
}): Promise<ConfluenceClient>;
export async function getConfluenceClient(
  config: { cloudId?: string },
  connector: ConnectorResource
): Promise<ConfluenceClient>;
export async function getConfluenceClient(
  config: {
    cloudId?: string;
    connectorId?: ModelId;
  },
  connector?: ConnectorResource
) {
  const { cloudId, connectorId } = config;

  // Ensure the connector is fetched if not directly provided.
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

export async function confluenceGetSpaceBlobActivity({
  confluenceCloudId,
  connectorId,
  spaceId,
}: {
  confluenceCloudId: string;
  connectorId: ModelId;
  spaceId: string;
}): Promise<SpaceBlob | null> {
  const localLogger = logger.child({
    spaceId,
  });

  const client = await getConfluenceClient({
    cloudId: confluenceCloudId,
    connectorId,
  });

  try {
    const space = await client.getSpaceById(spaceId);

    return {
      id: space.id,
      key: space.key,
      name: space.name,
    };
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

/**
 * Upserts the page in data_sources_folders (core).
 */
export async function confluenceUpsertSpaceFolderActivity({
  connectorId,
  space,
  baseUrl,
}: {
  connectorId: ModelId;
  space: SpaceBlob;
  baseUrl: string;
}) {
  const connector = await fetchConfluenceConnector(connectorId);

  const { id: spaceId, name: spaceName } = space;

  const spaceInDb = await ConfluenceSpace.findOne({
    where: { connectorId, spaceId },
  });

  await upsertDataSourceFolder({
    dataSourceConfig: dataSourceConfigFromConnector(connector),
    folderId: makeSpaceInternalId(spaceId),
    parents: [makeSpaceInternalId(spaceId)],
    parentId: null,
    title: spaceName,
    mimeType: MIME_TYPES.CONFLUENCE.SPACE,
    sourceUrl: spaceInDb?.urlSuffix && `${baseUrl}/wiki${spaceInDb.urlSuffix}`,
  });

  // Update the space name in db.
  if (spaceInDb && spaceInDb.name != spaceName) {
    await spaceInDb.update({ name: spaceName });
  }
}

export async function markPageHasVisited({
  connectorId,
  pageId,
  spaceId,
  visitedAtMs,
}: {
  connectorId: ModelId;
  pageId: string;
  spaceId: string;
  visitedAtMs: number;
}) {
  await ConfluencePage.update(
    {
      lastVisitedAt: new Date(visitedAtMs),
    },
    {
      where: {
        connectorId,
        pageId,
        spaceId,
      },
    }
  );
}

interface ConfluenceUpsertPageInput {
  page: NonNullable<Awaited<ReturnType<ConfluenceClient["getPageById"]>>>;
  spaceName: string;
  parents: [string, string, ...string[]];
  confluenceConfig: ConfluenceConfiguration;
  syncType?: UpsertDataSourceDocumentParams["upsertContext"]["sync_type"];
  dataSourceConfig: DataSourceConfig;
  loggerArgs: Record<string, string | number>;
}

async function upsertConfluencePageToDataSource({
  page,
  spaceName,
  parents,
  confluenceConfig,
  syncType = "batch",
  dataSourceConfig,
  loggerArgs,
}: ConfluenceUpsertPageInput) {
  const localLogger = logger.child(loggerArgs);

  const markdown = turndownService.turndown(page.body.storage.value);
  const pageCreatedAt = new Date(page.createdAt);
  const lastPageVersionCreatedAt = new Date(page.version.createdAt);

  if (!markdown) {
    logger.warn({ ...loggerArgs }, "Upserting page with empty content.");
  }

  const renderedMarkdown = await renderMarkdownSection(
    dataSourceConfig,
    markdown
  );

  // Log labels info
  if (page.labels.results.length > 0) {
    localLogger.info(
      { labelsCount: page.labels.results.length },
      "Confluence page has labels."
    );
  }

  // Use label names for tags instead of IDs
  const customTags = page.labels.results.map((l) => l.name);

  const tags = [
    `createdAt:${pageCreatedAt.getTime()}`,
    `space:${spaceName}`,
    `title:${page.title}`,
    `updatedAt:${lastPageVersionCreatedAt.getTime()}`,
    `version:${page.version.number}`,
    ...filterCustomTags(customTags, localLogger),
  ];

  const renderedPage = await renderDocumentTitleAndContent({
    dataSourceConfig,
    title: `Page ${page.title}`,
    createdAt: pageCreatedAt,
    updatedAt: lastPageVersionCreatedAt,
    content: renderedMarkdown,
    additionalPrefixes: {
      labels: page.labels.results.map((l) => l.name).join(", ") || "none",
    },
  });

  const documentId = makePageInternalId(page.id);
  const documentUrl = makeConfluenceDocumentUrl({
    baseUrl: confluenceConfig.url,
    suffix: page._links.tinyui,
  });

  await upsertDataSourceDocument({
    dataSourceConfig,
    documentContent: renderedPage,
    documentId,
    documentUrl,
    loggerArgs,
    parents,
    parentId: parents[1],
    tags,
    timestampMs: lastPageVersionCreatedAt.getTime(),
    upsertContext: { sync_type: syncType },
    title: page.title,
    mimeType: MIME_TYPES.CONFLUENCE.PAGE,
    async: true,
  });
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

interface ConfluenceCheckAndUpsertSinglePageActivityInput {
  connectorId: ModelId;
  isBatchSync: boolean;
  pageRef: ConfluencePageRef;
  space: SpaceBlob;
  forceUpsert: boolean;
  visitedAtMs: number;
}

/**
 * Upsert a Confluence page without its full parents.
 * Operates greedily by stopping if the page is restricted or if there is a version match
 * (unless the page was moved, in this case, we have to upsert because the parents have changed).
 */
export async function confluenceCheckAndUpsertSinglePageActivity({
  connectorId,
  isBatchSync,
  pageRef,
  space,
  forceUpsert,
  visitedAtMs,
}: ConfluenceCheckAndUpsertSinglePageActivityInput) {
  const connector = await fetchConfluenceConnector(connectorId);
  const dataSourceConfig = dataSourceConfigFromConnector(connector);

  const { id: spaceId, name: spaceName } = space;
  const { id: pageId } = pageRef;

  const loggerArgs = {
    connectorId,
    dataSourceId: dataSourceConfig.dataSourceId,
    pageId,
    spaceId,
    workspaceId: dataSourceConfig.workspaceId,
  };
  const localLogger = logger.child(loggerArgs);

  const pageAlreadyInDb = await ConfluencePage.findOne({
    attributes: ["parentId", "skipReason", "version"],
    where: {
      connectorId,
      pageId,
    },
  });

  const isPageSkipped = Boolean(
    pageAlreadyInDb && pageAlreadyInDb.skipReason !== null
  );
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

  // Check restrictions.
  const { hasReadRestrictions } = pageRef;
  if (hasReadRestrictions) {
    localLogger.info("Skipping restricted Confluence page.");
    return false;
  }

  // Check the version.
  const isSameVersion =
    pageAlreadyInDb && pageAlreadyInDb.version === pageRef.version;

  // Check whether the page was moved (the version is not bumped when a page is moved).
  const pageWasMoved =
    pageAlreadyInDb && pageAlreadyInDb.parentId !== pageRef.parentId;

  // Only index in DB if the page does not exist, has been moved, or we want to upsert.
  if (isSameVersion && !forceUpsert && !pageWasMoved) {
    // Simply record that we visited the page.
    await markPageHasVisited({
      connectorId,
      pageId,
      spaceId,
      visitedAtMs,
    });

    return true;
  }

  // There is a small delta between the page being listed and the page being imported.
  // If the page has been deleted in the meantime, we should ignore it.
  const page = await client.getPageById(pageId);
  if (!page) {
    localLogger.info("Confluence page not found.");
    // Return false to skip the child pages.
    return false;
  }

  let parents: [string, string, ...string[]];
  if (page.parentId) {
    // Exact parent Ids will be computed after all page imports within the space have been completed.
    parents = [
      makePageInternalId(page.id),
      makePageInternalId(page.parentId),
      HiddenContentNodeParentId,
    ];
  } else {
    // In this case we already have the exact parents: the page itself and the space.
    parents = [makePageInternalId(page.id), makeSpaceInternalId(spaceId)];
  }

  localLogger.info("Upserting Confluence page.");
  await upsertConfluencePageToDataSource({
    page,
    spaceName,
    parents,
    confluenceConfig,
    syncType: isBatchSync ? "batch" : "incremental",
    dataSourceConfig,
    loggerArgs,
  });

  localLogger.info("Upserting Confluence page in DB.");
  await upsertConfluencePageInDb(connector.id, page, visitedAtMs);

  return true;
}

type ConfluenceUpsertLeafPagesActivityInput = Omit<
  ConfluenceCheckAndUpsertSinglePageActivityInput,
  "pageRef"
> & {
  pageRefs: ConfluencePageRef[];
};

export async function confluenceUpsertLeafPagesActivity({
  pageRefs,
  ...params
}: ConfluenceUpsertLeafPagesActivityInput) {
  await concurrentExecutor(
    pageRefs,
    async (pageRef) => {
      await confluenceCheckAndUpsertSinglePageActivity({
        ...params,
        pageRef,
      });
    },
    {
      concurrency: UPSERT_CONCURRENT_LIMIT,
    }
  );
}

/**
 * Upsert a Confluence page with its full parent hierarchy.
 * Expensive operation, it should be reserved to admin actions on a limited set of pages.
 */
export async function confluenceUpsertPageWithFullParentsActivity({
  connectorId,
  pageId,
  cachedSpaceNames = {},
  cachedSpaceHierarchies = {},
}: {
  connectorId: ModelId;
  pageId: string;
  cachedSpaceNames?: Record<string, string>;
  cachedSpaceHierarchies?: Record<
    string,
    Awaited<ReturnType<typeof getSpaceHierarchy>>
  >;
}): Promise<boolean> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error("Connector not found.");
  }
  const dataSourceConfig = dataSourceConfigFromConnector(connector);
  const confluenceConfig =
    await fetchConfluenceConfigurationActivity(connectorId);

  const loggerArgs = {
    connectorId,
    dataSourceId: dataSourceConfig.dataSourceId,
    pageId,
    workspaceId: dataSourceConfig.workspaceId,
  };
  const localLogger = logger.child(loggerArgs);
  const visitedAtMs = new Date().getTime();

  const pageInDb = await ConfluencePage.findOne({
    attributes: ["parentId", "skipReason"],
    where: { connectorId, pageId },
  });
  if (pageInDb && pageInDb.skipReason !== null) {
    localLogger.info("Confluence page skipped.");
    return false;
  }

  const client = await getConfluenceClient(
    { cloudId: confluenceConfig?.cloudId },
    connector
  );

  const hasReadRestrictions = await pageHasReadRestrictions(client, pageId);
  if (hasReadRestrictions) {
    localLogger.info("Skipping restricted Confluence page.");
    return false;
  }

  const page = await client.getPageById(pageId);
  if (!page) {
    localLogger.info("Confluence page not found.");
    return false;
  }

  let spaceName = cachedSpaceNames[page.spaceId];
  if (!spaceName) {
    const space = await client.getSpaceById(page.spaceId);
    if (!space) {
      localLogger.info("Confluence space not found.");
      return false;
    }
    cachedSpaceNames[page.spaceId] = space.name;
    spaceName = space.name;
  }

  if (!cachedSpaceHierarchies[page.spaceId]) {
    cachedSpaceHierarchies[page.spaceId] = await getSpaceHierarchy(
      connectorId,
      page.spaceId
    );
  }

  const parents = await getConfluencePageParentIds(
    connectorId,
    { pageId: page.id, parentId: page.parentId, spaceId: page.spaceId },
    cachedSpaceHierarchies[page.spaceId]
  );

  localLogger.info("Upserting Confluence page.");
  await upsertConfluencePageToDataSource({
    page,
    spaceName,
    parents,
    confluenceConfig,
    dataSourceConfig,
    loggerArgs,
  });

  localLogger.info("Upserting Confluence page in DB.");
  await upsertConfluencePageInDb(connector.id, page, visitedAtMs);

  return true;
}

export async function confluenceGetActiveChildPageRefsActivity({
  connectorId,
  parentPageId,
  confluenceCloudId,
  pageCursor,
  space,
}: {
  connectorId: ModelId;
  parentPageId: string;
  confluenceCloudId: string;
  pageCursor: string;
  space: SpaceBlob;
}) {
  const { id: spaceId, key: spaceKey } = space;

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

  return getActiveChildPageRefs(client, {
    pageCursor,
    parentPageId,
    spaceId,
    spaceKey,
  });
}

// Confluence has a single main landing page.
// However, users have the ability to create "orphaned" root pages that don't link from the main landing.
// It's important to ensure these pages are also imported.
async function getRootPageRefsActivity({
  connectorId,
  confluenceCloudId,
  space,
}: {
  connectorId: ModelId;
  confluenceCloudId: string;
  space: SpaceBlob;
}) {
  const { id: spaceId, key: spaceKey } = space;

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

    return await bulkFetchConfluencePageRefs(client, {
      limit: rootPages.length,
      pageIds: rootPages.map((rp) => rp.id),
      spaceKey,
    });
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

// Activity to handle fetching, upserting, and filtering root pages.
export async function fetchAndUpsertRootPagesActivity(params: {
  confluenceCloudId: string;
  connectorId: ModelId;
  forceUpsert: boolean;
  isBatchSync: boolean;
  space: SpaceBlob;
  visitedAtMs: number;
}): Promise<string[]> {
  const { connectorId, confluenceCloudId, space } = params;

  // Get the root level pages for the space.
  const rootPageRefs = await getRootPageRefsActivity({
    connectorId,
    confluenceCloudId,
    space,
  });
  if (rootPageRefs.length === 0) {
    return [];
  }

  const allowedRootPageIds: string[] = [];

  // Check and upsert pages, filter allowed ones.
  for (const rootPageRef of rootPageRefs) {
    const successfullyUpsert = await confluenceCheckAndUpsertSinglePageActivity(
      {
        ...params,
        pageRef: rootPageRef,
      }
    );

    // If the page fails the upsert operation, it indicates the page is restricted.
    // Such pages should not be added to the list of allowed pages.
    if (successfullyUpsert) {
      allowedRootPageIds.push(rootPageRef.id);
    }
  }

  return allowedRootPageIds;
}

export async function confluenceGetTopLevelPageIdsActivity({
  confluenceCloudId,
  connectorId,
  pageCursor,
  rootPageId,
  space,
}: {
  confluenceCloudId: string;
  connectorId: ModelId;
  pageCursor: string | null;
  rootPageId: string;
  space: SpaceBlob;
}) {
  const { id: spaceId, key: spaceKey } = space;

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

  const { childPageRefs, nextPageCursor } = await getActiveChildPageRefs(
    client,
    {
      pageCursor,
      parentPageId: rootPageId,
      spaceId,
      spaceKey,
    }
  );

  localLogger.info(
    {
      topLevelPagesCount: childPageRefs.length,
    },
    "Found Confluence top-level pages in space."
  );

  return {
    topLevelPageRefs: childPageRefs,
    nextPageCursor,
  };
}

export async function confluenceUpdatePagesParentIdsActivity(
  connectorId: ModelId,
  spaceId: string,
  visitedAtMs: number | null
) {
  const connector = await fetchConfluenceConnector(connectorId);

  const pages = await ConfluencePage.findAll({
    attributes: ["id", "pageId", "parentId", "spaceId"],
    where: {
      connectorId,
      spaceId,
      ...(visitedAtMs ? { lastVisitedAt: visitedAtMs } : {}),
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

      await updateDataSourceDocumentParents({
        dataSourceConfig: dataSourceConfigFromConnector(connector),
        documentId: makePageInternalId(page.pageId),
        parents: parentIds,
        parentId: parentIds[1],
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

  const documentId = makePageInternalId(pageId);
  localLogger.info(
    { documentId },
    "Deleting Confluence page from Dust data source."
  );

  await deleteDataSourceDocument(dataSourceConfig, documentId, {
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

  // deleting the folder in data_source_folders (core)
  await deleteDataSourceFolder({
    dataSourceConfig,
    folderId: makeSpaceInternalId(spaceId),
  });
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

      // If the token has been revoked, return false.
      if (err instanceof ExternalOAuthTokenError) {
        return false;
      }

      throw err;
    }
  }

  return false;
}
