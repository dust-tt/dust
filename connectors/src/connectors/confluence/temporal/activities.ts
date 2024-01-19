import type { ModelId } from "@dust-tt/types";
import TurndownService from "turndown";

import { confluenceConfig } from "@connectors/connectors/confluence/lib/config";
import type { ConfluencePageWithBodyType } from "@connectors/connectors/confluence/lib/confluence_client";
import { ConfluenceClient } from "@connectors/connectors/confluence/lib/confluence_client";
import { isConfluencePageSkipped } from "@connectors/connectors/confluence/lib/confluence_page";
import {
  makeConfluenceDocumentUrl,
  makeConfluencePageId,
} from "@connectors/connectors/confluence/temporal/utils";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import {
  deleteFromDataSource,
  renderDocumentTitleAndContent,
  renderMarkdownSection,
  upsertToDatasource,
} from "@connectors/lib/data_sources";
import { Connector } from "@connectors/lib/models";
import {
  ConfluenceConfiguration,
  ConfluencePage,
  ConfluenceSpace,
} from "@connectors/lib/models/confluence";
import { getConnectionFromNango } from "@connectors/lib/nango_helpers";
import { syncStarted, syncSucceeded } from "@connectors/lib/sync_status";
import mainLogger from "@connectors/logger/logger";
import type { DataSourceConfig } from "@connectors/types/data_source_config";

const logger = mainLogger.child({
  provider: "confluence",
});

const turndownService = new TurndownService();

const { getRequiredNangoConfluenceConnectorId } = confluenceConfig;

async function getConfluenceAccessToken(connectionId: string) {
  const connection = await getConnectionFromNango({
    connectionId: connectionId,
    integrationId: getRequiredNangoConfluenceConnectorId(),
    refreshToken: false,
    useCache: true,
  });

  return connection.credentials.access_token;
}

async function getConfluenceClient(config: {
  cloudId: string;
  connectionId: string;
}) {
  const accessToken = await getConfluenceAccessToken(config.connectionId);

  return new ConfluenceClient(accessToken, { cloudId: config.cloudId });
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
  const connector = await Connector.findOne({
    where: {
      type: "confluence",
      id: connectorId,
    },
  });

  if (!connector) {
    throw new Error("Could not find connector");
  }
  const res = await syncStarted(connector.id);
  if (res.isErr()) {
    throw res.error;
  }
}

export async function confluenceSaveSuccessSyncActivity(connectorId: ModelId) {
  const connector = await Connector.findOne({
    where: {
      type: "confluence",
      id: connectorId,
    },
  });
  if (!connector) {
    throw new Error("Could not find connector");
  }

  const res = await syncSucceeded(connector.id);
  if (res.isErr()) {
    throw res.error;
  }
}

export async function confluenceGetSpaceNameActivity({
  confluenceCloudId,
  connectionId,
  spaceId,
}: {
  confluenceCloudId: string;
  connectionId: string;
  spaceId: string;
}) {
  const client = await getConfluenceClient({
    cloudId: confluenceCloudId,
    connectionId: connectionId,
  });

  const space = await client.getSpaceById(spaceId);

  return space.name;
}

export async function confluenceListPageIdsInSpaceActivity({
  confluenceCloudId,
  connectionId,
  pageCursor,
  spaceId,
}: {
  confluenceCloudId: string;
  connectionId: string;
  pageCursor: string;
  spaceId: string;
}) {
  const localLogger = logger.child({
    spaceId,
    pageCursor,
  });

  const client = await getConfluenceClient({
    cloudId: confluenceCloudId,
    connectionId: connectionId,
  });

  localLogger.info("Fetching Confluence pages in space.");

  const { pages, nextPageCursor } = await client.getPagesInSpace(
    spaceId,
    pageCursor
  );

  return {
    pageIds: pages.map((p) => p.id),
    nextPageCursor,
  };
}

async function upsertConfluencePageInDb(
  connectionId: string,
  dataSourceConfig: DataSourceConfig,
  page: ConfluencePageWithBodyType
) {
  const connector = await Connector.findOne({
    where: {
      connectionId,
      dataSourceName: dataSourceConfig.dataSourceName,
      workspaceId: dataSourceConfig.workspaceId,
    },
  });

  if (!connector) {
    throw new Error(`Connector not found (connectionId: ${connectionId})`);
  }

  await ConfluencePage.upsert({
    connectorId: connector.id,
    pageId: page.id,
    spaceId: page.spaceId,
    parentId: page.parentId,
    title: page.title,
    externalUrl: page._links.tinyui,
    version: page.version.number,
  });
}

interface ConfluenceUpsertPageActivityInput {
  spaceId: string;
  spaceName: string;
  pageId: string;
  dataSourceConfig: DataSourceConfig;
  isBatchSync: boolean;
  connectionId: string;
  connectorId: ModelId;
}

export async function confluenceUpsertPageActivity({
  spaceId,
  spaceName,
  connectorId,
  pageId,
  dataSourceConfig,
  connectionId,
  isBatchSync,
}: ConfluenceUpsertPageActivityInput) {
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
    return;
  }

  const confluenceConfig = await fetchConfluenceConfigurationActivity(
    connectorId
  );

  const client = await getConfluenceClient({
    cloudId: confluenceConfig?.cloudId,
    connectionId,
  });

  localLogger.info("Upserting Confluence page.");

  const page = await client.getPageById(pageId);
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
    const tags = [
      `createdAt:${pageCreatedAt.getTime()}`,
      `space:${spaceName}`,
      `title:${page.title}`,
      `updatedAt:${lastPageVersionCreatedAt.getTime()}`,
      `version:${page.version.number}`,
    ];

    await upsertToDatasource({
      dataSourceConfig,
      delayBetweenRetriesMs: 500,
      documentContent: renderedPage,
      documentId,
      documentUrl,
      loggerArgs,
      // TODO(2024-01-18 flav) Add parent page internal id.
      parents: [documentId],
      retries: 3,
      tags,
      timestampMs: lastPageVersionCreatedAt.getTime(),
      upsertContext: {
        sync_type: isBatchSync ? "batch" : "incremental",
      },
    });
  }

  localLogger.info("Upserting Confluence page in DB.");

  await upsertConfluencePageInDb(connectionId, dataSourceConfig, page);
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

  const connector = await Connector.findOne({
    where: {
      id: connectorId,
    },
  });
  if (!connector) {
    throw new Error(`Connector not found (id: ${connectorId})`);
  }

  const dataSourceConfig = dataSourceConfigFromConnector(connector);

  const allPages = await ConfluencePage.findAll({
    attributes: ["pageId"],
    where: {
      connectorId,
      spaceId,
    },
  });

  localLogger.info("Delete Confluence space", {
    numberOfPages: allPages.length,
  });

  for (const page of allPages) {
    await deletePage(connectorId, page.pageId, dataSourceConfig);
  }
}
