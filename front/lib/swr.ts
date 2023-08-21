import useSWR, { Fetcher } from "swr";

import { GetWorkspacesResponseBody } from "@app/pages/api/poke/workspaces";
import { GetUserMetadataResponseBody } from "@app/pages/api/user/metadata/[key]";
import { GetDatasetsResponseBody } from "@app/pages/api/w/[wId]/apps/[aId]/datasets";
import { GetRunsResponseBody } from "@app/pages/api/w/[wId]/apps/[aId]/runs";
import { GetRunBlockResponseBody } from "@app/pages/api/w/[wId]/apps/[aId]/runs/[runId]/blocks/[type]/[name]";
import { GetRunStatusResponseBody } from "@app/pages/api/w/[wId]/apps/[aId]/runs/[runId]/status";
import { GetDataSourcesResponseBody } from "@app/pages/api/w/[wId]/data_sources";
import { GetDocumentsResponseBody } from "@app/pages/api/w/[wId]/data_sources/[name]/documents";
import { GetDataSourcePermissionsResponseBody } from "@app/pages/api/w/[wId]/data_sources/[name]/managed/permissions";
import { GetManagedDataSourceDefaultNewResourcePermissionResponseBody } from "@app/pages/api/w/[wId]/data_sources/[name]/managed/permissions/default";
import { GetWorkspaceInvitationsResponseBody } from "@app/pages/api/w/[wId]/invitations";
import { GetKeysResponseBody } from "@app/pages/api/w/[wId]/keys";
import { GetMembersResponseBody } from "@app/pages/api/w/[wId]/members";
import { GetProvidersResponseBody } from "@app/pages/api/w/[wId]/providers";
import {
  GetChatSessionResponseBody,
  GetChatSessionsResponseBody,
} from "@app/pages/api/w/[wId]/use/chats";
import { GetEventSchemasResponseBody } from "@app/pages/api/w/[wId]/use/extract";
import { GetExtractedEventsResponseBody } from "@app/pages/api/w/[wId]/use/extract/[marker]/events/[eId]";
import { AppType } from "@app/types/app";
import { DataSourceType } from "@app/types/data_source";
import { RunRunType } from "@app/types/run";
import { WorkspaceType } from "@app/types/user";

export const fetcher = async (...args: Parameters<typeof fetch>) =>
  fetch(...args).then(async (res) => {
    if (res.status >= 300) { 
      const errorText = await res.text();
      console.error('Error returned by the front API: ', res.status, res.headers, errorText);
      throw new Error(errorText);
    }
    return res.json();
  });

export function useDatasets(owner: WorkspaceType, app: AppType) {
  const datasetsFetcher: Fetcher<GetDatasetsResponseBody> = fetcher;

  const { data, error } = useSWR(
    `/api/w/${owner.sId}/apps/${app.sId}/datasets`,
    datasetsFetcher
  );

  return {
    datasets: data ? data.datasets : [],
    isDatasetsLoading: !error && !data,
    isDatasetsError: !!error,
  };
}

export function useProviders(owner: WorkspaceType) {
  const providersFetcher: Fetcher<GetProvidersResponseBody> = fetcher;

  const { data, error } = useSWR(
    `/api/w/${owner.sId}/providers`,
    providersFetcher
  );

  return {
    providers: data ? data.providers : [],
    isProvidersLoading: !error && !data,
    isProvidersError: error,
  };
}

export function useSavedRunStatus(
  owner: WorkspaceType,
  app: AppType,
  refresh: (data: GetRunStatusResponseBody | undefined) => number
) {
  const runStatusFetcher: Fetcher<GetRunStatusResponseBody> = fetcher;
  const { data, error } = useSWR(
    `/api/w/${owner.sId}/apps/${app.sId}/runs/saved/status`,
    runStatusFetcher,
    {
      refreshInterval: refresh,
    }
  );

  return {
    run: data ? data.run : null,
    isRunLoading: !error && !data,
    isRunError: error,
  };
}

export function useRunBlock(
  owner: WorkspaceType,
  app: AppType,
  runId: string,
  type: string,
  name: string,
  refresh: (data: GetRunBlockResponseBody | undefined) => number
) {
  const runBlockFetcher: Fetcher<GetRunBlockResponseBody> = fetcher;
  const { data, error } = useSWR(
    `/api/w/${owner.sId}/apps/${app.sId}/runs/${runId}/blocks/${type}/${name}`,
    runBlockFetcher,
    {
      refreshInterval: refresh,
    }
  );

  return {
    run: data ? data.run : null,
    isRunLoading: !error && !data,
    isRunError: error,
  };
}

export function useKeys(owner: WorkspaceType) {
  const keysFetcher: Fetcher<GetKeysResponseBody> = fetcher;
  const { data, error } = useSWR(`/api/w/${owner.sId}/keys`, keysFetcher);

  return {
    keys: data ? data.keys : [],
    isKeysLoading: !error && !data,
    isKeysError: error,
  };
}

export function useRuns(
  owner: WorkspaceType,
  app: AppType,
  limit: number,
  offset: number,
  runType: RunRunType,
  wIdTarget: string | null
) {
  const runsFetcher: Fetcher<GetRunsResponseBody> = fetcher;
  let url = `/api/w/${owner.sId}/apps/${app.sId}/runs?limit=${limit}&offset=${offset}&runType=${runType}`;
  if (wIdTarget) {
    url += `&wIdTarget=${wIdTarget}`;
  }
  const { data, error } = useSWR(url, runsFetcher);

  return {
    runs: data ? data.runs : [],
    total: data ? data.total : 0,
    isRunsLoading: !error && !data,
    isRunsError: error,
  };
}

export function useDocuments(
  owner: WorkspaceType,
  dataSource: { name: string },
  limit: number,
  offset: number
) {
  const documentsFetcher: Fetcher<GetDocumentsResponseBody> = fetcher;
  const { data, error } = useSWR(
    `/api/w/${owner.sId}/data_sources/${dataSource.name}/documents?limit=${limit}&offset=${offset}`,
    documentsFetcher
  );

  return {
    documents: data ? data.documents : [],
    total: data ? data.total : 0,
    isRunsLoading: !error && !data,
    isRunsError: error,
  };
}

export function useDataSources(owner: WorkspaceType) {
  const dataSourcesFetcher: Fetcher<GetDataSourcesResponseBody> = fetcher;
  const { data, error } = useSWR(
    `/api/w/${owner.sId}/data_sources`,
    dataSourcesFetcher
  );

  return {
    dataSources: data ? data.dataSources : [],
    isDataSourcesLoading: !error && !data,
    isDataSourcesError: error,
  };
}

export function useMembers(owner: WorkspaceType) {
  const membersFetcher: Fetcher<GetMembersResponseBody> = fetcher;
  const { data, error } = useSWR(`/api/w/${owner.sId}/members`, membersFetcher);

  return {
    members: data ? data.members : [],
    isMembersLoading: !error && !data,
    isMembersError: error,
  };
}

export function useWorkspaceInvitations(owner: WorkspaceType) {
  const workspaceInvitationsFetcher: Fetcher<GetWorkspaceInvitationsResponseBody> =
    fetcher;
  const { data, error } = useSWR(
    `/api/w/${owner.sId}/invitations`,
    workspaceInvitationsFetcher
  );

  return {
    invitations: data ? data.invitations : [],
    isInvitationsLoading: !error && !data,
    isInvitationsError: error,
  };
}

export function useChatSessions(
  owner: WorkspaceType,
  {
    limit,
    offset,
    workspaceScope,
  }: {
    limit: number;
    offset: number;
    workspaceScope?: boolean;
  }
) {
  const runsFetcher: Fetcher<GetChatSessionsResponseBody> = fetcher;
  const { data, error, mutate } = useSWR(
    `/api/w/${
      owner.sId
    }/use/chats?limit=${limit}&offset=${offset}&workspaceScope=${
      workspaceScope ? true : false
    }`,
    runsFetcher
  );

  return {
    sessions: data ? data.sessions : [],
    isChatSessionsLoading: !error && !data,
    isChatSessionsError: error,
    mutateChatSessions: mutate,
  };
}

export function useChatSession({
  owner,
  cId,
}: {
  owner: WorkspaceType;
  cId: string;
}) {
  const runsFetcher: Fetcher<GetChatSessionResponseBody> = fetcher;
  const { data, error, mutate } = useSWR(
    `/api/w/${owner.sId}/use/chats/${cId}`,
    runsFetcher
  );

  return {
    chatSession: data ? data.session : undefined,
    isChatSessionsLoading: !error && !data,
    isChatSessionsError: error,
    mutateChatSession: mutate,
  };
}

export function useUserMetadata(key: string) {
  const userMetadataFetcher: Fetcher<GetUserMetadataResponseBody> = fetcher;

  const { data, error } = useSWR(
    `/api/user/metadata/${encodeURIComponent(key)}`,
    userMetadataFetcher
  );

  return {
    metadata: data ? data.metadata : null,
    isMetadataLoading: !error && !data,
    isMetadataError: error,
  };
}

export function useEventSchemas(owner: WorkspaceType) {
  const eventSchemaFetcher: Fetcher<GetEventSchemasResponseBody> = fetcher;

  const { data, error } = useSWR(
    `/api/w/${owner.sId}/use/extract`,
    eventSchemaFetcher
  );

  return {
    schemas: data ? data.schemas : [],
    isSchemasLoading: !error && !data,
    isSchemasError: error,
  };
}

export function useConnectorPermissions(
  owner: WorkspaceType,
  dataSource: DataSourceType,
  parentId: string | null
) {
  const permissionsFetcher: Fetcher<GetDataSourcePermissionsResponseBody> =
    fetcher;

  let url = `/api/w/${owner.sId}/data_sources/${dataSource.name}/managed/permissions`;
  if (parentId) {
    url += `?parentId=${parentId}`;
  }

  const { data, error } = useSWR(url, permissionsFetcher);

  return {
    resources: data ? data.resources : [],
    isResourcesLoading: !error && !data,
    isResourcesError: error,
  };
}

export function useConnectorDefaultNewResourcePermission(
  owner: WorkspaceType,
  dataSource: DataSourceType
) {
  const defaultNewResourcePermissionFetcher: Fetcher<GetManagedDataSourceDefaultNewResourcePermissionResponseBody> =
    fetcher;

  const url = `/api/w/${owner.sId}/data_sources/${dataSource.name}/managed/permissions/default`;

  const { data, error } = useSWR(url, defaultNewResourcePermissionFetcher);

  return {
    defaultNewResourcePermission: data
      ? data.default_new_resource_permission
      : null,
    isDefaultNewResourcePermissionLoading: !error && !data,
    isDefaultNewResourcePermissionError: error,
  };
}

export function useExtractedEvents(owner: WorkspaceType, marker: string) {
  const extractedEventFetcher: Fetcher<GetExtractedEventsResponseBody> =
    fetcher;

  const { data, error } = useSWR(
    `/api/w/${owner.sId}/use/extract/${marker}/events`,
    extractedEventFetcher
  );

  return {
    events: data ? data.events : [],
    isEventsLoading: !error && !data,
    isEventsError: error,
  };
}

export function usePokeWorkspaces({
  upgraded,
  search,
  disabled,
  limit,
}: {
  upgraded?: boolean;
  search?: string;
  disabled?: boolean;
  limit?: number;
} = {}) {
  const workspacesFetcher: Fetcher<GetWorkspacesResponseBody> = fetcher;

  const queryParams = [
    upgraded !== undefined ? `upgraded=${upgraded}` : null,
    search ? `search=${search}` : null,
    limit ? `limit=${limit}` : null,
  ].filter((q) => q);

  let query = "";
  if (queryParams.length > 0) {
    query = `?${queryParams.join("&")}`;
  }

  const { data, error } = useSWR(
    disabled ? null : `api/poke/workspaces${query}`,
    workspacesFetcher
  );

  return {
    workspaces: data ? data.workspaces : [],
    isWorkspacesLoading: !error && !data,
    isWorkspacesError: error,
  };
}
