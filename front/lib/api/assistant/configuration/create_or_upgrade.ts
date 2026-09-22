import { DEFAULT_MCP_ACTION_DESCRIPTION } from "@app/lib/actions/constants";
import type { ServerSideMCPServerConfigurationType } from "@app/lib/actions/mcp";
import { pruneSuggestionsForAgent } from "@app/lib/api/assistant/agent_suggestion_pruning";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { resolveAgentRequestedSpaces } from "@app/lib/api/assistant/configuration/requested_spaces";
import { getAgentConfigurationRequirementsFromCapabilities } from "@app/lib/api/assistant/permissions";
import type { Authenticator } from "@app/lib/auth";
import { getSupportedModelConfig } from "@app/lib/llms/model_configurations";
import { getModelTierAccessErrorForAgentConfiguration } from "@app/lib/model_tiers/access";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { AppResource } from "@app/lib/resources/app_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
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
/**
 * @cc [owner:rfrenoy,label:security;product] requested-spaces-readable-by-caller
 * Unless `dangerouslySkipPermissionFiltering` is set, the call MUST return an `Err` and persist
 * nothing when any space of the new version's `requestedSpaceIds` (collected from the actions'
 * MCP server views, data source views, Dust apps and Pods, from the skills, and from
 * `additionalRequestedSpaceIds`) is not readable by `auth` (`auth.can("read", space)`), through
 * `resolveAgentRequestedSpaces`. Agent visibility is gated on the same predicate, so a
 * version saved through a space the caller cannot read would lock the caller out of the agent.
 */
/**
 * @cc [owner:rfrenoy,label:security;product] dust-apps-readable-by-caller
 * Unless `dangerouslySkipPermissionFiltering` is set, the call MUST return an `Err` and persist
 * nothing when an action's `dustAppConfiguration.appId` does not resolve to a Dust app readable by
 * `auth`. `AppResource` fetchers drop unreadable apps, so without this check such an app would add
 * no space requirement and its id would still be persisted on the action.
 */
export async function createOrUpgradeAgentConfiguration({
  auth,
  assistant,
  agentConfigurationId,
  authorId,
  dangerouslySkipPermissionFiltering,
}: {
  auth: Authenticator;
  assistant: PostOrPatchAgentConfigurationRequestBody["assistant"];
  agentConfigurationId?: string;
  authorId?: ModelId;
  // Keeps the requested spaces and the skills of an agent being re-saved even when the caller
  // cannot read them. Only for callers that re-save an existing agent as-is (admin batch model
  // updates): without it those spaces are rejected and those skills silently dropped, which would
  // unrestrict the agent and strip its skills. It grants no access to what the spaces protect.
  dangerouslySkipPermissionFiltering?: boolean;
}): Promise<
  Result<
    { agentConfiguration: AgentConfigurationType; changed: boolean },
    Error
  >
> {
  const skillsOnlyViews = await MCPServerViewResource.fetchByIds(
    auth,
    assistant.actions.map((action) => action.mcpServerViewId),
    { isRestrictedToSkills: true }
  );
  const skillsOnlyViewIds = new Set(skillsOnlyViews.map((view) => view.sId));
  const actions = assistant.actions.filter(
    (action) => !skillsOnlyViewIds.has(action.mcpServerViewId)
  );

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
      assistant.skills.map((s) => s.sId),
      {
        permissionFiltering: dangerouslySkipPermissionFiltering
          ? "dangerously_skip"
          : "strict",
      }
    );
  }

  if (!dangerouslySkipPermissionFiltering) {
    const dustAppIds = uniq(
      removeNulls(actions.map((action) => action.dustAppConfiguration?.appId))
    );
    const dustApps = await AppResource.fetchByIds(auth, dustAppIds);
    const foundDustAppIds = new Set(dustApps.map((app) => app.sId));
    const inaccessibleDustAppIds = dustAppIds.filter(
      (appId) => !foundDustAppIds.has(appId)
    );
    if (inaccessibleDustAppIds.length > 0) {
      return new Err(
        new Error(
          `User does not have access to the following Dust apps: ${inaccessibleDustAppIds.join(", ")}`
        )
      );
    }
  }

  const requirements = await getAgentConfigurationRequirementsFromCapabilities(
    auth,
    {
      actions,
      skills,
    }
  );

  // Pods are referenced by sId: resolving them here reports a malformed or unknown id instead of
  // dropping it when the requirements are computed.
  const podIds = removeNulls(
    actions.map((action) => action.dustProject?.projectId ?? null)
  );
  const capabilitySpaces = await SpaceResource.fetchByModelIds(
    auth,
    requirements.requestedSpaceIds
  );
  const requestedSpacesRes = await resolveAgentRequestedSpaces(auth, {
    capabilitySpaces,
    requestedSpaceIds: [
      ...(assistant.additionalRequestedSpaceIds ?? []),
      ...podIds,
    ],
    dangerouslySkipPermissionFiltering,
  });
  if (requestedSpacesRes.isErr()) {
    return requestedSpacesRes;
  }
  const allRequestedSpaceIds = requestedSpacesRes.value.map(
    (space) => space.id
  );

  const resolvedAuthorId = authorId ?? auth.user()?.id;
  if (!resolvedAuthorId) {
    return new Err(
      new Error("An author must be provided when no user is authenticated.")
    );
  }

  const modelConfig = getSupportedModelConfig(assistant.model);
  if (!modelConfig) {
    return new Err(
      new Error(
        `Unsupported model "${assistant.model.modelId}" for provider ` +
          `"${assistant.model.providerId}".`
      )
    );
  }

  const accessError = await getModelTierAccessErrorForAgentConfiguration(auth, {
    agentName: assistant.name,
    model: modelConfig,
    reasoningEffort: assistant.model.reasoningEffort,
  });
  if (accessError) {
    return new Err(new Error(accessError.message));
  }

  const owner = auth.getNonNullableWorkspace();

  const actionConfigs: ServerSideMCPServerConfigurationType[] = actions.map(
    (action) =>
      ({
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
      }) as ServerSideMCPServerConfigurationType
  );

  const skillById = new Map(skills.map((skill) => [skill.sId, skill]));
  const skillsToAdd = removeNulls(
    (assistant.skills ?? []).map((skill) => {
      const skillResource = skillById.get(skill.sId);
      if (!skillResource) {
        logger.warn(
          {
            workspaceId: owner.sId,
            skillId: skill.sId,
          },
          "Skill not found when creating agent configuration, skipping"
        );
        return null;
      }

      return skillResource;
    })
  );

  const saveParams = {
    name: assistant.name,
    description: assistant.description,
    instructions: assistant.instructions ?? null,
    instructionsHtml: assistant.instructionsHtml ?? null,
    pictureUrl: assistant.pictureUrl,
    status: assistant.status,
    scope: assistant.scope,
    model: assistant.model,
    templateId: assistant.templateId ?? null,
    requestedSpaceIds: allRequestedSpaceIds,
    tags: assistant.tags,
    editors,
    authorId: resolvedAuthorId,
    actions: actionConfigs,
    skills: skillsToAdd,
  };

  let savedResource: AgentResource;
  // Whether the save actually persisted a change. A brand-new agent always does; an update may be a
  // no-op (incoming configuration identical to the current version, and no scope/editor change).
  let changed: boolean;
  if (agentConfigurationId) {
    const agentResource = await AgentResource.fetchById(
      auth,
      agentConfigurationId
    );
    // `updateConfiguration` gates each kind of change on its own permission (definition -> `write`,
    // model -> `write`/`admin`, scope -> publish + `write`/`admin`, editors -> `admin`; see
    // `agent-edit-in-place`), so we only confirm the agent exists here. `fetchById` returns null when
    // the caller holds no verb at all, which also hides a hidden agent's existence.
    if (!agentResource) {
      return new Err(new Error("Agent configuration not found."));
    }
    const updateRes = await agentResource.updateConfiguration(auth, saveParams);
    if (updateRes.isErr()) {
      return updateRes;
    }
    savedResource = updateRes.value.resource;
    changed = updateRes.value.changed;
  } else {
    const makeNewRes = await AgentResource.makeNew(auth, saveParams);
    if (makeNewRes.isErr()) {
      return makeNewRes;
    }
    savedResource = makeNewRes.value;
    changed = true;
  }

  // The save (configuration row + actions + skills) is atomic (see `agent-save-atomic`), so a
  // returned Ok means everything committed. Re-read the full config skipping the read gate — the
  // caller just wrote it, and may hold `write` without `read` (e.g. an admin API key editing a
  // hidden agent) — to build the `AgentConfigurationType` response, including the actions just
  // created.
  const savedConfig = await getAgentConfiguration(auth, {
    agentId: savedResource.sId,
    variant: "full",
    dangerouslySkipPermissionFiltering: true,
  });
  if (!savedConfig) {
    return new Err(new Error("Failed to load the saved agent configuration."));
  }

  // Prune outdated suggestions after saving an existing agent.
  // This must happen after skills/tools are added to the new version.
  if (agentConfigurationId) {
    await pruneSuggestionsForAgent(auth, savedConfig);
  }

  // We are not tracking draft agents
  if (savedConfig.status === "active") {
    void ServerSideTracking.trackAssistantCreated({
      user: auth.user() ?? undefined,
      workspace: auth.workspace() ?? undefined,
      assistant: savedConfig,
    });
  }

  return new Ok({ agentConfiguration: savedConfig, changed });
}
