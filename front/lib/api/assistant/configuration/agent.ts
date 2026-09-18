import { filterEditableAgents } from "@app/lib/api/assistant/agent_permissions";
import {
  enrichAgentConfigurations,
  getModelForAgentConfiguration,
  redactPrivateAgentConfigurationFields,
} from "@app/lib/api/assistant/configuration/helpers";
import { canAdminSeePrivateEntities } from "@app/lib/api/assistant/configuration/private_entities";
import { getGlobalAgents } from "@app/lib/api/assistant/global_agents/global_agents";
import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { getModelsForAuth } from "@app/lib/model_tiers/enabled_models";
import { AgentDataSourceConfigurationModel } from "@app/lib/models/agent/actions/data_sources";
import {
  AgentChildAgentConfigurationModel,
  AgentMCPServerConfigurationModel,
} from "@app/lib/models/agent/actions/mcp";
import { AgentTablesQueryConfigurationTableModel } from "@app/lib/models/agent/actions/tables_query";
import {
  AgentConfigurationModel,
  AgentModel,
} from "@app/lib/models/agent/agent";
import { AgentSkillModel } from "@app/lib/models/agent/agent_skill";
import { AgentSuggestionModel } from "@app/lib/models/agent/agent_suggestion";
import { GroupAgentModel } from "@app/lib/models/agent/group_agent";
import { TagAgentModel } from "@app/lib/models/agent/tag_agent";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { AgentUserRelationResource } from "@app/lib/resources/agent_user_relation_resource";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { canReadRequestedSpaces } from "@app/lib/resources/permission_utils";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { GroupMembershipModel } from "@app/lib/resources/storage/models/group_memberships";
import { GroupModel } from "@app/lib/resources/storage/models/groups";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { WakeUpResource } from "@app/lib/resources/wakeup_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { withTransaction } from "@app/lib/utils/sql_utils";
import logger from "@app/logger/logger";
import { tracer } from "@app/logger/tracer";
import type {
  AgentConfigurationScope,
  AgentConfigurationType,
  AgentFetchVariant,
  AgentModelConfigurationType,
  GlobalAgentContext,
  LightAgentConfigurationType,
} from "@app/types/assistant/agent";
import {
  GLOBAL_AGENTS_SID,
  isGlobalAgentId,
} from "@app/types/assistant/assistant";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeAsInternalDustError } from "@app/types/shared/utils/error_utils";
import { removeNulls } from "@app/types/shared/utils/general";
import type { UserType } from "@app/types/user";
import assert from "assert";
import type { Transaction } from "sequelize";
import { Op, QueryTypes } from "sequelize";

// Placeholder constants for pending agents
const PENDING_AGENT_PLACEHOLDER_NAME = "__PENDING__";
const PENDING_AGENT_PLACEHOLDER_DESCRIPTION = "";
const PENDING_AGENT_PLACEHOLDER_PICTURE_URL =
  "https://dust.tt/static/systemavatar/dust_avatar_full.png";

/**
 * Creates a pending agent configuration.
 * Pending agents are placeholders created when the agent builder is opened for a new agent,
 * before it is saved for the first time. This allows capturing the sId early.
 */
export async function createPendingAgentConfiguration(
  auth: Authenticator
): Promise<Result<{ sId: string }, Error>> {
  const canCreate = await auth.hasWorkspacePermission("create", "agent");
  if (!canCreate) {
    return new Err(new Error("Creating agents is restricted."));
  }

  const owner = auth.getNonNullableWorkspace();
  const user = auth.getNonNullableUser();

  const sId = generateRandomModelSId();
  const { defaultModel } = await getModelsForAuth(auth);

  await withTransaction(async (t) => {
    const agentIdentity = await AgentModel.create(
      {
        sId,
        workspaceId: owner.id,
      },
      { transaction: t }
    );
    const agent = await AgentConfigurationModel.create(
      {
        sId,
        agentId: agentIdentity.id,
        version: 0,
        status: "pending",
        scope: "hidden",
        name: PENDING_AGENT_PLACEHOLDER_NAME,
        description: PENDING_AGENT_PLACEHOLDER_DESCRIPTION,
        instructions: null,
        providerId: defaultModel.providerId,
        modelId: defaultModel.modelId,
        temperature: 0.7,
        reasoningEffort: defaultModel.defaultReasoningEffort,
        maxStepsPerRun: 8,
        reinforcement: "auto",
        pictureUrl: PENDING_AGENT_PLACEHOLDER_PICTURE_URL,
        workspaceId: owner.id,
        authorId: user.id,
        templateId: null,
        requestedSpaceIds: [],
      },
      { transaction: t }
    );

    await GroupResource.makeNewAgentEditorsGroup(auth, agent, {
      transaction: t,
      authorId: user.id,
    });
    await AgentResource.fromAgentConfigurationModel(auth, agent).grantEditors(
      auth,
      {
        editors: [user.toJSON()],
        transaction: t,
      }
    );
    await auth.refresh({ transaction: t });
  });

  return new Ok({ sId });
}

export async function getAgentConfigurationsWithVersion<
  V extends AgentFetchVariant,
>(
  auth: Authenticator,
  agentIdsWithVersion: { agentId: string; agentVersion: number }[],
  {
    variant,
    dangerouslySkipPermissionFiltering,
  }: { variant: V; dangerouslySkipPermissionFiltering?: boolean }
): Promise<
  V extends "light" ? LightAgentConfigurationType[] : AgentConfigurationType[]
> {
  const owner = auth.workspace();
  if (!owner || !auth.isUser()) {
    throw new Error("Unexpected `auth` without `workspace`.");
  }

  const globalAgentIds = agentIdsWithVersion
    .map(({ agentId }) => agentId)
    .filter(isGlobalAgentId);

  let globalAgents: AgentConfigurationType[] = [];
  if (globalAgentIds.length > 0) {
    globalAgents = await getGlobalAgents(auth, globalAgentIds, variant);
  }

  const workspaceAgentModels = await AgentConfigurationModel.findAll({
    where: {
      workspaceId: owner.id,
      [Op.or]: agentIdsWithVersion
        .filter(({ agentId }) => !isGlobalAgentId(agentId))
        .map(({ agentId: sId, agentVersion: version }) => ({
          sId,
          version,
        })),
    },
  });

  const allowedAgentModels = dangerouslySkipPermissionFiltering
    ? workspaceAgentModels
    : await filterAgentsByRequestedSpaces(auth, workspaceAgentModels);
  const workspaceAgents = await enrichAgentConfigurations(
    auth,
    allowedAgentModels,
    {
      variant,
    }
  );

  const agents = [...globalAgents, ...workspaceAgents];

  return agents as V extends "light"
    ? LightAgentConfigurationType[]
    : AgentConfigurationType[];
}

/**
 * Get all versions of a single agent.
 */
export async function listsAgentConfigurationVersions<
  V extends AgentFetchVariant,
>(
  auth: Authenticator,
  { agentId, variant }: { agentId: string; variant: V }
): Promise<
  V extends "full" ? AgentConfigurationType[] : LightAgentConfigurationType[]
> {
  const owner = auth.workspace();
  if (!owner || !auth.isUser()) {
    throw new Error("Unexpected `auth` without `workspace`.");
  }

  let agents: AgentConfigurationType[];
  if (isGlobalAgentId(agentId)) {
    agents = await getGlobalAgents(auth, [agentId], variant);
  } else {
    const agentModels = await AgentConfigurationModel.findAll({
      where: {
        workspaceId: owner.id,
        sId: agentId,
      },
      order: [["version", "DESC"]],
    });
    const allowedAgentModels = await filterAgentsByRequestedSpaces(
      auth,
      agentModels
    );
    agents = await enrichAgentConfigurations(auth, allowedAgentModels, {
      variant,
    });
  }

  return agents as V extends "full"
    ? AgentConfigurationType[]
    : LightAgentConfigurationType[];
}

async function fetchLatestWorkspaceAgentModels(
  auth: Authenticator,
  workspaceAgentIds: string[]
): Promise<AgentConfigurationModel[]> {
  if (workspaceAgentIds.length === 0) {
    return [];
  }

  // Agent sIds are globally unique (every agent starts at version 0, and
  // (sId, version) is unique). Resolve the latest model id through that index
  // first, then enforce workspace isolation while loading the model row. This
  // avoids sorting every historical version of heavily edited agents.
  const query = `
    SELECT agent_configuration.*
    FROM (
      SELECT DISTINCT unnest($agentIds::text[]) AS "sId"
    ) requested_agent
    JOIN LATERAL (
      SELECT id
      FROM agent_configurations
      WHERE "sId" = requested_agent."sId"
      ORDER BY version DESC
      LIMIT 1
    ) latest_agent ON true
    JOIN agent_configurations AS agent_configuration
      ON agent_configuration.id = latest_agent.id
      AND agent_configuration."workspaceId" = $workspaceId
    ORDER BY agent_configuration.version DESC
  `;

  return (
    (await AgentConfigurationModel.sequelize?.query(query, {
      type: QueryTypes.SELECT,
      bind: {
        workspaceId: auth.getNonNullableWorkspace().id,
        agentIds: workspaceAgentIds,
      },
      model: AgentConfigurationModel,
      mapToModel: true,
    })) ?? []
  );
}

/**
 * Get the latest versions of multiple agents.
 */
export async function getAgentConfigurations<V extends AgentFetchVariant>(
  auth: Authenticator,
  {
    agentIds,
    variant,
    globalAgentContext,
    dangerouslySkipPermissionFiltering,
  }: {
    agentIds: string[];
    variant: V;
    globalAgentContext?: GlobalAgentContext;
    dangerouslySkipPermissionFiltering?: boolean;
  }
): Promise<
  V extends "full" ? AgentConfigurationType[] : LightAgentConfigurationType[]
> {
  return tracer.trace("getAgentConfigurations", async () => {
    const owner = auth.workspace();
    if (!owner) {
      throw new Error("Unexpected `auth` without `workspace`.");
    }
    if (!auth.isUser()) {
      throw new Error("Unexpected `auth` without `user` permissions.");
    }

    const globalAgentIds = agentIds.filter(isGlobalAgentId);

    let globalAgents: AgentConfigurationType[] = [];
    if (globalAgentIds.length > 0) {
      globalAgents = await getGlobalAgents(auth, globalAgentIds, variant, {
        globalAgentContext,
      });
    }

    const workspaceAgentIds = agentIds.filter((id) => !isGlobalAgentId(id));

    let workspaceAgents: AgentConfigurationType[] = [];
    if (workspaceAgentIds.length > 0) {
      const agentModels = await fetchLatestWorkspaceAgentModels(
        auth,
        workspaceAgentIds
      );

      const allowedAgentModels = dangerouslySkipPermissionFiltering
        ? agentModels
        : await filterAgentsByRequestedSpaces(auth, agentModels);
      workspaceAgents = await enrichAgentConfigurations(
        auth,
        allowedAgentModels,
        {
          variant,
        }
      );
    }

    const agents = [...globalAgents, ...workspaceAgents];

    return agents as V extends "full"
      ? AgentConfigurationType[]
      : LightAgentConfigurationType[];
  });
}

/**
 * Retrieves one specific version of an agent (can be the latest one).
 */
export async function getAgentConfiguration<V extends AgentFetchVariant>(
  auth: Authenticator,
  {
    agentId,
    agentVersion,
    variant,
    globalAgentContext,
    dangerouslySkipPermissionFiltering,
  }: {
    agentId: string;
    agentVersion?: number;
    variant: V;
    globalAgentContext?: GlobalAgentContext;
    dangerouslySkipPermissionFiltering?: boolean;
  }
): Promise<
  | (V extends "light" ? LightAgentConfigurationType : AgentConfigurationType)
  | null
> {
  return tracer.trace("getAgentConfiguration", async () => {
    if (agentVersion !== undefined && !isGlobalAgentId(agentId)) {
      const [agent] = await getAgentConfigurationsWithVersion(
        auth,
        [{ agentId, agentVersion }],
        {
          variant,
          dangerouslySkipPermissionFiltering,
        }
      );
      return (
        (agent as V extends "light"
          ? LightAgentConfigurationType
          : AgentConfigurationType) || null
      );
    }
    const [agent] = await getAgentConfigurations(auth, {
      agentIds: [agentId],
      variant,
      globalAgentContext,
      dangerouslySkipPermissionFiltering,
    });
    return (
      (agent as V extends "light"
        ? LightAgentConfigurationType
        : AgentConfigurationType) || null
    );
  });
}

/**
 * Retrieves the latest version of an agent for the caller's details view. Callers only get agents
 * they can read, except admins: they can list every agent of the workspace (see the
 * `manage_unrestricted` view), so they get the ones they cannot read too, with the private fields
 * redacted (see `redactPrivateAgentConfigurationFields`). Returns null when the agent does not
 * exist or is not readable by a non-admin caller.
 */
export async function getAgentConfigurationForDetails(
  auth: Authenticator,
  { agentId }: { agentId: string }
): Promise<AgentConfigurationType | null> {
  const agent = await getAgentConfiguration(auth, {
    agentId,
    variant: "full",
  });
  if (agent?.canRead) {
    return agent;
  }

  if (!auth.isAdmin()) {
    return null;
  }

  // Either not readable (unpublished, not an editor) or filtered out by a space the admin is not a
  // member of. With the `admin_can_see_private_entities` feature flag the admin gets it in full;
  // otherwise it is refetched without the space filtering to be redacted.
  if (await canAdminSeePrivateEntities(auth)) {
    const fullAgent =
      agent ??
      (await getAgentConfiguration(auth, {
        agentId,
        variant: "full",
        dangerouslySkipPermissionFiltering: true,
      }));
    return fullAgent ? { ...fullAgent, canRead: true } : null;
  }

  // The light variant is enough, the full one only adds fields the redaction drops.
  const restrictedAgent =
    agent ??
    (await getAgentConfiguration(auth, {
      agentId,
      variant: "light",
      dangerouslySkipPermissionFiltering: true,
    }));

  return restrictedAgent
    ? redactPrivateAgentConfigurationFields(restrictedAgent)
    : null;
}

type AgentLabel = {
  sId: string;
  authorModelId: ModelId;
  name: string;
  pictureUrl: string | null;
  model: AgentModelConfigurationType;
  scope: Exclude<AgentConfigurationScope, "global">;
};

export async function getAgentLabelsByIds(
  auth: Authenticator,
  agentIds: string[]
): Promise<AgentLabel[]> {
  if (!auth.isManager()) {
    return [];
  }

  const workspaceAgentIds = agentIds.filter((id) => !isGlobalAgentId(id));
  const agentModels = await fetchLatestWorkspaceAgentModels(
    auth,
    workspaceAgentIds
  );

  return agentModels.map((agent) => ({
    sId: agent.sId,
    name: agent.name,
    authorModelId: agent.authorId,
    pictureUrl: agent.pictureUrl,
    model: getModelForAgentConfiguration(agent),
    scope: agent.scope,
  }));
}

/**
 * Search agent configurations by name.
 */
export async function searchAgentConfigurationsByName(
  auth: Authenticator,
  name: string
): Promise<LightAgentConfigurationType[]> {
  const owner = auth.getNonNullableWorkspace();

  const agentConfigurations = await AgentConfigurationModel.findAll({
    where: {
      workspaceId: owner.id,
      status: "active",
      scope: { [Op.in]: ["workspace", "published", "visible"] },
      name: {
        [Op.iLike]: `%${name}%`,
      },
    },
  });
  const agents = await getAgentConfigurations(auth, {
    agentIds: agentConfigurations.map(({ sId }) => sId),
    variant: "light",
  });

  return removeNulls(agents);
}

/**
 * Resolve an agent configuration sId from a name. Searches workspace agents and
 * global agents (case-insensitive substring), preferring an exact match. Returns
 * null when no agent matches.
 */
export async function resolveAgentConfigurationIdByName(
  auth: Authenticator,
  agentName: string
): Promise<string | null> {
  const normalizedAgentName = agentName.trim().toLowerCase();
  if (normalizedAgentName === "dust" || normalizedAgentName === "dust agent") {
    return GLOBAL_AGENTS_SID.DUST;
  }

  const workspaceMatches = await searchAgentConfigurationsByName(
    auth,
    agentName
  );
  const globalAgents = await getGlobalAgents(auth, undefined, "light");
  const globalMatches = globalAgents.filter((a) =>
    a.name.toLowerCase().includes(normalizedAgentName)
  );
  const matches = [...workspaceMatches, ...globalMatches];
  if (matches.length === 0) {
    return null;
  }

  // Prefer exact case-insensitive match, otherwise fallback to first result.
  const exactMatch = matches.find(
    (a) => a.name.trim().toLowerCase() === normalizedAgentName
  );
  return exactMatch?.sId ?? matches[0].sId;
}

// Cancels every still-scheduled wake-up targeting the given agent, deleting the
// backing Temporal schedule (cron) or pending workflow (one-shot). Errors are
// logged but do not abort the caller.
async function cancelWakeUpsForAgent(
  auth: Authenticator,
  agentConfigurationId: string
): Promise<void> {
  const workspace = auth.getNonNullableWorkspace();
  const wakeUps = await WakeUpResource.listByAgentConfigurationId(
    auth,
    agentConfigurationId
  );

  await concurrentExecutor(
    wakeUps,
    async (wakeUp) => {
      const cancelResult = await wakeUp.forceCancel(auth);
      if (cancelResult.isErr()) {
        logger.error(
          {
            workspaceId: workspace.sId,
            agentConfigurationId,
            wakeUpId: wakeUp.sId,
            error: cancelResult.error,
          },
          `Failed to cancel wake-up ${wakeUp.sId} for agent ${agentConfigurationId}`
        );
      }
    },
    { concurrency: 5 }
  );
}

export async function archiveAgentConfiguration(
  auth: Authenticator,
  agentConfigurationId: string
): Promise<boolean> {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Unexpected `auth` without `workspace`.");
  }

  const agent = await AgentResource.fetchById(auth, agentConfigurationId);

  if (!agent) {
    throw new Error(`Could not find agent ${agentConfigurationId}`);
  }

  // Disable all triggers for this agent before archiving
  const triggers = await TriggerResource.listByAgentConfigurationId(
    auth,
    agentConfigurationId
  );
  for (const trigger of triggers) {
    const disableResult = await trigger.disable(auth);
    if (disableResult.isErr()) {
      logger.error(
        {
          workspaceId: owner.sId,
          agentConfigurationId,
          triggerId: trigger.sId,
          error: disableResult.error,
        },
        `Failed to disable trigger ${trigger.sId} when archiving agent ${agentConfigurationId}`
      );
    }
  }

  await cancelWakeUpsForAgent(auth, agentConfigurationId);

  const updated = await AgentConfigurationModel.update(
    { status: "archived" },
    {
      where: {
        sId: agentConfigurationId,
        workspaceId: owner.id,
      },
    }
  );

  if (updated[0] > 0) {
    void emitAuditLogEvent({
      auth,
      action: "agent.archived",
      targets: [
        buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
        buildAuditLogTarget("agent", agent),
      ],
      context: getAuditLogContext(auth),
      metadata: {
        agent_name: agent.name,
      },
    });
  }

  const affectedCount = updated[0];
  return affectedCount > 0;
}

export async function restoreAgentConfiguration(
  auth: Authenticator,
  agentConfigurationId: string
): Promise<
  Result<
    { restored: boolean },
    DustError<"name_conflict" | "internal_error" | "unauthorized">
  >
> {
  const owner = auth.getNonNullableWorkspace();

  const latestConfig = await AgentConfigurationModel.findOne({
    where: {
      sId: agentConfigurationId,
      workspaceId: owner.id,
    },
    order: [["version", "DESC"]],
    limit: 1,
  });
  if (!latestConfig) {
    return new Err(
      new DustError("internal_error", "Could not find agent configuration")
    );
  }
  if (latestConfig.status !== "archived") {
    return new Err(
      new DustError("internal_error", "Agent configuration is not archived")
    );
  }

  // Check publishing restrictions: restoring a visible agent is equivalent to publishing it.
  if (latestConfig.scope === "visible") {
    const canPublish = await auth.hasWorkspacePermission("publish", "agent");
    if (!canPublish) {
      return new Err(
        new DustError("unauthorized", "Publishing agents is restricted.")
      );
    }
  }

  // Check for an active agent with the same name to avoid a unique constraint violation on
  // (workspaceId, name) during the update.
  const existingActive = await AgentConfigurationModel.findOne({
    where: {
      workspaceId: owner.id,
      name: latestConfig.name,
      status: "active",
    },
  });
  if (existingActive) {
    return new Err(
      new DustError(
        "name_conflict",
        `Cannot restore: an active agent named "${latestConfig.name}" already exists.`
      )
    );
  }

  const updated = await AgentConfigurationModel.update(
    {
      status: "active",
    },
    {
      where: {
        id: latestConfig.id,
      },
    }
  );

  // Re-enable triggers.
  if (updated[0] > 0) {
    const triggers = await TriggerResource.listByAgentConfigurationId(
      auth,
      agentConfigurationId
    );
    const editors = await UserResource.fetchByModelIds([
      ...new Set(triggers.map((trigger) => trigger.editor)),
    ]);
    const editorByModelId = new Map(
      editors.map((editor) => [editor.id, editor])
    );

    for (const trigger of triggers) {
      const editor = editorByModelId.get(trigger.editor);
      if (!editor) {
        logger.error(
          {
            workspaceId: owner.sId,
            agentConfigurationId,
            triggerId: trigger.sId,
          },
          `Could not find editor ${trigger.editor} for trigger ${trigger.sId} when restoring agent ${agentConfigurationId}`
        );
        continue;
      }

      const editorAuth = await Authenticator.fromUserIdAndWorkspaceId(
        editor.sId,
        auth.getNonNullableWorkspace().sId
      );
      const enableResult = await trigger.enable(editorAuth);
      if (enableResult.isErr()) {
        logger.error(
          {
            workspaceId: owner.sId,
            agentConfigurationId,
            triggerId: trigger.sId,
            error: enableResult.error,
          },
          `Failed to enable trigger ${trigger.sId} when restoring agent ${agentConfigurationId}`
        );
      }
    }
  }

  if (updated[0] > 0) {
    void emitAuditLogEvent({
      auth,
      action: "agent.restored",
      targets: [
        buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
        buildAuditLogTarget("agent", latestConfig),
      ],
      context: getAuditLogContext(auth),
      metadata: {
        agent_name: latestConfig.name,
      },
    });
  }

  return new Ok({ restored: updated[0] > 0 });
}

// Deletes the agent-scoped resources that are keyed by the agent sId (stable
// across versions) and therefore have no DB foreign key to cascade on: triggers
// (with their Temporal schedule), wake-ups (with their Temporal schedule /
// pending workflow) and favorite / agent-user-relation rows.
export async function cleanupAgentScopedResourcesForHardDeletion(
  auth: Authenticator,
  agentConfigurationId: string
): Promise<void> {
  const workspace = auth.getNonNullableWorkspace();

  const triggers = await TriggerResource.listByAgentConfigurationId(
    auth,
    agentConfigurationId
  );
  await concurrentExecutor(
    triggers,
    async (trigger) => {
      const deleteResult = await trigger.delete(auth);
      if (deleteResult.isErr()) {
        logger.error(
          {
            workspaceId: workspace.sId,
            agentConfigurationId,
            triggerId: trigger.sId,
            error: deleteResult.error,
          },
          `Failed to delete trigger ${trigger.sId} while hard-deleting agent ${agentConfigurationId}`
        );
      }
    },
    { concurrency: 4 }
  );

  const wakeUps = await WakeUpResource.listByAgentConfigurationId(
    auth,
    agentConfigurationId
  );
  const deletableWakeUpIds: ModelId[] = [];
  for (const wakeUp of wakeUps) {
    const cleanupResult = await wakeUp.forceCancel(auth);
    if (cleanupResult.isErr()) {
      logger.error(
        {
          workspaceId: workspace.sId,
          agentConfigurationId,
          wakeUpId: wakeUp.sId,
          error: cleanupResult.error,
        },
        `Failed cleaning up wake-up ${wakeUp.sId} Temporal state while hard-deleting agent ${agentConfigurationId}; leaving row for retry`
      );
      continue;
    }
    deletableWakeUpIds.push(wakeUp.id);
  }
  await WakeUpResource.deleteByModelIds(auth, deletableWakeUpIds);

  await AgentUserRelationResource.deleteForAgent(auth, agentConfigurationId);
}

/**
 * Deletes one `agent_configurations` row and keeps its identity consistent: `currentVersion` is
 * moved to the highest remaining version, or the agent is deleted with its grants when no row
 * remains. The row's satellites (tools, tags, skills, editor links, suggestions) must be gone
 * already.
 */
export async function destroyAgentConfigurationRow(
  auth: Authenticator,
  {
    agent,
    configurationId,
  }: { agent: AgentResource; configurationId: ModelId },
  transaction: Transaction
): Promise<void> {
  const workspaceId = auth.getNonNullableWorkspace().id;

  await AgentConfigurationModel.destroy({
    where: { id: configurationId, workspaceId },
    transaction,
  });

  // Hold the identity row from here to commit: two transactions deleting two different versions of
  // the same agent would otherwise each pick a replacement from its own snapshot and commit a
  // `currentVersion` pointing at the row the other one deleted. The lock is taken after the
  // deletion above, not before: an upgrade locks `agent_configurations` (archiving the previous
  // versions) before it locks `agents` (the FK check of the new version row, then the pointer
  // update), so locking `agents` first would invert that order and deadlock.
  await AgentModel.findOne({
    where: { id: agent.id, workspaceId },
    lock: transaction.LOCK.UPDATE,
    transaction,
  });

  const remainingConfiguration = await AgentConfigurationModel.findOne({
    where: { sId: agent.sId, workspaceId },
    attributes: ["agentId", "version"],
    order: [["version", "DESC"]],
    transaction,
  });
  if (remainingConfiguration) {
    await agent.setCurrentConfiguration(auth, remainingConfiguration, {
      transaction,
    });
    return;
  }

  await agent.destroyPermissionsAndGroups(auth, { transaction });
  await AgentModel.destroy({
    where: { sId: agent.sId, workspaceId },
    transaction,
  });
}

// Should only be called when we need to clean up the agent configuration
// right after creating it due to an error.
export async function unsafeHardDeleteAgentConfiguration(
  auth: Authenticator,
  agentConfiguration: LightAgentConfigurationType
): Promise<void> {
  const workspaceId = auth.getNonNullableWorkspace().id;

  await withTransaction(async (t) => {
    const agentResource = AgentResource.fromAgentConfiguration(
      auth,
      agentConfiguration
    );

    // Clean up MCP server configurations and their children first
    const mcpConfigs = await AgentMCPServerConfigurationModel.findAll({
      where: {
        agentConfigurationId: agentConfiguration.id,
        workspaceId,
      },
      attributes: ["id"],
      transaction: t,
    });
    if (mcpConfigs.length) {
      const mcpIds = mcpConfigs.map((c) => c.id);

      await AgentDataSourceConfigurationModel.destroy({
        where: {
          workspaceId,
          mcpServerConfigurationId: { [Op.in]: mcpIds },
        },
        transaction: t,
      });

      await AgentTablesQueryConfigurationTableModel.destroy({
        where: {
          workspaceId,
          mcpServerConfigurationId: { [Op.in]: mcpIds },
        },
        transaction: t,
      });

      await AgentChildAgentConfigurationModel.destroy({
        where: {
          workspaceId,
          mcpServerConfigurationId: { [Op.in]: mcpIds },
        },
        transaction: t,
      });

      await AgentMCPServerConfigurationModel.destroy({
        where: {
          workspaceId,
          id: { [Op.in]: mcpIds },
        },
        transaction: t,
      });
    }

    await TagAgentModel.destroy({
      where: {
        agentConfigurationId: agentConfiguration.id,
        workspaceId,
      },
      transaction: t,
    });

    await GroupAgentModel.destroy({
      where: {
        agentConfigurationId: agentConfiguration.id,
        workspaceId,
      },
      transaction: t,
    });

    await AgentSkillModel.destroy({
      where: {
        agentConfigurationId: agentConfiguration.id,
        workspaceId,
      },
      transaction: t,
    });

    await destroyAgentConfigurationRow(
      auth,
      { agent: agentResource, configurationId: agentConfiguration.id },
      t
    );
  });
}

/**
 * Batch-deletes pending agent configurations and their editor groups.
 */
export async function batchHardDeletePendingAgentConfigurations(
  auth: Authenticator,
  agents: AgentConfigurationModel[]
) {
  const workspaceId = auth.getNonNullableWorkspace().id;
  const agentConfigurationModelIds = agents.map((agent) => agent.id);
  const agentModelIds = [...new Set(agents.map((agent) => agent.agentId))];

  // Find all editor group IDs for this batch.
  const groupAgents = await GroupAgentModel.findAll({
    where: {
      agentConfigurationId: agentConfigurationModelIds,
      workspaceId,
    },
  });
  const editorGroupModelIds = groupAgents.map(
    (groupAgent) => groupAgent.groupId
  );

  await withTransaction(async (t) => {
    const grantGroups =
      await GroupPermissionResource.listRegularAutoGroupsForResources(auth, {
        resourceType: "agent",
        resourceIds: agentModelIds,
        transaction: t,
      });
    await GroupPermissionResource.deleteAllForResources(auth, {
      resourceType: "agent",
      resourceIds: agentModelIds,
      transaction: t,
    });

    const groupModelIds = [
      ...new Set([
        ...editorGroupModelIds,
        ...grantGroups.map((group) => group.id),
      ]),
    ];
    if (groupModelIds.length > 0) {
      await GroupMembershipModel.destroy({
        where: { groupId: groupModelIds, workspaceId },
        transaction: t,
      });

      await GroupAgentModel.destroy({
        where: { groupId: groupModelIds, workspaceId },
        transaction: t,
      });

      await GroupModel.destroy({
        where: { id: groupModelIds, workspaceId },
        transaction: t,
      });
    }

    // Delete agent suggestions before agents (FK constraint)
    await AgentSuggestionModel.destroy({
      where: { agentConfigurationId: agentConfigurationModelIds, workspaceId },
      transaction: t,
    });

    await AgentUserRelationResource.deleteForAgents(
      agents.map((a) => a.sId),
      { workspaceId, transaction: t }
    );

    await AgentConfigurationModel.destroy({
      where: { id: agentConfigurationModelIds, workspaceId },
      transaction: t,
    });

    // Pending configurations are the only version of their logical agent. The FK protects this
    // invariant by rolling the transaction back if another configuration still uses an identity.
    await AgentModel.destroy({
      where: { id: agentModelIds, workspaceId },
      transaction: t,
    });
  });
}

/**
 * Updates the permissions (editors) for an agent configuration.
 */
/**
 * @cc [owner:philipperolet,label:security;product] editor-removal-uses-grants
 * Removing an editor MUST validate membership against the grant-backed editor set and revoke that
 * grant. A user without an editor grant MUST return `user_not_member`.
 */
export async function updateAgentPermissions(
  auth: Authenticator,
  {
    agent,
    usersToAdd,
    usersToRemove,
  }: {
    agent: LightAgentConfigurationType;
    usersToAdd: UserType[];
    usersToRemove: UserType[];
  }
): Promise<
  Result<
    undefined,
    DustError<
      | "group_not_found"
      | "internal_error"
      | "unauthorized"
      | "invalid_id"
      | "system_or_global_group"
      | "user_not_found"
      | "user_not_member"
      | "user_already_member"
      | "group_requirements_not_met"
      | "invalid_request_error"
    >
  >
> {
  if (agent.status === "archived") {
    return new Err(
      new DustError(
        "invalid_request_error",
        "An archived agent cannot be updated. Restore it first."
      )
    );
  }

  const editorGroupRes = await GroupResource.findEditorGroupForAgent(
    auth,
    agent
  );
  if (editorGroupRes.isErr()) {
    return editorGroupRes;
  }

  const canAdministrate = auth.can(
    "admin",
    AgentResource.fromAgentConfiguration(auth, agent)
  );

  try {
    const transactionResult = await withTransaction(async (t) => {
      const agentResource = AgentResource.fromAgentConfiguration(auth, agent);

      if (usersToAdd.length > 0) {
        if (!canAdministrate) {
          return new Err(
            new DustError(
              "unauthorized",
              "Only admins or group editors can add group members"
            )
          );
        }
        const addRes = await editorGroupRes.value.dangerouslyAddMembers(auth, {
          users: usersToAdd,
          transaction: t,
        });
        if (addRes.isErr()) {
          return addRes;
        }

        await agentResource.grantEditors(auth, {
          editors: usersToAdd,
          transaction: t,
        });
      }

      if (usersToRemove.length > 0) {
        if (!canAdministrate) {
          return new Err(
            new DustError(
              "unauthorized",
              "Only admins or group editors can remove group members"
            )
          );
        }
        const editors = await agentResource.listEditors(auth, {
          transaction: t,
        });
        assert(editors !== null);
        const editorIds = new Set(editors.map((editor) => editor.id));
        if (usersToRemove.some((user) => !editorIds.has(user.id))) {
          return new Err(
            new DustError(
              "user_not_member",
              "Cannot remove: user is not an agent editor"
            )
          );
        }
        const legacyEditors = await editorGroupRes.value.getActiveMembers(
          auth,
          { transaction: t }
        );
        const legacyEditorIds = new Set(
          legacyEditors.map((editor) => editor.id)
        );
        const legacyUsersToRemove = usersToRemove.filter((user) =>
          legacyEditorIds.has(user.id)
        );
        const removeRes = await editorGroupRes.value.dangerouslyRemoveMembers(
          auth,
          {
            users: legacyUsersToRemove,
            transaction: t,
          }
        );
        if (removeRes.isErr()) {
          return removeRes;
        }

        await agentResource.revokeEditors(auth, {
          editors: usersToRemove,
          transaction: t,
        });
      }
      return new Ok(undefined);
    });

    if (transactionResult.isErr()) {
      return transactionResult;
    }

    // Editors get access to the agent's private data (prompt, skills, knowledge), so editor changes
    // are audited as soon as they are committed, whatever happens to the triggers below.
    // `actor_added_self` flags an admin granting themselves that access.
    const actorUserId = auth.user()?.sId;
    void emitAuditLogEvent({
      auth,
      action: "agent.editors_updated",
      targets: [
        buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
        buildAuditLogTarget("agent", agent),
      ],
      context: getAuditLogContext(auth),
      metadata: {
        agent_name: agent.name,
        scope: agent.scope,
        added_editor_ids: usersToAdd.map((u) => u.sId).join(","),
        removed_editor_ids: usersToRemove.map((u) => u.sId).join(","),
        actor_added_self: String(
          actorUserId !== undefined &&
            usersToAdd.some((u) => u.sId === actorUserId)
        ),
      },
    });

    // If the agent is hidden and editors were removed, disable their triggers.
    // Removed editors can no longer access the hidden agent, so their triggers would fail.
    if (usersToRemove.length > 0 && agent.scope === "hidden") {
      const triggersToDisable =
        await TriggerResource.listByAgentConfigurationIdAndEditors(auth, {
          agentConfigurationId: agent.sId,
          editorIds: usersToRemove.map((u) => u.id),
        });

      if (triggersToDisable.isErr()) {
        return new Err(normalizeAsInternalDustError(triggersToDisable.error));
      }
      for (const trigger of triggersToDisable.value) {
        const disableResult = await trigger.disable(auth);
        if (disableResult.isErr()) {
          logger.error(
            {
              workspaceId: auth.getNonNullableWorkspace().sId,
              agentConfigurationId: agent.sId,
              triggerId: trigger.sId,
              error: disableResult.error,
            },
            `Failed to disable trigger ${trigger.sId} when removing editor from agent ${agent.sId}`
          );
        }
      }
    }

    return new Ok(undefined);
  } catch (error) {
    // Catch errors thrown from within the transaction
    return new Err(normalizeAsInternalDustError(error));
  }
}

export async function updateAgentConfigurationsScope(
  auth: Authenticator,
  agentIds: string[],
  scope: Exclude<AgentConfigurationScope, "global">
): Promise<Result<void, Error>> {
  if (agentIds.length === 0) {
    return new Ok(undefined);
  }

  // Publishing/unpublishing needs the workspace `publish` capability (checked below) plus edit
  // rights on each agent. Admins may additionally act on agents built on spaces they cannot read
  // (the manage agents page lists those behind "Show hidden agents"); changing the scope touches
  // nothing the spaces protect.
  const agentConfigs = await getAgentConfigurations(auth, {
    agentIds,
    variant: "light",
    dangerouslySkipPermissionFiltering: auth.isAdmin(),
  });

  const archivedAgentNames = agentConfigs
    .filter((agent) => agent.status === "archived")
    .map((agent) => agent.name);
  if (archivedAgentNames.length > 0) {
    return new Err(
      new Error(
        `Archived agents cannot be updated: ${archivedAgentNames.join(", ")}. Restore them first.`
      )
    );
  }

  const editableAgents = filterEditableAgents(auth, agentConfigs);
  if (editableAgents.length === 0) {
    return new Ok(undefined);
  }

  // Authorization for the scope write — the `publish` capability plus `write`/`admin` on each agent
  // — is enforced inside `AgentResource.bulkUpdateScope` (see the `scope-change-requires-edit-and-
  // publish` contract), which skips any agent the caller is not allowed to (un)publish.
  await AgentResource.bulkUpdateScope(
    auth,
    editableAgents.map((a) => a.sId),
    scope
  );

  return new Ok(undefined);
}

export async function filterAgentsByRequestedSpaces(
  auth: Authenticator,
  agents: AgentConfigurationModel[]
) {
  const uniqSpaceIds = Array.from(
    new Set(agents.flatMap((agent) => agent.requestedSpaceIds))
  );

  const spaces = await SpaceResource.fetchByModelIds(auth, uniqSpaceIds);
  const spaceById = new Map(spaces.map((s) => [s.id, s]));

  // Keep only agents whose every requested space is readable. A missing/deleted space is treated
  // as not readable (see `canReadRequestedSpaces`), so agents referencing one are dropped here too —
  // when a space is deleted its mcp actions are removed and `requestedSpaceIds` updated.
  return agents.filter((agent) =>
    canReadRequestedSpaces(auth, spaceById, agent.requestedSpaceIds)
  );
}
