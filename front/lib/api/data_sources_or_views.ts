import type { DataSourceOrViewType } from "@dust-tt/types";

import type { Authenticator } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";

export async function getDataSourcesOrViews(
  auth: Authenticator,
  { includeEditedBy }: { includeEditedBy: boolean } = {
    includeEditedBy: false,
  }
): Promise<DataSourceOrViewType[]> {
  const owner = auth.workspace();

  // This condition is critical it checks that we can identify the workspace and that the current
  // auth is a user for this workspace. Checking `auth.isUser()` is critical as it would otherwise
  // be possible to access data sources without being authenticated.
  if (!owner || !auth.isUser()) {
    return [];
  }

  const dataSources = await DataSourceResource.listByWorkspace(auth, {
    includeEditedBy,
  });

  // TODO(GROUPS_INFRA) Add support for `includeEditedBy`.
  const dataSourceViews = await DataSourceViewResource.listByWorkspace(auth);

  // Create a set of dataSource IDs that have associated views.
  const dataSourceIdsWithViews = new Set(
    dataSourceViews.map((view) => view.dataSourceId)
  );

  // Filter out data sources that have an associated view.
  const filteredDataSources = dataSources.filter(
    (ds) => !dataSourceIdsWithViews.has(ds.id)
  );

  // Combine the filtered data sources with all views.
  const filteredDataSourcesOrViews = [
    ...filteredDataSources,
    ...dataSourceViews,
  ];

  // Return the JSON representation of the filtered data sources or views.
  return filteredDataSourcesOrViews.map((dsv) => dsv.toDataSourceOrViewJSON());
}

export async function getDataSourceOrView(
  auth: Authenticator,
  nameOrId: string,
  { includeEditedBy }: { includeEditedBy: boolean } = {
    includeEditedBy: false,
  }
): Promise<DataSourceOrViewType | null> {
  const owner = auth.workspace();

  // This condition is critical it checks that we can identify the workspace and that the current
  // auth is a user for this workspace. Checking `auth.isUser()` is critical as it would otherwise
  // be possible to access data sources without being authenticated.
  if (!owner || !auth.isUser()) {
    return null;
  }

  if (DataSourceViewResource.isDataSourceViewSId(nameOrId)) {
    // TODO(GROUPS_INFRA) Add support for `includeEditedBy`.
    const dataSourceView = await DataSourceViewResource.fetchById(
      auth,
      nameOrId
    );
    if (!dataSourceView) {
      return null;
    }

    return dataSourceView.toDataSourceOrViewJSON();
  }

  const dataSource = await DataSourceResource.fetchByName(auth, nameOrId, {
    includeEditedBy,
  });
  if (!dataSource) {
    return null;
  }

  return dataSource.toDataSourceOrViewJSON();
}
