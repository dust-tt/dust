import {
  GOOGLE_DRIVE_SHARED_WITH_ME_VIRTUAL_ID,
  GOOGLE_DRIVE_SHARED_WITH_ME_WEB_URL,
} from "@connectors/connectors/google_drive/lib/consts";
import { getInternalId } from "@connectors/connectors/google_drive/temporal/utils";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { upsertDataSourceFolder } from "@connectors/lib/data_sources";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { ModelId } from "@connectors/types";
import { INTERNAL_MIME_TYPES } from "@connectors/types";

/**
 *  Upserts to data_sources_folders (core) a top-level folder "Shared with me".
 */
export async function upsertSharedWithMeFolder(connectorId: ModelId) {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(`Connector ${connectorId} not found`);
  }

  const folderId = getInternalId(GOOGLE_DRIVE_SHARED_WITH_ME_VIRTUAL_ID);
  await upsertDataSourceFolder({
    dataSourceConfig: dataSourceConfigFromConnector(connector),
    folderId,
    parents: [folderId],
    parentId: null,
    title: "Shared with me",
    mimeType: INTERNAL_MIME_TYPES.GOOGLE_DRIVE.SHARED_WITH_ME,
    sourceUrl: GOOGLE_DRIVE_SHARED_WITH_ME_WEB_URL,
  });
}
