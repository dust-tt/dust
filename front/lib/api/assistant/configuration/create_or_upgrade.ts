import { DEFAULT_MCP_ACTION_DESCRIPTION } from "@app/lib/actions/constants";
import type {
  MCPServerConfigurationType,
  ServerSideMCPServerConfigurationType,
} from "@app/lib/actions/mcp";
import { pruneSuggestionsForAgent } from "@app/lib/api/assistant/agent_suggestion_pruning";
import { createAgentActionConfiguration } from "@app/lib/api/assistant/configuration/actions";
import {
  createAgentConfiguration,
  restoreAgentConfiguration,
  unsafeHardDeleteAgentConfiguration,
} from "@app/lib/api/assistant/configuration/agent";
import { getAgentConfigurationRequirementsFromCapabilities } from "@app/lib/api/assistant/permissions";
import type { Authenticator } from "@app/lib/auth";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { getResourceIdFromSId } from "@app/lib/resources/string_ids";
import { UserResource } from "@app/lib/resources/user_resource";
import { ServerSideTracking } from "@app/lib/tracking/server";
import logger from "@app/logger/logger";
import type { PostOrPatchAgentConfigurationRequestBody } from "@app/types/api/agent_configuration";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { removeNulls } from "@app/types/shared/utils/general";
import uniq from "lodash/uniq";

/**
 * Create Or Upgrade Agent Configuration. If an agentConfigurationId is
 * provided, a new version of the agent configuration with that same
 * agentConfigurationId is created. Otherwise a brand-new agent configuration
 * is created. In both cases the new agent configuration is returned.
 */
export async function createOrUpgradeAgentConfiguration({
  auth,
  assistant,
  agentConfigurationId,
  authorId,
}: {
  auth: Authenticator;
  assistant: PostOrPatchAgentConfigurationRequestBody["assistant"];
  agentConfigurationId?: string;
  authorId?: ModelId;
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

  let skills: SkillResource[] = [];
  if (assistant.skills && assistant.skills.length > 0) {
    skills = await SkillResource.fetchByIds(
      auth,
      assistant.skills.map((s) => s.sId)
    );
  }

  const requirements = await getAgentConfigurationRequirementsFromCapabilities(
    auth,
    {
      actions,
      skills,
    }
  );

  let allRequestedSpaceIds = requirements.requestedSpaceIds;

  // Collect additional requestedSpaceIds
  if (
    assistant.additionalRequestedSpaceIds &&
    assistant.additionalRequestedSpaceIds.length > 0
  ) {
    const additionalSpaces = await SpaceResource.fetchByIds(
      auth,
      assistant.additionalRequestedSpaceIds
    );

    // Validate that all requested spaces were found and user can read them
    const readableSpaceIds = new Set(
      additionalSpaces.filter((s) => s.canRead(auth)).map((s) => s.sId)
    );
    const inaccessibleSpaces = assistant.additionalRequestedSpaceIds.filter(
      (sId) => !readableSpaceIds.has(sId)
    );
    if (inaccessibleSpaces.length > 0) {
      return new Err(
        new Error(
          `User does not have access to the following spaces: ${inaccessibleSpaces.join(", ")}`
        )
      );
    }

    const additionalSpaceModelIds = removeNulls(
      additionalSpaces.map((s) => getResourceIdFromSId(s.sId))
    );

    allRequestedSpaceIds = uniq(
      allRequestedSpaceIds.concat(additionalSpaceModelIds)
    );
  }

  const resolvedAuthorId = authorId ?? auth.user()?.id;
  if (!resolvedAuthorId) {
    return new Err(
      new Error("An author must be provided when no user is authenticated.")
    );
  }

  const agentConfigurationRes = await createAgentConfiguration(auth, {
    name: assistant.name,
    description: assistant.description,
    instructions: assistant.instructions ?? null,
    instructionsHtml: assistant.instructionsHtml ?? null,
    pictureUrl: assistant.pictureUrl,
    status: assistant.status,
    scope: assistant.scope,
    model: assistant.model,
    agentConfigurationId,
    templateId: assistant.templateId ?? null,
    requestedSpaceIds: allRequestedSpaceIds,
    tags: assistant.tags,
    editors,
    authorId: resolvedAuthorId,
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
        dataSources: action.dataSources ?? null,
        tables: action.tables,
        childAgentId: action.childAgentId,
        additionalConfiguration: action.additionalConfiguration,
        dustAppConfiguration: action.dustAppConfiguration,
        secretName: action.secretName,
        timeFrame: action.timeFrame,
        jsonSchema: action.jsonSchema,
        dustProject: action.dustProject,
      } as ServerSideMCPServerConfigurationType,
      agentConfigurationRes.value
    );
    if (res.isErr()) {
      logger.error(
        {
          error: res.error,
          agentConfigurationId: agentConfigurationRes.value.sId,
          workspaceId: auth.getNonNullableWorkspace().sId,
          mcpServerViewId: action.mcpServerViewId,
        },
        "Failed to create agent action configuration."
      );
      // If we fail to create an action, we should delete the agent configuration
      // we just created and re-throw the error.
      await unsafeHardDeleteAgentConfiguration(
        auth,
        agentConfigurationRes.value
      );
      // If we were upgrading an existing agent (i.e., creating a new
      // version for an existing `agentConfigurationId`), we archived the
      // previous version just before creating this one. Since creation of
      // an action failed and we are cleaning up the new version, restore
      // the previous version back to `active` status so the agent remains
      // available.
      if (agentConfigurationId) {
        const restoredResult = await restoreAgentConfiguration(
          auth,
          agentConfigurationRes.value.sId
        );
        if (restoredResult.isErr()) {
          logger.error(
            {
              error: restoredResult.error,
              workspaceId: auth.getNonNullableWorkspace().sId,
              agentConfigurationId: agentConfigurationRes.value.sId,
            },
            "Error while restoring previous agent version after rollback"
          );
        } else if (!restoredResult.value.restored) {
          logger.error(
            {
              workspaceId: auth.getNonNullableWorkspace().sId,
              agentConfigurationId: agentConfigurationRes.value.sId,
            },
            "Failed to restore previous agent version after action creation error"
          );
        }
      }
      return res;
    }
    actionConfigs.push(res.value);
  }

  // Create skill associations.
  const owner = auth.getNonNullableWorkspace();
  const skillById = new Map(skills.map((skill) => [skill.sId, skill]));
  const skillsToAdd = removeNulls(
    (assistant.skills ?? []).map((skill) => {
      const skillResource = skillById.get(skill.sId);
      if (!skillResource) {
        logger.warn(
          {
            workspaceId: owner.sId,
            agentConfigurationId: agentConfigurationRes.value.sId,
            skillId: skill.sId,
          },
          "Skill not found when creating agent configuration, skipping"
        );
        return null;
      }

      return skillResource;
    })
  );
  await SkillResource.addManyToAgent(auth, {
    agentConfiguration: agentConfigurationRes.value,
    skills: skillsToAdd,
  });

  const agentConfiguration: AgentConfigurationType = {
    ...agentConfigurationRes.value,
    instructionsHtml: assistant.instructionsHtml ?? null,
    actions: actionConfigs,
  };

  // Prune outdated suggestions after saving an existing agent.
  // This must happen after skills/tools are added to the new version.
  if (agentConfigurationId) {
    await pruneSuggestionsForAgent(auth, agentConfiguration);
  }

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
