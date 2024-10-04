import type { WorkspaceType } from "@dust-tt/types";
import { DustAPI } from "@dust-tt/types";

import config from "@app/lib/api/config";
import { prodAPICredentialsForOwner } from "@app/lib/auth";
import { TRACKABLE_CONNECTOR_TYPES } from "@app/lib/documents_post_process_hooks/hooks/document_tracker/consts";
import logger from "@app/logger/logger";

export async function getTrackableDataSources(owner: WorkspaceType): Promise<
  {
    workspace_id: string;
    data_source_id: string;
  }[]
> {
  const prodCredentials = await prodAPICredentialsForOwner(owner);

  const prodAPI = new DustAPI(
    config.getDustAPIConfig(),
    prodCredentials,
    logger
  );

  // Fetch data sources
  const dsRes = await prodAPI.getDataSources(prodAPI.workspaceId());
  if (dsRes.isErr()) {
    throw dsRes.error;
  }
  const dataSources = dsRes.value;

  // Filter data sources to only include trackable ones
  const trackableDataSources = dataSources.filter(
    (ds) =>
      ds.connectorProvider &&
      TRACKABLE_CONNECTOR_TYPES.includes(ds.connectorProvider)
  );

  return trackableDataSources.map((ds) => ({
    workspace_id: prodAPI.workspaceId(),
    // TODO(GROUPS_INFRA): this should pull the data source views from the global vaults (we need an
    // API for that).
    data_source_id: ds.sId,
  }));
}
