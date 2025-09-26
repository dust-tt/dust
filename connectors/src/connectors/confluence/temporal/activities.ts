import { assertNever } from "@dust-tt/client";

import type { ConfluenceContentRef } from "@connectors/connectors/confluence/lib/confluence_api";
import {
  bulkFetchConfluencePageRefs,
  getActiveChildContentRefs,
  pageHasReadRestrictions,
} from "@connectors/connectors/confluence/lib/confluence_api";
import {
  confluenceCheckAndUpsertSingleFolder,
  confluenceRemoveAllFoldersInSpace,
  confluenceRemoveUnvisitedFolders,
} from "@connectors/connectors/confluence/lib/content/folders";
import {
  confluenceCheckAndUpsertSinglePage,
  confluenceRemoveAllPagesInSpace,
  confluenceRemoveUnvisitedPages,
  confluenceUpsertPageToDataSource,
  upsertConfluencePageInDb,
} from "@connectors/connectors/confluence/lib/content/pages";
import {
  getConfluenceContentParentIds,
  getSpaceHierarchy,
} from "@connectors/connectors/confluence/lib/hierarchy";
import {
  makeFolderInternalId,
  makePageInternalId,
  makeSpaceInternalId,
} from "@connectors/connectors/confluence/lib/internal_ids";
import {
  getConfluenceClient,
  getConfluenceConfig,
} from "@connectors/connectors/confluence/lib/utils";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { concurrentExecutor } from "@connectors/lib/async_utils";
import {
  deleteDataSourceFolder,
  updateDataSourceDocumentParents,
  upsertDataSourceFolder,
} from "@connectors/lib/data_sources";
import {
  ExternalOAuthTokenError,
  isNotFoundError,
} from "@connectors/lib/error";
import {
  ConfluenceConfiguration,
  ConfluenceFolder,
  ConfluencePage,
  ConfluenceSpace,
} from "@connectors/lib/models/confluence";
import { syncStarted, syncSucceeded } from "@connectors/lib/sync_status";
import { heartbeat } from "@connectors/lib/temporal";
import mainLogger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { ModelId } from "@connectors/types";
import {
  ConfluenceClientError,
  INTERNAL_MIME_TYPES,
  isConfluenceNotFoundError,
} from "@connectors/types";

const UPSERT_CONCURRENT_LIMIT = 10;

export interface SpaceBlob {
  id: string;
  key: string;
  name: string;
}

const logger = mainLogger.child({
  provider: "confluence",
});

async function fetchConfluenceConnector(connectorId: ModelId) {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error("Connector not found.");
  }

  return connector;
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
  return getConfluenceConfig({ connectorId });
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
    connectorId,
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
      localLogger.info({ error: err }, "Deleting stale Confluence space.");
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
    mimeType: INTERNAL_MIME_TYPES.CONFLUENCE.SPACE,
    sourceUrl: spaceInDb?.urlSuffix && `${baseUrl}/wiki${spaceInDb.urlSuffix}`,
  });

  // Update the space name in db.
  if (spaceInDb && spaceInDb.name != spaceName) {
    await spaceInDb.update({ name: spaceName });
  }
}

interface ConfluenceCheckAndUpsertSingleContentActivityInput {
  connectorId: ModelId;
  contentRef: ConfluenceContentRef;
  forceUpsert: boolean;
  isBatchSync: boolean;
  space: SpaceBlob;
  visitedAtMs: number;
}

export async function confluenceCheckAndUpsertSingleContentActivity({
  connectorId,
  contentRef,
  forceUpsert,
  isBatchSync,
  space,
  visitedAtMs,
}: ConfluenceCheckAndUpsertSingleContentActivityInput): Promise<boolean> {
  const connector = await fetchConfluenceConnector(connectorId);
  const dataSourceConfig = dataSourceConfigFromConnector(connector);

  switch (contentRef.type) {
    case "page":
      return confluenceCheckAndUpsertSinglePage({
        connector,
        dataSourceConfig,
        pageRef: contentRef,
        forceUpsert,
        isBatchSync,
        space,
        visitedAtMs,
      });

    case "folder":
      return confluenceCheckAndUpsertSingleFolder({
        connector,
        dataSourceConfig,
        folderRef: contentRef,
        forceUpsert,
        isBatchSync,
        space,
        visitedAtMs,
      });

    default:
      assertNever(contentRef);
  }
}

type ConfluenceUpsertLeafContentActivityInput = Omit<
  ConfluenceCheckAndUpsertSingleContentActivityInput,
  "contentRef"
> & {
  contentRefs: ConfluenceContentRef[];
};

export async function confluenceUpsertLeafContentActivity({
  contentRefs,
  ...params
}: ConfluenceUpsertLeafContentActivityInput) {
  await concurrentExecutor(
    contentRefs,
    async (contentRef) => {
      await confluenceCheckAndUpsertSingleContentActivity({
        ...params,
        contentRef,
      });
    },
    {
      concurrency: UPSERT_CONCURRENT_LIMIT,
    }
  );
}

export async function confluenceGetActiveChildContentRefsActivity({
  confluenceCloudId,
  connectorId,
  pageCursor,
  parentContentId,
  space,
}: {
  confluenceCloudId: string;
  connectorId: ModelId;
  pageCursor: string;
  parentContentId: string;
  space: SpaceBlob;
}) {
  const { id: spaceId, key: spaceKey } = space;

  const localLogger = logger.child({
    connectorId,
    pageCursor,
    parentContentId,
    spaceId,
  });

  const client = await getConfluenceClient({
    cloudId: confluenceCloudId,
    connectorId,
  });

  localLogger.info("Fetching Confluence child pages in space.");

  return getActiveChildContentRefs(client, {
    pageCursor,
    parentContentId,
    spaceKey,
  });
}

// Confluence has a single main landing page.
// However, users have the ability to create "orphaned" root pages that don't link from the main landing.
// It's important to ensure these pages are also imported.
// TODO: Update comments.
async function getRootContentRefsActivity({
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

  localLogger.info("Fetching Confluence root content in space.");

  try {
    // For now Confluence API only supports fetching root pages. Other content types are not
    // supported.
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

// Activity to handle fetching, upserting, and filtering root content.
export async function fetchAndUpsertRootContentActivity(params: {
  confluenceCloudId: string;
  connectorId: ModelId;
  forceUpsert: boolean;
  isBatchSync: boolean;
  space: SpaceBlob;
  visitedAtMs: number;
}): Promise<string[]> {
  const { connectorId, confluenceCloudId, space } = params;

  // Get the root level content for the space.
  const rootContentRefs = await getRootContentRefsActivity({
    connectorId,
    confluenceCloudId,
    space,
  });
  if (rootContentRefs.length === 0) {
    return [];
  }

  const allowedRootContentIds: string[] = [];

  // Check and upsert content, filter allowed ones.
  for (const rootContentRef of rootContentRefs) {
    const successfullyUpsert =
      await confluenceCheckAndUpsertSingleContentActivity({
        ...params,
        contentRef: rootContentRef,
      });

    // If the content fails the upsert operation, it indicates the content is restricted.
    // Such content should not be added to the list of allowed content.
    if (successfullyUpsert) {
      allowedRootContentIds.push(rootContentRef.id);
    }
  }

  return allowedRootContentIds;
}

export async function confluenceGetTopLevelContentIdsActivity({
  confluenceCloudId,
  connectorId,
  pageCursor,
  rootContentId,
  space,
}: {
  confluenceCloudId: string;
  connectorId: ModelId;
  pageCursor: string | null;
  rootContentId: string;
  space: SpaceBlob;
}) {
  const { id: spaceId, key: spaceKey } = space;

  const localLogger = logger.child({
    connectorId,
    rootContentId,
    spaceId,
  });

  const client = await getConfluenceClient({
    cloudId: confluenceCloudId,
    connectorId,
  });

  localLogger.info("Fetching Confluence top-level page in space.");

  const { childContentRefs, nextPageCursor } = await getActiveChildContentRefs(
    client,
    {
      pageCursor,
      parentContentId: rootContentId,
      spaceKey,
    }
  );

  localLogger.info(
    {
      topLevelPagesCount: childContentRefs.length,
    },
    "Found Confluence top-level pages in space."
  );

  return {
    topLevelContentRefs: childContentRefs,
    nextPageCursor,
  };
}

export async function confluenceUpdateContentParentIdsActivity(
  connectorId: ModelId,
  spaceId: string,
  visitedAtMs: number | null
) {
  const connector = await fetchConfluenceConnector(connectorId);

  const pages = await ConfluencePage.findAll({
    attributes: ["id", "pageId", "parentId", "parentType", "spaceId"],
    where: {
      connectorId,
      spaceId,
      ...(visitedAtMs ? { lastVisitedAt: visitedAtMs } : {}),
    },
  });

  const folders = await ConfluenceFolder.findAll({
    attributes: [
      "id",
      "folderId",
      "parentId",
      "parentType",
      "spaceId",
      "title",
    ],
    where: {
      connectorId,
      spaceId,
      ...(visitedAtMs ? { lastVisitedAt: visitedAtMs } : {}),
    },
  });

  await heartbeat();

  logger.info(
    {
      confluenceContentCount: pages.length + folders.length,
      confluenceFoldersCount: folders.length,
      confluencePagesCount: pages.length,
      connectorId,
    },
    "Start updating content parent ids."
  );

  // Use an in-memory map to cache content hierarchies, thereby reducing database queries.
  const cachedHierarchy = await getSpaceHierarchy(connectorId, spaceId);

  await concurrentExecutor(
    [...pages, ...folders],
    async (e) => {
      const isPage = e instanceof ConfluencePage;

      // Retrieve parents using the internal ID, which aligns with the permissions view rendering
      // and RAG requirements.
      const parentIds = await getConfluenceContentParentIds(
        connectorId,
        {
          id: isPage ? e.pageId : e.folderId,
          parentId: e.parentId ?? null,
          parentType: e.parentType,
          spaceId: e.spaceId,
          type: isPage ? "page" : "folder",
        },
        cachedHierarchy
      );

      if (isPage) {
        return updateDataSourceDocumentParents({
          dataSourceConfig: dataSourceConfigFromConnector(connector),
          documentId: makePageInternalId(e.pageId),
          parents: parentIds,
          parentId: parentIds[1],
        });
      }

      await upsertDataSourceFolder({
        dataSourceConfig: dataSourceConfigFromConnector(connector),
        folderId: makeFolderInternalId(e.folderId),
        mimeType: INTERNAL_MIME_TYPES.CONFLUENCE.FOLDER,
        parentId: parentIds[1],
        parents: parentIds,
        sourceUrl: e.externalUrl,
        title: e.title,
      });
    },
    {
      concurrency: 10,
      onBatchComplete: async () => {
        await heartbeat();
      },
    }
  );

  logger.info({ connectorId }, "Done updating content parent ids.");
}

export async function confluenceRemoveUnvisitedContentActivity({
  connectorId,
  lastVisitedAt,
  spaceId,
}: {
  connectorId: ModelId;
  lastVisitedAt: number;
  spaceId: string;
}) {
  const connector = await fetchConfluenceConnector(connectorId);
  const dataSourceConfig = dataSourceConfigFromConnector(connector);

  await confluenceRemoveUnvisitedPages({
    connector,
    dataSourceConfig,
    lastVisitedAt,
    spaceId,
  });

  await confluenceRemoveUnvisitedFolders({
    connector,
    dataSourceConfig,
    lastVisitedAt,
    spaceId,
  });
}

export async function confluenceRemoveSpaceActivity(
  connectorId: ModelId,
  spaceId: string
) {
  const connector = await fetchConfluenceConnector(connectorId);

  const dataSourceConfig = dataSourceConfigFromConnector(connector);

  await confluenceRemoveAllPagesInSpace({
    connector,
    dataSourceConfig,
    spaceId,
  });

  await confluenceRemoveAllFoldersInSpace({
    connector,
    dataSourceConfig,
    spaceId,
  });

  // Deleting the folder in data_source_folders (core).
  await deleteDataSourceFolder({
    dataSourceConfig,
    folderId: makeSpaceInternalId(spaceId),
  });

  // Deleting the space to omit it from subsequent syncs.
  await ConfluenceSpace.destroy({
    where: {
      connectorId,
      spaceId,
    },
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

/**
 * Page specific activities.
 */

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
    {
      cloudId: confluenceConfig.cloudId,
    },
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

  const parents = await getConfluenceContentParentIds(
    connectorId,
    {
      id: page.id,
      parentId: page.parentId,
      parentType: page.parentType,
      spaceId: page.spaceId,
      type: "page",
    },
    cachedSpaceHierarchies[page.spaceId]
  );

  localLogger.info("Upserting Confluence page.");
  await confluenceUpsertPageToDataSource({
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

/**
 * Personal Data Reporting logic.
 */

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
