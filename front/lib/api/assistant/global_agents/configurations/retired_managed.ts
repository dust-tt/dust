import type { MCPServerConfigurationType } from "@app/lib/actions/mcp";
import { getGlobalAgentMetadata } from "@app/lib/api/assistant/global_agents/global_agent_metadata";
import { BREVITY_PROMPT } from "@app/lib/api/assistant/global_agents/guidelines";
import type { PrefetchedDataSourcesType } from "@app/lib/api/assistant/global_agents/tools";
import { dummyModelConfiguration } from "@app/lib/api/assistant/global_agents/utils";
import type { Authenticator } from "@app/lib/auth";
import type { GlobalAgentSettings } from "@app/lib/models/assistant/agent";
import type { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import type {
  AgentConfigurationType,
  AgentModelConfigurationType,
  ConnectorProvider,
} from "@app/types";
import {
  getLargeWhitelistedModel,
  getSmallWhitelistedModel,
  GLOBAL_AGENTS_SID,
} from "@app/types";

function _getManagedDataSourceAgent(
  auth: Authenticator,
  {
    settings,
    connectorProvider,
    agentId,
    name,
    description,
    instructions,
    pictureUrl,
    preFetchedDataSources,
    searchMCPServerView,
  }: {
    settings: GlobalAgentSettings | null;
    connectorProvider: ConnectorProvider;
    agentId: GLOBAL_AGENTS_SID;
    name: string;
    description: string;
    instructions: string | null;
    pictureUrl: string;
    preFetchedDataSources: PrefetchedDataSourcesType | null;
    searchMCPServerView: MCPServerViewResource | null;
  }
): AgentConfigurationType | null {
  const owner = auth.getNonNullableWorkspace();

  const modelConfiguration = auth.isUpgraded()
    ? getLargeWhitelistedModel(owner)
    : getSmallWhitelistedModel(owner);

  const model: AgentModelConfigurationType = modelConfiguration
    ? {
        providerId: modelConfiguration.providerId,
        modelId: modelConfiguration.modelId,
        temperature: 0.7,
        reasoningEffort: modelConfiguration.defaultReasoningEffort,
      }
    : dummyModelConfiguration;

  const agent = {
    id: -1,
    sId: agentId,
    version: 0,
    versionCreatedAt: null,
    versionAuthorId: null,
    name: name,
    description,
    instructions,
    pictureUrl,
    scope: "global" as const,
    userFavorite: false,
    model,
    visualizationEnabled: false,
    templateId: null,
    requestedGroupIds: [],
    tags: [],
    canRead: true,
    canEdit: false,
  };

  // Check if deactivated by an admin
  if (
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    (settings && settings.status === "disabled_by_admin") ||
    !modelConfiguration
  ) {
    return {
      ...agent,
      status: "disabled_by_admin",
      maxStepsPerRun: 0,
      actions: [],
    };
  }

  if (!preFetchedDataSources) {
    return {
      ...agent,
      status: "active",
      actions: [],
      maxStepsPerRun: 1,
    };
  }

  // Check if there's a data source view for this agent
  const filteredDataSourceViews = preFetchedDataSources.dataSourceViews.filter(
    (dsView) => dsView.dataSource.connectorProvider === connectorProvider
  );

  if (filteredDataSourceViews.length === 0) {
    return {
      ...agent,
      status: "disabled_missing_datasource",
      actions: [],
      maxStepsPerRun: 0,
    };
  }

  const actions: MCPServerConfigurationType[] = [];
  if (searchMCPServerView) {
    actions.push({
      id: -1,
      sId: agentId + "-search-action",
      type: "mcp_server_configuration",
      name: "search_data_sources",
      description: `The user's ${connectorProvider} data source.`,
      mcpServerViewId: searchMCPServerView.sId,
      internalMCPServerId: searchMCPServerView.internalMCPServerId,
      dataSources: filteredDataSourceViews.map((dsView) => ({
        dataSourceViewId: dsView.sId,
        workspaceId: preFetchedDataSources.workspaceId,
        filter: { tags: null, parents: null },
      })),
      tables: null,
      childAgentId: null,
      reasoningModel: null,
      additionalConfiguration: {},
      timeFrame: null,
      dustAppConfiguration: null,
      jsonSchema: null,
    });
  }

  return {
    ...agent,
    status: "active",
    actions,
    maxStepsPerRun: 1,
  };
}

export function _getGoogleDriveGlobalAgent(
  auth: Authenticator,
  {
    settings,
    preFetchedDataSources,
    searchMCPServerView,
  }: {
    settings: GlobalAgentSettings | null;
    preFetchedDataSources: PrefetchedDataSourcesType | null;
    searchMCPServerView: MCPServerViewResource | null;
  }
): AgentConfigurationType | null {
  const agentId = GLOBAL_AGENTS_SID.GOOGLE_DRIVE;
  const metadata = getGlobalAgentMetadata(GLOBAL_AGENTS_SID.GOOGLE_DRIVE);

  return _getManagedDataSourceAgent(auth, {
    settings,
    connectorProvider: "google_drive",
    agentId,
    name: metadata.name,
    description: metadata.description,
    pictureUrl: metadata.pictureUrl,
    instructions:
      "Assist the user based on the retrieved data from their Google Drives." +
      `\n${BREVITY_PROMPT}`,
    preFetchedDataSources,
    searchMCPServerView,
  });
}

export function _getSlackGlobalAgent(
  auth: Authenticator,
  {
    settings,
    preFetchedDataSources,
    searchMCPServerView,
  }: {
    settings: GlobalAgentSettings | null;
    preFetchedDataSources: PrefetchedDataSourcesType | null;
    searchMCPServerView: MCPServerViewResource | null;
  }
) {
  const agentId = GLOBAL_AGENTS_SID.SLACK;
  const metadata = getGlobalAgentMetadata(agentId);

  return _getManagedDataSourceAgent(auth, {
    settings,
    connectorProvider: "slack",
    agentId,
    name: metadata.name,
    description: metadata.description,
    pictureUrl: metadata.pictureUrl,
    instructions:
      "Assist the user based on the retrieved data from their Slack channels." +
      `\n${BREVITY_PROMPT}`,
    preFetchedDataSources,
    searchMCPServerView,
  });
}

export function _getGithubGlobalAgent(
  auth: Authenticator,
  {
    settings,
    preFetchedDataSources,
    searchMCPServerView,
  }: {
    settings: GlobalAgentSettings | null;
    preFetchedDataSources: PrefetchedDataSourcesType | null;
    searchMCPServerView: MCPServerViewResource | null;
  }
) {
  const agentId = GLOBAL_AGENTS_SID.GITHUB;
  const metadata = getGlobalAgentMetadata(agentId);

  return _getManagedDataSourceAgent(auth, {
    settings,
    connectorProvider: "github",
    agentId,
    name: metadata.name,
    description: metadata.description,
    pictureUrl: metadata.pictureUrl,
    instructions:
      "Assist the user based on the retrieved data from their Github Issues and Discussions." +
      `\n${BREVITY_PROMPT}`,
    preFetchedDataSources,
    searchMCPServerView,
  });
}

export function _getNotionGlobalAgent(
  auth: Authenticator,
  {
    settings,
    preFetchedDataSources,
    searchMCPServerView,
  }: {
    settings: GlobalAgentSettings | null;
    preFetchedDataSources: PrefetchedDataSourcesType | null;
    searchMCPServerView: MCPServerViewResource | null;
  }
) {
  const agentId = GLOBAL_AGENTS_SID.NOTION;
  const metadata = getGlobalAgentMetadata(agentId);

  return _getManagedDataSourceAgent(auth, {
    settings,
    connectorProvider: "notion",
    agentId: GLOBAL_AGENTS_SID.NOTION,
    name: metadata.name,
    description: metadata.description,
    pictureUrl: metadata.pictureUrl,
    instructions:
      "Assist the user based on the retrieved data from their Notion Spaces." +
      `\n${BREVITY_PROMPT}`,
    preFetchedDataSources,
    searchMCPServerView,
  });
}

export function _getIntercomGlobalAgent(
  auth: Authenticator,
  {
    settings,
    preFetchedDataSources,
    searchMCPServerView,
  }: {
    settings: GlobalAgentSettings | null;
    preFetchedDataSources: PrefetchedDataSourcesType | null;
    searchMCPServerView: MCPServerViewResource | null;
  }
) {
  const agentId = GLOBAL_AGENTS_SID.INTERCOM;
  const metadata = getGlobalAgentMetadata(agentId);

  return _getManagedDataSourceAgent(auth, {
    settings,
    connectorProvider: "intercom",
    agentId,
    name: metadata.name,
    description: metadata.description,
    pictureUrl: metadata.pictureUrl,
    instructions:
      "Assist the user based on the retrieved data from their Intercom Workspace." +
      `\n${BREVITY_PROMPT}`,
    preFetchedDataSources,
    searchMCPServerView,
  });
}
