import {
  formatProjectMetadata,
  getMetadataFileInternalId,
} from "@connectors/connectors/dust_project/lib/format_metadata";
import {
  renderDocumentTitleAndContent,
  upsertDataSourceDocument,
} from "@connectors/lib/data_sources";
import logger from "@connectors/logger/logger";
import type { DataSourceConfig } from "@connectors/types";
import type { ProjectMetadataType } from "@dust-tt/client";

/**
 * Syncs project metadata (description) to the data source.
 * Creates a metadata.md file at the root of the project folder.
 */
export async function syncProjectMetadata({
  dataSourceConfig,
  connectorId,
  projectId,
  metadata,
}: {
  dataSourceConfig: DataSourceConfig;
  connectorId: number;
  projectId: string;
  metadata: ProjectMetadataType | null;
}): Promise<void> {
  const localLogger = logger.child({
    connectorId,
    projectId,
    provider: "dust_project",
  });

  if (!metadata) {
    localLogger.info("No metadata found for project. Skipping sync.");
    return;
  }

  localLogger.info("Syncing project metadata (only description for now)");

  const metadataText = formatProjectMetadata(metadata);

  // Get the internal IDs for the document and folder
  const documentId = getMetadataFileInternalId(connectorId, projectId);

  // Create the document content section
  const contentSection = {
    prefix: null,
    content: metadataText,
    sections: [],
  };

  // Render with metadata (title, timestamps)
  const documentContent = await renderDocumentTitleAndContent({
    dataSourceConfig,
    title: "metadata.md",
    createdAt: new Date(metadata.createdAt),
    updatedAt: new Date(metadata.updatedAt),
    content: contentSection,
  });

  // Upsert the description document
  await upsertDataSourceDocument({
    dataSourceConfig,
    documentId,
    documentContent,
    documentUrl: undefined,
    timestampMs: Date.now(),
    tags: [`project:${projectId}`],
    parents: [documentId],
    parentId: null,
    loggerArgs: {
      connectorId,
      projectId,
      documentId,
    },
    upsertContext: {
      sync_type: "batch",
    },
    title: "Project metadata",
    mimeType: "text/markdown",
    async: true,
  });

  localLogger.info("Successfully synced project metadata (description)");
}
