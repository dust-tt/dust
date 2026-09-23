import { filterEditableAgents } from "@app/lib/api/assistant/agent_permissions";
import {
  enrichAgentConfigurations,
  getModelForAgentConfiguration,
  redactPrivateAgentConfigurationFields,
} from "@app/lib/api/assistant/configuration/helpers";
import { canAdminSeePrivateEntities } from "@app/lib/api/assistant/configuration/private_entities";
import { getGlobalAgents } from "@app/lib/api/assistant/global_agents/global_agents";
import type { Authenticator } from "@app/lib/auth";
import { getModelsForAuth } from "@app/lib/model_tiers/enabled_models";
import {
  AgentConfigurationModel,
  AgentModel,
} from "@app/lib/models/agent/agent";
import { AgentSuggestionModel } from "@app/lib/models/agent/agent_suggestion";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { invalidateAgentResourceCaches } from "@app/lib/resources/agent_resource_cache";
import { AgentUserRelationResource } from "@app/lib/resources/agent_user_relation_resource";
import { DiscoveryItemResource } from "@app/lib/resources/discovery_item_resource";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { canReadRequestedSpaces } from "@app/lib/resources/permission_utils";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { GroupMembershipModel } from "@app/lib/resources/storage/models/group_memberships";
import { GroupModel } from "@app/lib/resources/storage/models/groups";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { withTransaction } from "@app/lib/utils/sql_utils";
import { tracer } from "@app/logger/tracer";
import { launchDeleteAgentSearchWorkflow } from "@app/temporal/es_indexation/client";
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
import { removeNulls } from "@app/types/shared/utils/general";
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
  const canCreate = auth.hasWorkspacePermission("create", "agent");
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
        name: PENDING_AGENT_PLACEHOLDER_NAME,
        status: "pending",
        scope: "hidden",
        reinforcement: "auto",
        templateId: null,
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

    await AgentResource.fromAgentConfigurationModel(auth, agent).grantEditors(
      auth,
      {
        editors: [user.toJSON()],
        transaction: t,
      }
    );
  });

  // The pending agent's editor grant was created after this authenticator's permission snapshot.
  await auth.refresh();

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

/**
 * Deletes one `agent_configurations` row and keeps its identity consistent: `currentVersion` is
 * moved to the highest remaining version, or the agent is deleted with its grants when no row
 * remains. The row's satellites (tools, tags, skills, editor links, suggestions) must be gone
 * already.
 * Returns whether the agent's identity row is deleted,
 */
export async function destroyAgentConfigurationRow(
  auth: Authenticator,
  {
    agent,
    configurationId,
  }: { agent: AgentResource; configurationId: ModelId },
  transaction: Transaction
): Promise<{ agentDeleted: boolean }> {
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

  // Deleting a row changes (or removes) the agent's current version; invalidate after commit.
  await AgentResource.invalidateCache(workspaceId, agent.sId, transaction);

  const remainingConfiguration = await AgentConfigurationModel.findOne({
    where: { sId: agent.sId, workspaceId },
    order: [["version", "DESC"]],
    transaction,
  });
  if (remainingConfiguration) {
    await agent.setCurrentConfiguration(auth, remainingConfiguration, {
      transaction,
    });
    return { agentDeleted: false };
  }

  await DiscoveryItemResource.deleteAllForItem(auth, {
    type: "agent",
    itemId: agent.sId,
    transaction,
  });
  await agent.destroyPermissionsAndGroups(auth, { transaction });
  await AgentModel.destroy({
    where: { sId: agent.sId, workspaceId },
    transaction,
  });

  return { agentDeleted: true };
}

/**
 * Reflects a destroyed configuration row in the search index: an agent whose last version is gone
 * leaves the index, any other one is reindexed under its new current version.
 */
export async function syncAgentSearchAfterRowDestroyed(
  auth: Authenticator,
  { agent, agentDeleted }: { agent: AgentResource; agentDeleted: boolean }
): Promise<Result<undefined, Error>> {
  if (!agentDeleted) {
    await AgentResource.launchSearchIndexation(auth, [agent.sId]);
    return new Ok(undefined);
  }

  return launchDeleteAgentSearchWorkflow({
    workspaceId: auth.getNonNullableWorkspace().sId,
    agentId: agent.sId,
  });
}

/**
 * Batch-deletes pending agent configurations and their grant groups.
 */
export async function batchHardDeletePendingAgentConfigurations(
  auth: Authenticator,
  agents: AgentConfigurationModel[]
) {
  const workspaceId = auth.getNonNullableWorkspace().id;
  const agentConfigurationModelIds = agents.map((agent) => agent.id);
  const agentModelIds = [...new Set(agents.map((agent) => agent.agentId))];

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

    const groupModelIds = grantGroups.map((group) => group.id);
    if (groupModelIds.length > 0) {
      await GroupMembershipModel.destroy({
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

    // Drop the deleted agents' cached entries once the deletion commits.
    await invalidateAgentResourceCaches(
      workspaceId,
      agents.map((agent) => agent.sId),
      t
    );
  });
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
  // (the manage agents page lists those behind "Show hidden agents"): `fetchByIds` returns those to
  // admins via the agent `admin` verb, and changing the scope touches nothing the spaces protect.
  const agentResources = await AgentResource.fetchByIds(auth, agentIds);

  const archivedAgentNames = agentResources
    .filter((agent) => agent.status === "archived")
    .map((agent) => agent.name);
  if (archivedAgentNames.length > 0) {
    return new Err(
      new Error(
        `Archived agents cannot be updated: ${archivedAgentNames.join(", ")}. Restore them first.`
      )
    );
  }

  const editableAgents = filterEditableAgents(auth, agentResources);
  if (editableAgents.length === 0) {
    return new Ok(undefined);
  }

  // Authorization for the scope write — the `publish` capability plus `write`/`admin` on each agent
  // — is enforced inside `AgentResource.bulkUpdate` -> `updateScopeInPlace` (see the
  // `scope-change-requires-edit-and-publish` contract), which skips any agent the caller is not
  // allowed to (un)publish.
  await AgentResource.bulkUpdate(
    auth,
    editableAgents.map((a) => a.sId),
    {
      scope,
    }
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
