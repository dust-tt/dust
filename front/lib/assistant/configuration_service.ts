import type { Transaction } from "sequelize";

import { DEFAULT_MCP_ACTION_DESCRIPTION } from "@app/lib/actions/constants";
import type { ServerSideMCPServerConfigurationType } from "@app/lib/actions/mcp";
import type { AgentActionConfigurationType } from "@app/lib/actions/types/agent";
import {
  createAgentActionConfiguration,
  createAgentConfiguration,
  unsafeHardDeleteAgentConfiguration,
} from "@app/lib/api/assistant/configuration";
import { getAgentConfigurationGroupIdsFromActions } from "@app/lib/api/assistant/permissions";
import type { Authenticator } from "@app/lib/auth";
import { AppResource } from "@app/lib/resources/app_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { ServerSideTracking } from "@app/lib/tracking/server";
import type {
  AgentConfigurationType,
  PostOrPatchAgentConfigurationRequestBody,
  Result,
} from "@app/types";
import { assertNever, Err, Ok } from "@app/types";

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
  transaction,
}: {
  auth: Authenticator;
  assistant: PostOrPatchAgentConfigurationRequestBody["assistant"];
  agentConfigurationId?: string;
  transaction?: Transaction;
}): Promise<Result<AgentConfigurationType, Error>> {
  const { actions } = assistant;

  const maxStepsPerRun = assistant.maxStepsPerRun ?? actions.length;

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

  const agentConfigurationRes = await createAgentConfiguration(
    auth,
    {
      name: assistant.name,
      description: assistant.description,
      instructions: assistant.instructions ?? null,
      maxStepsPerRun,
      visualizationEnabled: assistant.visualizationEnabled,
      pictureUrl: assistant.pictureUrl,
      status: assistant.status,
      scope: assistant.scope,
      model: assistant.model,
      agentConfigurationId,
      templateId: assistant.templateId ?? null,
      requestedGroupIds: await getAgentConfigurationGroupIdsFromActions(
        auth,
        actions
      ),
      tags: assistant.tags,
      editors,
    },
    transaction
  );

  if (agentConfigurationRes.isErr()) {
    return agentConfigurationRes;
  }

  const actionConfigs: AgentActionConfigurationType[] = [];

  for (const action of actions) {
    if (action.type === "retrieval_configuration") {
      const res = await createAgentActionConfiguration(
        auth,
        {
          type: "retrieval_configuration",
          query: action.query,
          relativeTimeFrame: action.relativeTimeFrame,
          topK: action.topK,
          dataSources: action.dataSources,
          name: action.name ?? null,
          description: action.description ?? null,
        },
        agentConfigurationRes.value
      );
      if (res.isErr()) {
        // If we fail to create an action, we should delete the agent configuration
        // we just created and re-throw the error.
        await unsafeHardDeleteAgentConfiguration(agentConfigurationRes.value);
        return res;
      }
      actionConfigs.push(res.value);
    } else if (action.type === "dust_app_run_configuration") {
      const app = await AppResource.fetchById(auth, action.appId);
      if (!app) {
        return new Err(new Error(`App ${action.appId} not found`));
      }

      const res = await createAgentActionConfiguration(
        auth,
        {
          type: "dust_app_run_configuration",
          appWorkspaceId: action.appWorkspaceId,
          appId: action.appId,
          name: action.name ?? null,
          description: action.description ?? null,
        },
        agentConfigurationRes.value
      );
      if (res.isErr()) {
        // If we fail to create an action, we should delete the agent configuration
        // we just created and re-throw the error.
        await unsafeHardDeleteAgentConfiguration(agentConfigurationRes.value);
        return res;
      }
      actionConfigs.push(res.value);
    } else if (action.type === "tables_query_configuration") {
      const res = await createAgentActionConfiguration(
        auth,
        {
          type: "tables_query_configuration",
          tables: action.tables,
          name: action.name ?? null,
          description: action.description ?? null,
        },
        agentConfigurationRes.value
      );
      if (res.isErr()) {
        // If we fail to create an action, we should delete the agent configuration
        // we just created and re-throw the error.
        await unsafeHardDeleteAgentConfiguration(agentConfigurationRes.value);
        return res;
      }
      actionConfigs.push(res.value);
    } else if (action.type === "process_configuration") {
      const res = await createAgentActionConfiguration(
        auth,
        {
          type: "process_configuration",
          dataSources: action.dataSources,
          relativeTimeFrame: action.relativeTimeFrame,
          jsonSchema: action.jsonSchema ?? null,
          name: action.name ?? null,
          description: action.description ?? null,
        },
        agentConfigurationRes.value
      );
      if (res.isErr()) {
        // If we fail to create an action, we should delete the agent configuration
        // we just created and re-throw the error.
        await unsafeHardDeleteAgentConfiguration(agentConfigurationRes.value);
        return res;
      }
      actionConfigs.push(res.value);
    } else if (action.type === "websearch_configuration") {
      const res = await createAgentActionConfiguration(
        auth,
        {
          type: "websearch_configuration",
          name: action.name ?? null,
          description: action.description ?? null,
        },
        agentConfigurationRes.value
      );
      if (res.isErr()) {
        // If we fail to create an action, we should delete the agent configuration
        // we just created and re-throw the error.
        await unsafeHardDeleteAgentConfiguration(agentConfigurationRes.value);
        return res;
      }
      actionConfigs.push(res.value);
    } else if (action.type === "browse_configuration") {
      const res = await createAgentActionConfiguration(
        auth,
        {
          type: "browse_configuration",
          name: action.name ?? null,
          description: action.description ?? null,
        },
        agentConfigurationRes.value
      );
      if (res.isErr()) {
        // If we fail to create an action, we should delete the agent configuration
        // we just created and re-throw the error.
        await unsafeHardDeleteAgentConfiguration(agentConfigurationRes.value);
        return res;
      }
      actionConfigs.push(res.value);
    } else if (action.type === "reasoning_configuration") {
      const res = await createAgentActionConfiguration(
        auth,
        {
          type: "reasoning_configuration",
          name: action.name ?? null,
          description: action.description ?? null,
          providerId: action.providerId,
          modelId: action.modelId,
          temperature: action.temperature,
          reasoningEffort: action.reasoningEffort,
        },
        agentConfigurationRes.value
      );
      if (res.isErr()) {
        // If we fail to create an action, we should delete the agent configuration
        // we just created and re-throw the error.
        await unsafeHardDeleteAgentConfiguration(agentConfigurationRes.value);
        return res;
      }
      actionConfigs.push(res.value);
    } else if (action.type === "mcp_server_configuration") {
      const res = await createAgentActionConfiguration(
        auth,
        {
          type: "mcp_server_configuration",
          name: action.name,
          description: action.description ?? DEFAULT_MCP_ACTION_DESCRIPTION,
          mcpServerViewId: action.mcpServerViewId,
          dataSources: action.dataSources || null,
          reasoningModel: action.reasoningModel,
          tables: action.tables,
          childAgentId: action.childAgentId,
          additionalConfiguration: action.additionalConfiguration,
          dustAppConfiguration: action.dustAppConfiguration,
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
    } else {
      assertNever(action);
    }
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
