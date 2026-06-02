import {
  convertActionsForFormData,
  transformAgentConfigurationToFormData,
} from "@app/components/agent_builder/transformAgentConfiguration";
import {
  buildInitialActions,
  getAccessibleSourcesAndAppsForActions,
} from "@app/lib/agent_builder/server_side_props_helpers";
import { AgentYAMLConverter } from "@app/lib/agent_yaml_converter/converter";
import type { AgentYAMLConfig } from "@app/lib/agent_yaml_converter/schemas";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import logger from "@app/logger/logger";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import { ConnectorsAPI } from "@app/types/connectors/connectors_api";
import type { APIErrorWithContentfulStatusCode } from "@app/types/error";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { UserType } from "@app/types/user";

const AGENT_NAME_SANITATION_REGEX = /[^a-zA-Z0-9-_]/g;

export type ExportableAgentConfiguration = AgentConfigurationType & {
  scope: Exclude<AgentConfigurationType["scope"], "global">;
  status: "active";
};

type AgentConfigurationYAMLContext = {
  agentConfiguration: ExportableAgentConfiguration;
  editorUsers: UserResource[];
  skills: SkillResource[];
};

function isExportableAgentConfiguration(
  agentConfiguration: AgentConfigurationType
): agentConfiguration is ExportableAgentConfiguration {
  return (
    agentConfiguration.status === "active" &&
    agentConfiguration.scope !== "global"
  );
}

export async function getExportableAgentConfiguration(
  auth: Authenticator,
  agentId: string
): Promise<
  Result<ExportableAgentConfiguration, APIErrorWithContentfulStatusCode>
> {
  const agentConfiguration = await getAgentConfiguration(auth, {
    agentId,
    variant: "full",
  });

  if (!agentConfiguration || (!agentConfiguration.canRead && !auth.isAdmin())) {
    return new Err({
      status_code: 404,
      api_error: {
        type: "agent_configuration_not_found",
        message: "The agent configuration you requested was not found.",
      },
    });
  }

  if (!isExportableAgentConfiguration(agentConfiguration)) {
    return new Err({
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Cannot export archived or global agents.",
      },
    });
  }

  return new Ok(agentConfiguration);
}

export async function getAgentConfigurationYAMLContext(
  auth: Authenticator,
  agentId: string,
  { requireEditorGroup = false }: { requireEditorGroup?: boolean } = {}
): Promise<
  Result<AgentConfigurationYAMLContext, APIErrorWithContentfulStatusCode>
> {
  const agentResult = await getExportableAgentConfiguration(auth, agentId);
  if (agentResult.isErr()) {
    return agentResult;
  }

  const agentConfiguration = agentResult.value;

  const skills = await SkillResource.listByAgentConfiguration(
    auth,
    agentConfiguration
  );
  const editorsResult = await GroupResource.findEditorGroupForAgent(
    auth,
    agentConfiguration
  );

  if (editorsResult.isErr()) {
    if (requireEditorGroup) {
      return new Err({
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: `Unable to resolve existing agent editors: ${editorsResult.error.message}`,
        },
      });
    }

    return new Ok({
      agentConfiguration,
      editorUsers: [],
      skills,
    });
  }

  return new Ok({
    agentConfiguration,
    editorUsers: await editorsResult.value.getActiveMembers(auth),
    skills,
  });
}

export async function getAgentConfigurationAsYAMLConfig(
  auth: Authenticator,
  agentId: string
): Promise<Result<AgentYAMLConfig, APIErrorWithContentfulStatusCode>> {
  const contextResult = await getAgentConfigurationYAMLContext(auth, agentId);
  if (contextResult.isErr()) {
    return contextResult;
  }

  const { agentConfiguration, editorUsers, skills } = contextResult.value;

  const { dataSourceViews, mcpServerViews } =
    await getAccessibleSourcesAndAppsForActions(auth);
  const spaceResources = await SpaceResource.fetchByIds(
    auth,
    agentConfiguration.requestedSpaceIds
  );

  const spaces = spaceResources.map((space) => ({
    space_id: space.sId,
    name: space.name,
  }));

  const mcpServerViewsJSON = mcpServerViews.map((v) => v.toJSON());

  const actions = await buildInitialActions({
    dataSourceViews,
    configuration: agentConfiguration,
    mcpServerViews: mcpServerViewsJSON,
  });

  const editors: UserType[] = editorUsers.map((m) => m.toJSON());

  let slackProvider: "slack" | "slack_bot" | null = null;
  let slackChannels: { slackChannelId: string; slackChannelName: string }[] =
    [];

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
        .filter((ch) => ch.agentConfigurationId === agentConfiguration.sId)
        .map((ch) => ({
          slackChannelId: ch.slackChannelId,
          slackChannelName: ch.slackChannelName,
        }));
    }
  }

  const baseFormData =
    transformAgentConfigurationToFormData(agentConfiguration);
  const formData = {
    ...baseFormData,
    actions: convertActionsForFormData(actions),
    skills: skills.map((s) => {
      const json = s.toJSON(auth);
      return {
        sId: json.sId,
        name: json.name,
        description: json.userFacingDescription,
        icon: json.icon,
        visibility: json.visibility,
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
