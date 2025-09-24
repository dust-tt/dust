import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";
import _ from "lodash";
import type { NextApiRequest, NextApiResponse } from "next";

import { DEFAULT_MCP_ACTION_DESCRIPTION } from "@app/lib/actions/constants";
import type { ServerSideMCPServerConfigurationType } from "@app/lib/actions/mcp";
import type { MCPServerConfigurationType } from "@app/lib/actions/mcp";
import { getAgentsUsage } from "@app/lib/api/assistant/agent_usage";
import { createAgentActionConfiguration } from "@app/lib/api/assistant/configuration/actions";
import {
  createAgentConfiguration,
  unsafeHardDeleteAgentConfiguration,
} from "@app/lib/api/assistant/configuration/agent";
import { getAgentConfigurationsForView } from "@app/lib/api/assistant/configuration/views";
import { getAgentsEditors } from "@app/lib/api/assistant/editors";
import { getAgentConfigurationGroupIdsFromActions } from "@app/lib/api/assistant/permissions";
import { getAgentsRecentAuthors } from "@app/lib/api/assistant/recent_authors";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { runOnRedis } from "@app/lib/api/redis";
import type { Authenticator } from "@app/lib/auth";
import { AgentMessageFeedbackResource } from "@app/lib/resources/agent_message_feedback_resource";
import { KillSwitchResource } from "@app/lib/resources/kill_switch_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { ServerSideTracking } from "@app/lib/tracking/server";
import { apiError } from "@app/logger/withlogging";
import type {
  AgentConfigurationType,
  LightAgentConfigurationType,
  PostOrPatchAgentConfigurationRequestBody,
  Result,
  WithAPIErrorResponse,
} from "@app/types";
import {
  Err,
  GetAgentConfigurationsQuerySchema,
  Ok,
  PostOrPatchAgentConfigurationRequestBodySchema,
} from "@app/types";

export type GetAgentConfigurationsResponseBody = {
  agentConfigurations: LightAgentConfigurationType[];
};
export type PostAgentConfigurationResponseBody = {
  agentConfiguration: LightAgentConfigurationType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      | GetAgentConfigurationsResponseBody
      | PostAgentConfigurationResponseBody
      | void
    >
  >,
  auth: Authenticator
): Promise<void> {
  const owner = auth.getNonNullableWorkspace();

  switch (req.method) {
    case "GET":
      // extract the view from the query parameters
      const queryValidation = GetAgentConfigurationsQuerySchema.decode({
        ...req.query,
        limit:
          typeof req.query.limit === "string"
            ? parseInt(req.query.limit, 10)
            : undefined,
      });
      if (isLeft(queryValidation)) {
        const pathError = reporter.formatValidationErrors(queryValidation.left);
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid query parameters: ${pathError}`,
          },
        });
      }

      const {
        view,
        limit,
        withUsage,
        withAuthors,
        withFeedbacks,
        withEditors,
        sort,
      } = queryValidation.right;
      let viewParam = view ? view : "all";
      // @ts-expect-error: added for backwards compatibility
      viewParam = viewParam === "assistant-search" ? "list" : viewParam;
      if (viewParam === "admin_internal" && !auth.isDustSuperUser()) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "app_auth_error",
            message: "Only Dust Super Users can see admin_internal agents.",
          },
        });
      }
      let agentConfigurations = await getAgentConfigurationsForView({
        auth,
        agentsGetView:
          viewParam === "workspace"
            ? "published" // workspace is deprecated, return all visible agents
            : viewParam,
        variant: "light",
        limit,
        sort,
      });
      if (withUsage === "true") {
        const mentionCounts = await runOnRedis(
          { origin: "agent_usage" },
          async (redis) => {
            return getAgentsUsage({
              providedRedis: redis,
              workspaceId: owner.sId,
              limit:
                typeof req.query.limit === "string"
                  ? parseInt(req.query.limit, 10)
                  : -1,
            });
          }
        );
        const usageMap = _.keyBy(mentionCounts, "agentId");
        agentConfigurations = agentConfigurations.map((agentConfiguration) =>
          usageMap[agentConfiguration.sId]
            ? {
                ...agentConfiguration,
                usage: _.omit(usageMap[agentConfiguration.sId], ["agentId"]),
              }
            : agentConfiguration
        );
      }
      if (withAuthors === "true") {
        const recentAuthors = await getAgentsRecentAuthors({
          auth,
          agents: agentConfigurations,
        });
        agentConfigurations = agentConfigurations.map(
          (agentConfiguration, index) => {
            return {
              ...agentConfiguration,
              lastAuthors: recentAuthors[index],
            };
          }
        );
      }

      if (withEditors === "true") {
        const editors = await getAgentsEditors(auth, agentConfigurations);
        agentConfigurations = agentConfigurations.map((agentConfiguration) => ({
          ...agentConfiguration,
          editors: editors[agentConfiguration.sId],
        }));
      }

      if (withFeedbacks === "true") {
        const feedbacks =
          await AgentMessageFeedbackResource.getFeedbackCountForAssistants(
            auth,
            agentConfigurations
              .filter((agent) => agent.scope !== "global")
              .map((agent) => agent.sId),
            30
          );
        agentConfigurations = agentConfigurations.map((agentConfiguration) => ({
          ...agentConfiguration,
          feedbacks: {
            up:
              feedbacks.find(
                (f) =>
                  f.agentConfigurationId === agentConfiguration.sId &&
                  f.thumbDirection === "up"
              )?.count ?? 0,
            down:
              feedbacks.find(
                (f) =>
                  f.agentConfigurationId === agentConfiguration.sId &&
                  f.thumbDirection === "down"
              )?.count ?? 0,
          },
        }));
      }

      return res.status(200).json({
        agentConfigurations,
      });
    case "POST":
      const killSwitches = await KillSwitchResource.listEnabledKillSwitches();
      if (killSwitches?.includes("save_agent_configurations")) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "app_auth_error",
            message:
              "Saving agent configurations is temporarily disabled, try again later.",
          },
        });
      }
      const bodyValidation =
        PostOrPatchAgentConfigurationRequestBodySchema.decode(req.body);
      if (isLeft(bodyValidation)) {
        const pathError = reporter.formatValidationErrors(bodyValidation.left);
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${pathError}`,
          },
        });
      }

      const agentConfigurationRes = await createOrUpgradeAgentConfiguration({
        auth,
        assistant: bodyValidation.right.assistant,
      });

      if (agentConfigurationRes.isErr()) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "assistant_saving_error",
            message: `Error saving agent: ${agentConfigurationRes.error.message}`,
          },
        });
      }

      return res.status(200).json({
        agentConfiguration: agentConfigurationRes.value,
      });

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET OR POST is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);

/**
 * Create Or Upgrade Agent Configuration If an agentConfigurationId is provided, it will create a
 * new version of the agent configuration with the same agentConfigurationId. If no
 * agentConfigurationId is provided, it will create a new agent configuration. In both cases, it
 * will return the new agent configuration.
 **/
export async function createOrUpgradeAgentConfiguration({
  auth,
  assistant,
  agentConfigurationId,
}: {
  auth: Authenticator;
  assistant: PostOrPatchAgentConfigurationRequestBody["assistant"];
  agentConfigurationId?: string;
}): Promise<Result<AgentConfigurationType, Error>> {
  const { actions } = assistant;

  // Tools mode:
  // Enforce that every action has a name and a description and that every name is unique.
  if (actions.length > 1) {
    const actionsWithoutName = actions.filter((action) => !action.name);
    if (actionsWithoutName.length) {
      return new Err(
        Error(
          `Every action must have a name. Missing names for: ${actionsWithoutName
            .map((action) => action.type)
            .join(", ")}`
        )
      );
    }
    const actionNames = new Set<string>();
    for (const action of actions) {
      if (!action.name) {
        // To please the type system.
        throw new Error(`unreachable: action.name is required.`);
      }
      if (actionNames.has(action.name)) {
        return new Err(new Error(`Duplicate action name: ${action.name}`));
      }
      actionNames.add(action.name);
    }
    const actionsWithoutDesc = actions.filter((action) => !action.description);
    if (actionsWithoutDesc.length) {
      return new Err(
        Error(
          `Every action must have a description. Missing descriptions for: ${actionsWithoutDesc
            .map((action) => action.type)
            .join(", ")}`
        )
      );
    }
  }

  const editors = (
    await UserResource.fetchByIds(assistant.editors.map((e) => e.sId))
  ).map((e) => e.toJSON());

  const agentConfigurationRes = await createAgentConfiguration(auth, {
    name: assistant.name,
    description: assistant.description,
    instructions: assistant.instructions ?? null,
    visualizationEnabled: assistant.visualizationEnabled,
    pictureUrl: assistant.pictureUrl,
    status: assistant.status,
    scope: assistant.scope,
    model: assistant.model,
    agentConfigurationId,
    templateId: assistant.templateId ?? null,
    requestedGroupIds: await getAgentConfigurationGroupIdsFromActions(auth, {
      actions,
    }),
    tags: assistant.tags,
    editors,
  });

  if (agentConfigurationRes.isErr()) {
    return agentConfigurationRes;
  }

  const actionConfigs: MCPServerConfigurationType[] = [];

  for (const action of actions) {
    const res = await createAgentActionConfiguration(
      auth,
      {
        type: "mcp_server_configuration",
        name: action.name,
        description: action.description ?? DEFAULT_MCP_ACTION_DESCRIPTION,
        mcpServerViewId: action.mcpServerViewId,
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        dataSources: action.dataSources || null,
        reasoningModel: action.reasoningModel,
        tables: action.tables,
        childAgentId: action.childAgentId,
        additionalConfiguration: action.additionalConfiguration,
        dustAppConfiguration: action.dustAppConfiguration,
        secretName: action.secretName,
        timeFrame: action.timeFrame,
        jsonSchema: action.jsonSchema,
      } as ServerSideMCPServerConfigurationType,
      agentConfigurationRes.value
    );
    if (res.isErr()) {
      // If we fail to create an action, we should delete the agent configuration
      // we just created and re-throw the error.
      await unsafeHardDeleteAgentConfiguration(agentConfigurationRes.value);
      return res;
    }
    actionConfigs.push(res.value);
  }

  const agentConfiguration: AgentConfigurationType = {
    ...agentConfigurationRes.value,
    actions: actionConfigs,
  };

  // We are not tracking draft agents
  if (agentConfigurationRes.value.status === "active") {
    void ServerSideTracking.trackAssistantCreated({
      user: auth.user() ?? undefined,
      workspace: auth.workspace() ?? undefined,
      assistant: agentConfiguration,
    });
  }

  return new Ok(agentConfiguration);
}
