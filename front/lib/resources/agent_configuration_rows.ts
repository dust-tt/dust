import type { Authenticator } from "@app/lib/auth";
import {
  AgentConfigurationModel,
  AgentModel,
} from "@app/lib/models/agent/agent";
import type {
  ModelIdType,
  ModelProviderIdType,
} from "@app/types/assistant/models/types";
import type { ModelId } from "@app/types/shared/model_id";
import type { Transaction } from "sequelize";
import { col, fn, Op } from "sequelize";

// Workspace-wide reads of agent configuration rows: plain data about every agent of the workspace,
// for callers that need the whole workspace whatever they can read (name uniqueness, model
// availability, usage listings, space cleanup). A leaf module, like `agent_resource_cache`, so lower
// level paths that `AgentResource` itself depends on can use it without an import cycle.
// An agent's status lives on its `agents` row; the versioned fields on its current configuration
// row, joined on `agents.currentVersion` (see `agent-current-version-pointer`).

const activeAgentInclude = {
  model: AgentModel,
  required: true,
  attributes: [],
  where: { status: "active" as const },
};

const currentVersionWhere = { version: { [Op.col]: "agent.currentVersion" } };

// The names of every active agent of the workspace, from their current configuration row.
export async function listActiveAgentNames(
  auth: Authenticator
): Promise<string[]> {
  const configurations = await AgentConfigurationModel.findAll({
    attributes: ["name"],
    where: {
      workspaceId: auth.getNonNullableWorkspace().id,
      ...currentVersionWhere,
    },
    include: [activeAgentInclude],
  });
  return configurations.map((configuration) => configuration.name);
}

// The model of every active agent of the workspace.
export async function listActiveAgentModels(
  auth: Authenticator
): Promise<
  { agentId: string; providerId: ModelProviderIdType; modelId: ModelIdType }[]
> {
  const configurations = await AgentConfigurationModel.findAll({
    attributes: ["sId", "providerId", "modelId"],
    where: {
      workspaceId: auth.getNonNullableWorkspace().id,
      ...currentVersionWhere,
    },
    include: [activeAgentInclude],
  });
  return configurations.map(({ sId, providerId, modelId }) => ({
    agentId: sId,
    providerId,
    modelId,
  }));
}

// For each agent, every author of one of its versions with the latest version they authored.
export async function listVersionAuthors(
  auth: Authenticator,
  agentIds: string[]
): Promise<{ agentId: string; authorId: ModelId; version: number }[]> {
  if (agentIds.length === 0) {
    return [];
  }

  const rows = await AgentConfigurationModel.findAll({
    attributes: ["sId", "authorId", [fn("MAX", col("version")), "version"]],
    group: ["sId", "authorId"],
    where: {
      workspaceId: auth.getNonNullableWorkspace().id,
      sId: { [Op.in]: agentIds },
    },
  });

  return rows.map((row) => ({
    agentId: row.get("sId") as string,
    authorId: row.get("authorId") as ModelId,
    // `version` is aliased from MAX(version) so read it via get().
    version: row.get("version") as number,
  }));
}

// The identity of active configuration rows (restricted to `configurationModelIds` when given).
// With `usageVisibleOnly`, a non-admin caller only gets the visible ones and the versions of the
// agents they hold `write` on.
export async function listActiveConfigurationIdentities(
  auth: Authenticator,
  {
    configurationModelIds,
    usageVisibleOnly,
  }: { configurationModelIds?: ModelId[]; usageVisibleOnly: boolean }
): Promise<{ id: ModelId; sId: string; name: string; pictureUrl: string }[]> {
  if (configurationModelIds?.length === 0) {
    return [];
  }

  const workspaceId = auth.getNonNullableWorkspace().id;
  const writableAgents = auth.getResourceIdsWithVerb("agent", "write");
  const restrictToUsageVisible =
    usageVisibleOnly && !auth.isAdmin() && writableAgents.kind !== "all";

  return AgentConfigurationModel.findAll({
    raw: true,
    attributes: ["id", "sId", "name", "pictureUrl"],
    where: {
      workspaceId,
      status: "active",
      ...(configurationModelIds
        ? { id: { [Op.in]: configurationModelIds } }
        : {}),
      ...(restrictToUsageVisible
        ? {
            [Op.or]: [
              { scope: "visible" },
              { agentId: { [Op.in]: writableAgents.resourceIds } },
            ],
          }
        : {}),
    },
  });
}

// The current configuration rows of active agents whose requested spaces include `spaceModelId`.
export async function listActiveConfigurationsRequestingSpace(
  auth: Authenticator,
  spaceModelId: ModelId,
  { transaction }: { transaction?: Transaction } = {}
): Promise<
  { agentConfigurationModelId: ModelId; requestedSpaceIds: ModelId[] }[]
> {
  const configurations = await AgentConfigurationModel.findAll({
    attributes: ["id", "requestedSpaceIds"],
    where: {
      workspaceId: auth.getNonNullableWorkspace().id,
      ...currentVersionWhere,
      requestedSpaceIds: { [Op.contains]: [spaceModelId] },
    },
    include: [activeAgentInclude],
    transaction,
  });
  return configurations.map(({ id, requestedSpaceIds }) => ({
    agentConfigurationModelId: id,
    requestedSpaceIds,
  }));
}
