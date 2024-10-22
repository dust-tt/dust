import type { Authenticator } from "@app/lib/auth";
import { TRACKABLE_CONNECTOR_TYPES } from "@app/lib/documents_post_process_hooks/hooks/document_tracker/consts";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { VaultResource } from "@app/lib/resources/vault_resource";

export async function getTrackableDataSourceViews(
  auth: Authenticator
): Promise<DataSourceViewResource[]> {
  const globalVault = await VaultResource.fetchWorkspaceGlobalVault(auth);
  // TODO(DOC_TRACKER):
  const views = await DataSourceViewResource.listByVault(auth, globalVault);

  // Filter data sources to only include trackable ones
  const trackableViews = views.filter(
    (view) =>
      view.dataSource.connectorProvider &&
      TRACKABLE_CONNECTOR_TYPES.includes(view.dataSource.connectorProvider)
  );

  return trackableViews;
}
