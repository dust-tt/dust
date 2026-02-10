import type { NextApiRequest, NextApiResponse } from "next";

import {
  convertActionsForFormData,
  transformAgentConfigurationToFormData,
} from "@app/components/agent_builder/transformAgentConfiguration";
import {
  buildInitialActions,
  getAccessibleSourcesAndAppsForActions,
} from "@app/lib/agent_builder/server_side_props_helpers";
import { AgentYAMLConverter } from "@app/lib/agent_yaml_converter/converter";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { UserType, WithAPIErrorResponse } from "@app/types";
import { ConnectorsAPI, isString } from "@app/types";

export type GetAgentConfigurationYAMLExportResponseBody = {
  yamlContent: string;
  filename: string;
};

const AGENT_NAME_SANITATION_REGEX = /[^a-zA-Z0-9-_]/g;

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetAgentConfigurationYAMLExportResponseBody>
  >,
  auth: Authenticator
): Promise<void> {
  if (req.method !== "GET") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, GET is expected.",
      },
    });
  }

  const { aId } = req.query;
  if (!isString(aId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid path parameters.",
      },
    });
  }

  const agentConfiguration = await getAgentConfiguration(auth, {
    agentId: aId,
    variant: "full",
  });

  if (!agentConfiguration || (!agentConfiguration.canRead && !auth.isAdmin())) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "agent_configuration_not_found",
        message: "The agent configuration you requested was not found.",
      },
    });
  }

  if (
    agentConfiguration.status !== "active" ||
    agentConfiguration.scope === "global"
  ) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Cannot export archived or global agents.",
      },
    });
  }

  const [{ dataSourceViews, mcpServerViews }, skills, editorsResult] =
    await Promise.all([
      getAccessibleSourcesAndAppsForActions(auth),
      SkillResource.listByAgentConfiguration(auth, agentConfiguration),
      GroupResource.findEditorGroupForAgent(auth, agentConfiguration),
    ]);

  const mcpServerViewsJSON = mcpServerViews.map((v) => v.toJSON());

  const actions = await buildInitialActions({
    dataSourceViews,
    configuration: agentConfiguration,
    mcpServerViews: mcpServerViewsJSON,
  });

  // Fetch editors from the editor group.
  let editors: UserType[] = [];
  if (editorsResult.isOk()) {
    const editorGroup = editorsResult.value;
    const members = await editorGroup.getActiveMembers(auth);
    editors = members.map((m) => m.toJSON());
  }

  // Fetch linked Slack channels for this agent.
  let slackProvider: "slack" | "slack_bot" | null = null;
  let slackChannels: { slackChannelId: string; slackChannelName: string }[] =
    [];

  const [[slackDs], [slackBotDs]] = await Promise.all([
    DataSourceResource.listByConnectorProvider(auth, "slack"),
    DataSourceResource.listByConnectorProvider(auth, "slack_bot"),
  ]);

  const connectorsAPI = new ConnectorsAPI(
    config.getConnectorsAPIConfig(),
    logger
  );

  // Determine which Slack connector is active.
  let slackConnectorId: string | null = null;
  if (slackBotDs?.connectorId) {
    const configRes = await connectorsAPI.getConnectorConfig(
      slackBotDs.connectorId,
      "botEnabled"
    );
    if (configRes.isOk() && configRes.value.configValue === "true") {
      slackProvider = "slack_bot";
      slackConnectorId = slackBotDs.connectorId.toString();
    }
  }
  if (!slackConnectorId && slackDs?.connectorId) {
    slackProvider = "slack";
    slackConnectorId = slackDs.connectorId.toString();
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
    formData
  );

  if (yamlConfigResult.isErr()) {
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: `Error converting agent configuration: ${yamlConfigResult.error.message}`,
      },
    });
  }

  const yamlStringResult = AgentYAMLConverter.toYAMLString(
    yamlConfigResult.value
  );

  if (yamlStringResult.isErr()) {
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: `Error generating YAML string: ${yamlStringResult.error.message}`,
      },
    });
  }

  const sanitizedName = agentConfiguration.name.replace(
    AGENT_NAME_SANITATION_REGEX,
    "_"
  );
  const filename = `${sanitizedName}_agent.yaml`;

  return res.status(200).json({
    yamlContent: yamlStringResult.value,
    filename,
  });
}

export default withSessionAuthenticationForWorkspace(handler);
