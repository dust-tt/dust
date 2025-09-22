import { Op } from "sequelize";
import TurndownService from "turndown";

import type { ConfluencePageRef } from "@connectors/connectors/confluence/lib/confluence_api";
import type {
  ConfluenceClient,
  ConfluencePageWithBodyType,
} from "@connectors/connectors/confluence/lib/confluence_client";
import type { BaseConfluenceCheckAndUpsertSingleEntityActivityInput } from "@connectors/connectors/confluence/lib/content/types";
import {
  HiddenContentNodeParentId,
  makeConfluenceContentUrl,
} from "@connectors/connectors/confluence/lib/content/types";
import {
  makeEntityInternalId,
  makePageInternalId,
  makeSpaceInternalId,
} from "@connectors/connectors/confluence/lib/internal_ids";
import {
  getConfluenceClient,
  getConfluenceConfig,
} from "@connectors/connectors/confluence/lib/utils";
import { filterCustomTags } from "@connectors/connectors/shared/tags";
import type { UpsertDataSourceDocumentParams } from "@connectors/lib/data_sources";
import {
  deleteDataSourceDocument,
  renderDocumentTitleAndContent,
  renderMarkdownSection,
  upsertDataSourceDocument,
} from "@connectors/lib/data_sources";
import type { ConfluenceConfiguration } from "@connectors/lib/models/confluence";
import { ConfluencePage } from "@connectors/lib/models/confluence";
import logger from "@connectors/logger/logger";
import type { ConnectorResource } from "@connectors/resources/connector_resource";
import type { DataSourceConfig, ModelId } from "@connectors/types";
import { INTERNAL_MIME_TYPES } from "@connectors/types";
import { heartbeat } from "@connectors/lib/temporal";

const turndownService = new TurndownService();

async function markPageHasVisited({
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

/**
 * Upsert logic.
 */

interface ConfluenceUpsertPageInput {
  page: NonNullable<Awaited<ReturnType<ConfluenceClient["getPageById"]>>>;
  spaceName: string;
  parents: [string, string, ...string[]];
  confluenceConfig: ConfluenceConfiguration;
  syncType?: UpsertDataSourceDocumentParams["upsertContext"]["sync_type"];
  dataSourceConfig: DataSourceConfig;
  loggerArgs: Record<string, string | number>;
}

export async function confluenceUpsertPageToDataSource({
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

  // Log labels info.
  if (page.labels.results.length > 0) {
    localLogger.info(
      { labelsCount: page.labels.results.length },
      "Confluence page has labels."
    );
  }

  // Use label names for tags instead of IDs.
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
  const documentUrl = makeConfluenceContentUrl({
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
    mimeType: INTERNAL_MIME_TYPES.CONFLUENCE.PAGE,
    async: true,
  });
}

export async function upsertConfluencePageInDb(
  connectorId: ModelId,
  page: ConfluencePageWithBodyType,
  visitedAtMs: number
) {
  await ConfluencePage.upsert({
    connectorId,
    externalUrl: page._links.tinyui,
    lastVisitedAt: new Date(visitedAtMs),
    pageId: page.id,
    parentId: page.parentId,
    parentType: page.parentType,
    spaceId: page.spaceId,
    title: page.title,
    version: page.version.number,
  });
}

/**
 * Upsert a Confluence page without its full parents.
 * Operates greedily by stopping if the page is restricted or if there is a version match
 * (unless the page was moved, in this case, we have to upsert because the parents have changed).
 */
export async function confluenceCheckAndUpsertSinglePage({
  connector,
  dataSourceConfig,
  pageRef,
  forceUpsert,
  isBatchSync,
  space,
  visitedAtMs,
}: BaseConfluenceCheckAndUpsertSingleEntityActivityInput & {
  pageRef: ConfluencePageRef;
}) {
  await heartbeat();

  const { id: spaceId, name: spaceName } = space;
  const { id: pageId } = pageRef;

  const { id: connectorId } = connector;

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

  const confluenceConfig = await getConfluenceConfig({ connectorId });

  const client = await getConfluenceClient(
    {
      cloudId: confluenceConfig.cloudId,
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
  if (page.parentId && page.parentType) {
    // Exact parent Ids will be computed after all page imports within the space have been completed.
    parents = [
      makePageInternalId(page.id),
      makeEntityInternalId(page.parentType, page.parentId),
      HiddenContentNodeParentId,
    ];
  } else {
    // In this case we already have the exact parents: the page itself and the space.
    parents = [makePageInternalId(page.id), makeSpaceInternalId(spaceId)];
  }

  localLogger.info("Upserting Confluence page.");
  await confluenceUpsertPageToDataSource({
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

/**
 * Garbage collect logic.
 */

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

export async function confluenceRemoveUnvisitedPages({
  connector,
  dataSourceConfig,
  lastVisitedAt,
  spaceId,
}: {
  connector: ConnectorResource;
  dataSourceConfig: DataSourceConfig;
  lastVisitedAt: number;
  spaceId: string;
}) {
  const { id: connectorId } = connector;

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

  for (const page of unvisitedPages) {
    // TODO(2024-01-22 flav) Add an extra check to ensure that the page does not exist anymore in Confluence.
    await deletePage(connectorId, page.pageId, dataSourceConfig);
  }
}

export async function confluenceRemoveAllPagesInSpace({
  connector,
  dataSourceConfig,
  spaceId,
}: {
  connector: ConnectorResource;
  dataSourceConfig: DataSourceConfig;
  spaceId: string;
}) {
  const { id: connectorId } = connector;

  const localLogger = logger.child({
    connectorId,
    dataSourceId: dataSourceConfig.dataSourceId,
    spaceId,
  });

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
    "Delete Confluence space pages"
  );

  for (const page of allPages) {
    await deletePage(connectorId, page.pageId, dataSourceConfig);
  }
}
