import type { MCPServerConfigurationType } from "@app/lib/actions/mcp";
import { isServerSideMCPServerConfiguration } from "@app/lib/actions/types/guards";
import { transformAgentConfigurationToFormData } from "@app/lib/agent_builder/transform_agent_configuration";
import { AgentYAMLConverter } from "@app/lib/agent_yaml_converter/converter";
import type { AgentYAMLConfig } from "@app/lib/agent_yaml_converter/schemas";
import { getAgentConfigurationContext } from "@app/lib/api/assistant/configuration/context";
import { canAdminSeePrivateEntities } from "@app/lib/api/assistant/configuration/private_entities";
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { toAgentConfigurations } from "@app/lib/resources/agent_resource_serialization";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import logger from "@app/logger/logger";
import { ConnectorsAPI } from "@app/types/connectors/connectors_api";
import type { APIErrorWithContentfulStatusCode } from "@app/types/error";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { UserType } from "@app/types/user";

const AGENT_NAME_SANITATION_REGEX = /[^a-zA-Z0-9-_]/g;

/**
 * Checks that the caller can read every data source view used by `actions` (any existing view
 * passes for an admin seeing private entities). Fails with a 404 when a view does not exist and a
 * 403 when the caller cannot read its space.
 */
async function checkActionsDataSourceViewsAccess(
  auth: Authenticator,
  actions: MCPServerConfigurationType[]
): Promise<Result<void, APIErrorWithContentfulStatusCode>> {
  const dataSourceViewIds = actions
    .filter(isServerSideMCPServerConfiguration)
    .flatMap((action) => [
      ...(action.dataSources ?? []),
      ...(action.tables ?? []),
    ])
    .map((configuration) => configuration.dataSourceViewId);

  const dataSourceViews = await DataSourceViewResource.fetchByIds(
    auth,
    dataSourceViewIds
  );
  const foundIds = new Set(dataSourceViews.map((view) => view.sId));
  const missingId = dataSourceViewIds.find((id) => !foundIds.has(id));
  if (missingId) {
    return new Err({
      status_code: 404,
      api_error: {
        type: "data_source_view_not_found",
        message: `Could not find DataSourceView with id ${missingId}`,
      },
    });
  }

  if (
    !(await canAdminSeePrivateEntities(auth)) &&
    dataSourceViews.some((view) => !auth.can("read", view))
  ) {
    return new Err({
      status_code: 403,
      api_error: {
        type: "data_source_auth_error",
        message:
          "This agent uses knowledge from a space you don't have access to, so it can't be exported.",
      },
    });
  }

  return new Ok(undefined);
}

/**
 * @cc [owner:philipperolet,label:security;product] unreadable-space-views
 * When `canAdminSeePrivateEntities(auth)` is true, the export MUST include the data source views used
 * by the agent's tools (`dataSources` and `tables`), whatever their space. Otherwise, it MUST NOT
 * include views from spaces the caller cannot read.
 */
export async function getAgentConfigurationAsYAMLConfig(
  auth: Authenticator,
  agentId: string
): Promise<Result<AgentYAMLConfig, APIErrorWithContentfulStatusCode>> {
  // Admins with the `admin_can_see_private_entities` feature flag export the agents they cannot
  // read too (unpublished, or built on spaces they are not a member of), skills included.
  const seePrivateEntities = await canAdminSeePrivateEntities(auth);
  const contextResult = await getAgentConfigurationContext(auth, agentId, {
    dangerouslySkipPermissionFiltering: seePrivateEntities,
  });
  if (contextResult.isErr()) {
    return contextResult;
  }

  const { agent, editorUsers, skills } = contextResult.value;

  // The export carries the full definition, so it needs the content: a redacted configuration would
  // export empty instructions and tools.
  if (!agent.canViewContent) {
    return new Err({
      status_code: 404,
      api_error: {
        type: "agent_configuration_not_found",
        message: "The agent configuration you requested was not found.",
      },
    });
  }
  const [agentConfiguration] = await toAgentConfigurations(auth, [agent]);

  const spaceResources = await SpaceResource.fetchByModelIds(auth, [
    ...agent.requestedSpaceModelIds(),
  ]);

  const spaces = spaceResources.map((space) => ({
    space_id: space.sId,
    name: space.name,
  }));

  const accessResult = await checkActionsDataSourceViewsAccess(
    auth,
    agentConfiguration.actions
  );
  if (accessResult.isErr()) {
    return accessResult;
  }

  const editors: UserType[] = editorUsers.map((m) => m.toJSON());

  let slackProvider: "slack" | "slack_bot" | null = null;
  let slackChannels: {
    slackChannelId: string;
    slackChannelName: string;
    isPrivate: boolean;
  }[] = [];

  const [slackDs] = await DataSourceResource.listByConnectorProvider(
    auth,
    "slack"
  );
  const [slackBotDs] = await DataSourceResource.listByConnectorProvider(
    auth,
    "slack_bot"
  );

  const connectorsAPI = new ConnectorsAPI(
    config.getConnectorsAPIConfig(),
    logger
  );

  let slackConnectorId: string | null = null;
  if (slackBotDs?.connectorId) {
    const configRes = await connectorsAPI.getConnectorConfig(
      slackBotDs.connectorId,
      "botEnabled"
    );
    if (configRes.isOk() && configRes.value.configValue === "true") {
      slackProvider = "slack_bot";
      slackConnectorId = slackBotDs.connectorId;
    }
  }
  if (!slackConnectorId && slackDs?.connectorId) {
    slackProvider = "slack";
    slackConnectorId = slackDs.connectorId;
  }

  if (slackConnectorId) {
    const linkedRes = await connectorsAPI.getSlackChannelsLinkedWithAgent({
      connectorId: slackConnectorId,
    });
    if (linkedRes.isOk()) {
      slackChannels = linkedRes.value.slackChannels
        .filter((ch) => ch.agentConfigurationId === agent.sId)
        .map((ch) => ({
          slackChannelId: ch.slackChannelId,
          slackChannelName: ch.slackChannelName,
          isPrivate: ch.isPrivate,
        }));
    }
  }

  const baseFormData =
    transformAgentConfigurationToFormData(agentConfiguration);
  const formData = {
    ...baseFormData,
    skills: skills.map((s) => {
      const json = s.toJSON(auth);
      return {
        sId: json.sId,
        name: json.name,
        description: json.userFacingDescription,
        icon: json.icon,
        availability: json.availability,
        requestedSpaceIds: json.requestedSpaceIds,
        canWrite: json.canWrite,
      };
    }),
    agentSettings: {
      ...baseFormData.agentSettings,
      editors,
      slackProvider,
      slackChannels,
    },
  };

  const yamlConfigResult = await AgentYAMLConverter.fromBuilderFormData(
    auth,
    formData,
    agentConfiguration.actions,
    spaces
  );

  if (yamlConfigResult.isErr()) {
    return new Err({
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: `Error converting agent configuration: ${yamlConfigResult.error.message}`,
      },
    });
  }

  return new Ok(yamlConfigResult.value);
}

export async function exportAgentConfigurationAsYAML(
  auth: Authenticator,
  agentId: string
): Promise<
  Result<
    { yamlContent: string; filename: string },
    APIErrorWithContentfulStatusCode
  >
> {
  const yamlConfigResult = await getAgentConfigurationAsYAMLConfig(
    auth,
    agentId
  );

  if (yamlConfigResult.isErr()) {
    return yamlConfigResult;
  }

  const yamlStringResult = AgentYAMLConverter.toYAMLString(
    yamlConfigResult.value
  );

  if (yamlStringResult.isErr()) {
    return new Err({
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: `Error generating YAML string: ${yamlStringResult.error.message}`,
      },
    });
  }

  const sanitizedName = yamlConfigResult.value.agent.handle.replace(
    AGENT_NAME_SANITATION_REGEX,
    "_"
  );
  const filename = `${sanitizedName}_agent.yaml`;

  return new Ok({
    yamlContent: yamlStringResult.value,
    filename,
  });
}
