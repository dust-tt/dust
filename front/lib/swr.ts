import type {
  AgentConfigurationType,
  AgentsGetViewType,
  AppType,
  ConnectorPermission,
  ConversationMessageReactions,
  ConversationType,
  DataSourceType,
  RunRunType,
  WorkspaceType,
} from "@dust-tt/types";
import { useMemo } from "react";
import type { Fetcher } from "swr";
import useSWR from "swr";

import type { GetPokePlansResponseBody } from "@app/pages/api/poke/plans";
import type { GetWorkspacesResponseBody } from "@app/pages/api/poke/workspaces";
import type { GetUserResponseBody } from "@app/pages/api/user";
import type { GetUserMetadataResponseBody } from "@app/pages/api/user/metadata/[key]";
import type { ListTablesResponseBody } from "@app/pages/api/v1/w/[wId]/data_sources/[name]/tables";
import type { GetTableResponseBody } from "@app/pages/api/v1/w/[wId]/data_sources/[name]/tables/[tId]";
import type { GetDatasetsResponseBody } from "@app/pages/api/w/[wId]/apps/[aId]/datasets";
import type { GetRunsResponseBody } from "@app/pages/api/w/[wId]/apps/[aId]/runs";
import type { GetRunBlockResponseBody } from "@app/pages/api/w/[wId]/apps/[aId]/runs/[runId]/blocks/[type]/[name]";
import type { GetRunStatusResponseBody } from "@app/pages/api/w/[wId]/apps/[aId]/runs/[runId]/status";
import type { GetAgentConfigurationsResponseBody } from "@app/pages/api/w/[wId]/assistant/agent_configurations";
import type { GetAgentUsageResponseBody } from "@app/pages/api/w/[wId]/assistant/agent_configurations/[aId]/usage";
import type { GetDataSourcesResponseBody } from "@app/pages/api/w/[wId]/data_sources";
import type { GetConnectorResponseBody } from "@app/pages/api/w/[wId]/data_sources/[name]/connector";
import type { GetDocumentsResponseBody } from "@app/pages/api/w/[wId]/data_sources/[name]/documents";
import type { GetOrPostManagedDataSourceConfigResponseBody } from "@app/pages/api/w/[wId]/data_sources/[name]/managed/config/[key]";
import type { GetDataSourcePermissionsResponseBody } from "@app/pages/api/w/[wId]/data_sources/[name]/managed/permissions";
import type { GetSlackChannelsLinkedWithAgentResponseBody } from "@app/pages/api/w/[wId]/data_sources/[name]/managed/slack/channels_linked_with_agent";
import type { GetWorkspaceInvitationsResponseBody } from "@app/pages/api/w/[wId]/invitations";
import type { GetKeysResponseBody } from "@app/pages/api/w/[wId]/keys";
import type { GetMembersResponseBody } from "@app/pages/api/w/[wId]/members";
import type { GetProvidersResponseBody } from "@app/pages/api/w/[wId]/providers";
import type { GetExtractedEventsResponseBody } from "@app/pages/api/w/[wId]/use/extract/events/[sId]";
import type { GetEventSchemasResponseBody } from "@app/pages/api/w/[wId]/use/extract/templates";
import type { GetWorkspaceAnalyticsResponse } from "@app/pages/api/w/[wId]/workspace-analytics";

export const fetcher = async (...args: Parameters<typeof fetch>) =>
  fetch(...args).then(async (res) => {
    if (res.status >= 300) {
      const errorText = await res.text();
      console.error(
        "Error returned by the front API: ",
        res.status,
        res.headers,
        errorText
      );
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
    datasets: useMemo(() => (data ? data.datasets : []), [data]),
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
    providers: useMemo(() => (data ? data.providers : []), [data]),
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
    keys: useMemo(() => (data ? data.keys : []), [data]),
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
    runs: useMemo(() => (data ? data.runs : []), [data]),
    total: data ? data.total : 0,
    isRunsLoading: !error && !data,
    isRunsError: error,
  };
}

export function useDocuments(
  owner: WorkspaceType,
  dataSource: { name: string },
  limit: number,
  offset: number,
  asDustSuperUser?: boolean
) {
  const documentsFetcher: Fetcher<GetDocumentsResponseBody> = fetcher;
  const { data, error } = useSWR(
    `/api/w/${owner.sId}/data_sources/${
      dataSource.name
    }/documents?limit=${limit}&offset=${offset}${
      asDustSuperUser ? "&asDustSuperUser=true" : ""
    }`,
    documentsFetcher
  );

  return {
    documents: useMemo(() => (data ? data.documents : []), [data]),
    total: data ? data.total : 0,
    isDocumentsLoading: !error && !data,
    isDocumentsError: error,
  };
}

export function useDataSources(owner: WorkspaceType) {
  const dataSourcesFetcher: Fetcher<GetDataSourcesResponseBody> = fetcher;
  const { data, error, mutate } = useSWR(
    `/api/w/${owner.sId}/data_sources`,
    dataSourcesFetcher
  );

  return {
    dataSources: useMemo(() => (data ? data.dataSources : []), [data]),
    isDataSourcesLoading: !error && !data,
    isDataSourcesError: error,
    mutateDataSources: mutate,
  };
}

export function useMembers(owner: WorkspaceType) {
  const membersFetcher: Fetcher<GetMembersResponseBody> = fetcher;
  const { data, error } = useSWR(`/api/w/${owner.sId}/members`, membersFetcher);

  return {
    members: useMemo(() => (data ? data.members : []), [data]),
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
    invitations: useMemo(() => (data ? data.invitations : []), [data]),
    isInvitationsLoading: !error && !data,
    isInvitationsError: error,
  };
}

export function useUser() {
  const userFetcher: Fetcher<GetUserResponseBody> = fetcher;
  const { data, error } = useSWR("/api/user", userFetcher);

  return {
    user: data ? data.user : null,
    isUserLoading: !error && !data,
    isUserError: error,
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
    `/api/w/${owner.sId}/use/extract/templates`,
    eventSchemaFetcher
  );

  return {
    schemas: useMemo(() => (data ? data.schemas : []), [data]),
    isSchemasLoading: !error && !data,
    isSchemasError: error,
  };
}

export function useConnectorPermissions({
  owner,
  dataSource,
  parentId,
  filterPermission,
  disabled,
}: {
  owner: WorkspaceType;
  dataSource: DataSourceType;
  parentId: string | null;
  filterPermission: ConnectorPermission | null;
  disabled?: boolean;
}) {
  const permissionsFetcher: Fetcher<GetDataSourcePermissionsResponseBody> =
    fetcher;

  let url = `/api/w/${owner.sId}/data_sources/${dataSource.name}/managed/permissions?`;
  if (parentId) {
    url += `&parentId=${parentId}`;
  }
  if (filterPermission) {
    url += `&filterPermission=${filterPermission}`;
  }

  const { data, error } = useSWR(disabled ? null : url, permissionsFetcher);

  return {
    resources: useMemo(() => (data ? data.resources : []), [data]),
    isResourcesLoading: !error && !data,
    isResourcesError: error,
  };
}

export function usePokeConnectorPermissions({
  owner,
  dataSource,
  parentId,
  filterPermission,
  disabled,
}: {
  owner: WorkspaceType;
  dataSource: DataSourceType;
  parentId: string | null;
  filterPermission: ConnectorPermission | null;
  disabled?: boolean;
}) {
  const permissionsFetcher: Fetcher<GetDataSourcePermissionsResponseBody> =
    fetcher;

  let url = `/api/poke/workspaces/${owner.sId}/data_sources/${dataSource.name}/managed/permissions?`;
  if (parentId) {
    url += `&parentId=${parentId}`;
  }
  if (filterPermission) {
    url += `&filterPermission=${filterPermission}`;
  }

  const { data, error } = useSWR(disabled ? null : url, permissionsFetcher);

  return {
    resources: data ? data.resources : [],
    isResourcesLoading: !error && !data,
    isResourcesError: error,
  };
}

export function useConnectorConfig({
  owner,
  dataSource,
  configKey,
}: {
  owner: WorkspaceType;
  dataSource: DataSourceType;
  configKey: string;
}) {
  const configFetcher: Fetcher<GetOrPostManagedDataSourceConfigResponseBody> =
    fetcher;

  const url = `/api/w/${owner.sId}/data_sources/${dataSource.name}/managed/config/${configKey}`;

  const { data, error, mutate } = useSWR(url, configFetcher);

  return {
    configValue: data ? data.configValue : null,
    isResourcesLoading: !error && !data,
    isResourcesError: error,
    mutateConfig: mutate,
  };
}

export function useConnector({
  workspaceId,
  dataSourceName,
  refreshInterval,
}: {
  workspaceId: string;
  dataSourceName: string;
  refreshInterval: number;
}) {
  if (refreshInterval < 1000) {
    throw new Error("refreshInterval must be at least 1000ms");
  }
  const configFetcher: Fetcher<GetConnectorResponseBody> = fetcher;

  const url = `/api/w/${workspaceId}/data_sources/${dataSourceName}/connector`;

  const { data, error, mutate } = useSWR(url, configFetcher, {
    refreshInterval,
  });

  return {
    connector: data ? data.connector : null,
    isConnectorLoading: !error && !data,
    isConnectorError: error,
    mutateConnector: mutate,
  };
}

export function useExtractedEvents({
  owner,
  schemaSId,
}: {
  owner: WorkspaceType;
  schemaSId: string;
}) {
  const extractedEventFetcher: Fetcher<GetExtractedEventsResponseBody> =
    fetcher;

  const { data, error } = useSWR(
    `/api/w/${owner.sId}/use/extract/templates/${schemaSId}/events`,
    extractedEventFetcher
  );

  return {
    events: useMemo(() => (data ? data.events : []), [data]),
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
    workspaces: useMemo(() => (data ? data.workspaces : []), [data]),
    isWorkspacesLoading: !error && !data,
    isWorkspacesError: error,
  };
}

export function usePokePlans() {
  const plansFetcher: Fetcher<GetPokePlansResponseBody> = fetcher;

  const { data, error } = useSWR("/api/poke/plans", plansFetcher);

  return {
    plans: useMemo(() => (data ? data.plans : []), [data]),
    isPlansLoading: !error && !data,
    isPlansError: error,
  };
}

export function useConversation({
  conversationId,
  workspaceId,
}: {
  conversationId: string;
  workspaceId: string;
}) {
  const conversationFetcher: Fetcher<{ conversation: ConversationType }> =
    fetcher;

  const { data, error, mutate } = useSWR(
    `/api/w/${workspaceId}/assistant/conversations/${conversationId}`,
    conversationFetcher
  );

  return {
    conversation: data ? data.conversation : null,
    isConversationLoading: !error && !data,
    isConversationError: error,
    mutateConversation: mutate,
  };
}

export function useConversations({ workspaceId }: { workspaceId: string }) {
  const conversationFetcher: Fetcher<{ conversations: ConversationType[] }> =
    fetcher;

  const { data, error, mutate } = useSWR(
    `/api/w/${workspaceId}/assistant/conversations`,
    conversationFetcher
  );

  return {
    conversations: useMemo(() => (data ? data.conversations : []), [data]),
    isConversationsLoading: !error && !data,
    isConversationsError: error,
    mutateConversations: mutate,
  };
}

export function useConversationReactions({
  conversationId,
  workspaceId,
}: {
  conversationId: string;
  workspaceId: string;
}) {
  const conversationReactionsFetcher: Fetcher<{
    reactions: ConversationMessageReactions;
  }> = fetcher;

  const { data, error, mutate } = useSWR(
    `/api/w/${workspaceId}/assistant/conversations/${conversationId}/reactions`,
    conversationReactionsFetcher
  );

  return {
    reactions: useMemo(() => (data ? data.reactions : []), [data]),
    isReactionsLoading: !error && !data,
    isReactionsError: error,
    mutateReactions: mutate,
  };
}

/*
 * Agent configurations. A null agentsGetView means no fetching
 */
export function useAgentConfigurations({
  workspaceId,
  agentsGetView,
  includes = [],
  limit,
  sort,
}: {
  workspaceId: string;
  agentsGetView: AgentsGetViewType | null;
  includes?: ("authors" | "usage")[];
  limit?: number;
  sort?: "alphabetical" | "priority";
}) {
  const agentConfigurationsFetcher: Fetcher<GetAgentConfigurationsResponseBody> =
    fetcher;

  // Function to generate query parameters.
  function getQueryString() {
    const params = new URLSearchParams();
    if (typeof agentsGetView === "string") {
      params.append("view", agentsGetView);
    } else {
      if (agentsGetView && "conversationId" in agentsGetView) {
        params.append("conversationId", agentsGetView.conversationId);
      }
    }
    if (includes.includes("usage")) {
      params.append("withUsage", "true");
    }
    if (includes.includes("authors")) {
      params.append("withAuthors", "true");
    }

    if (limit) {
      params.append("limit", limit.toString());
    }

    if (sort) {
      params.append("sort", sort);
    }

    return params.toString();
  }

  const queryString = getQueryString();
  const { data, error, mutate } = useSWR(
    agentsGetView
      ? `/api/w/${workspaceId}/assistant/agent_configurations?${queryString}`
      : null,
    agentConfigurationsFetcher
  );

  return {
    agentConfigurations: useMemo(
      () => (data ? data.agentConfigurations : []),
      [data]
    ),
    isAgentConfigurationsLoading: !error && !data,
    isAgentConfigurationsError: error,
    mutateAgentConfigurations: mutate,
  };
}

export function useAgentConfiguration({
  workspaceId,
  agentConfigurationId,
}: {
  workspaceId: string;
  agentConfigurationId: string | null;
}) {
  const agentConfigurationFetcher: Fetcher<{
    agentConfiguration: AgentConfigurationType;
  }> = fetcher;

  const { data, error, mutate } = useSWR(
    agentConfigurationId
      ? `/api/w/${workspaceId}/assistant/agent_configurations/${agentConfigurationId}`
      : null,
    agentConfigurationFetcher
  );

  return {
    agentConfiguration: data ? data.agentConfiguration : null,
    isAgentConfigurationLoading: !error && !data,
    isAgentConfigurationError: error,
    mutateAgentConfiguration: mutate,
  };
}

export function useAgentUsage({
  workspaceId,
  agentConfigurationId,
}: {
  workspaceId: string;
  agentConfigurationId: string | null;
}) {
  const agentUsageFetcher: Fetcher<GetAgentUsageResponseBody> = fetcher;
  const fetchUrl = agentConfigurationId
    ? `/api/w/${workspaceId}/assistant/agent_configurations/${agentConfigurationId}/usage`
    : null;
  const { data, error, mutate } = useSWR(fetchUrl, agentUsageFetcher);

  return {
    agentUsage: data ? data.agentUsage : null,
    isAgentUsageLoading: !error && !data,
    isAgentUsageError: error,
    mutateAgentUsage: mutate,
  };
}

export function useSlackChannelsLinkedWithAgent({
  workspaceId,
  dataSourceName,
  disabled,
}: {
  workspaceId: string;
  dataSourceName?: string;
  disabled?: boolean;
}) {
  const slackChannelsLinkedWithAgentFetcher: Fetcher<GetSlackChannelsLinkedWithAgentResponseBody> =
    fetcher;

  const { data, error, mutate } = useSWR(
    dataSourceName && !disabled
      ? `/api/w/${workspaceId}/data_sources/${dataSourceName}/managed/slack/channels_linked_with_agent`
      : null,
    slackChannelsLinkedWithAgentFetcher
  );

  return {
    slackChannels: useMemo(() => (data ? data.slackChannels : []), [data]),
    isSlackChannelsLoading: !error && !data,
    isSlackChannelsError: error,
    mutateSlackChannels: mutate,
  };
}

export function useTables({
  workspaceId,
  dataSourceName,
}: {
  workspaceId: string;
  dataSourceName: string;
}) {
  const tablesFetcher: Fetcher<ListTablesResponseBody> = fetcher;

  const { data, error, mutate } = useSWR(
    dataSourceName
      ? `/api/w/${workspaceId}/data_sources/${dataSourceName}/tables`
      : null,
    tablesFetcher
  );

  return {
    tables: useMemo(() => (data ? data.tables : []), [data]),
    isTablesLoading: !error && !data,
    isTablesError: error,
    mutateTables: mutate,
  };
}

export function useTable({
  workspaceId,
  dataSourceName,
  tableId,
}: {
  workspaceId: string;
  dataSourceName: string;
  tableId: string | null;
}) {
  const tableFetcher: Fetcher<GetTableResponseBody> = fetcher;

  const { data, error, mutate } = useSWR(
    tableId
      ? `/api/w/${workspaceId}/data_sources/${dataSourceName}/tables/${tableId}`
      : null,
    tableFetcher
  );

  return {
    table: data ? data.table : null,
    isTableLoading: !error && !data,
    isTableError: error,
    mutateTable: mutate,
  };
}

export function useApp({
  workspaceId,
  appId,
}: {
  workspaceId: string;
  appId: string;
}) {
  const appFetcher: Fetcher<{ app: AppType }> = fetcher;

  const { data, error, mutate } = useSWR(
    `/api/w/${workspaceId}/apps/${appId}`,
    appFetcher
  );

  return {
    app: data ? data.app : null,
    isAppLoading: !error && !data,
    isAppError: error,
    mutateApp: mutate,
  };
}

export function useWorkspaceAnalytics({
  workspaceId,
  disabled,
}: {
  workspaceId: string;
  disabled?: boolean;
}) {
  const analyticsFetcher: Fetcher<GetWorkspaceAnalyticsResponse> = fetcher;

  const { data, error } = useSWR(
    !disabled ? `/api/w/${workspaceId}/workspace-analytics` : null,
    analyticsFetcher
  );

  return {
    analytics: data ? data : null,
    isMemberCountLoading: !error && !data,
    isMemberCountError: error,
  };
}
