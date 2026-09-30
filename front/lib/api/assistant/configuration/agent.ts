import { filterEditableAgents } from "@app/lib/api/assistant/agent_permissions";
import { enrichAgentConfigurations } from "@app/lib/api/assistant/configuration/helpers";
import { getGlobalAgents } from "@app/lib/api/assistant/global_agents/global_agents";
import type { Authenticator } from "@app/lib/auth";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { canReadRequestedSpaces } from "@app/lib/resources/permission_utils";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { tracer } from "@app/logger/tracer";
import type {
  AgentConfigurationScope,
  AgentConfigurationType,
  AgentFetchVariant,
  GlobalAgentContext,
  LightAgentConfigurationType,
} from "@app/types/assistant/agent";
import { isGlobalAgentId } from "@app/types/assistant/assistant";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { removeNulls } from "@app/types/shared/utils/general";
import { Op, QueryTypes } from "sequelize";

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
