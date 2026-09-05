import { remoteMCPServerNameToSId } from "@app/lib/actions/mcp_helper";
import { shadowUsageConfigIds } from "@app/lib/api/assistant/agent_permissions";
import type { Authenticator } from "@app/lib/auth";
import { GroupResource } from "@app/lib/resources/group_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { getFrontReplicaDbConnection } from "@app/lib/resources/storage";
import type { UsedBySkillType } from "@app/types/assistant/skill_configuration";
import type { AgentsAndSkillsUsageType } from "@app/types/data_source";
import type { ModelId } from "@app/types/shared/model_id";
import { QueryTypes } from "sequelize";

// To use in case of heavy db load emergency with these usages queries
// If it is a problem, let's add caching
const DISABLE_QUERIES = false;

export type MCPServersUsage = Record<string, AgentsAndSkillsUsageType>;

interface MCPServerUsageRow {
  internalMCPServerId: string | null;
  remoteMCPServerId: ModelId | null;
  names: string[];
  sIds: string[];
  pictureUrls: string[];
}

/**
 * Returns the list of agent IDs visible to the current user (used for
 * non-admin visibility filtering).
 */
async function getVisibleAgentIds(auth: Authenticator): Promise<ModelId[]> {
  const groups = await GroupResource.findAgentIdsForGroups(
    auth,
    auth.groupModelIds()
  );
  return shadowUsageConfigIds(
    auth,
    groups.map((group) => group.agentConfigurationId),
    "getToolsUsage"
  );
}

/**
 * Builds the visibility WHERE clause and query replacements depending on
 * whether the caller is an admin or a regular user.
 */
async function buildVisibilityFilter(auth: Authenticator): Promise<{
  clause: string;
  params: Record<string, unknown>;
}> {
  const workspaceId = auth.getNonNullableWorkspace().id;

  if (auth.isAdmin()) {
    return {
      clause: `ac."status" = 'active' AND ac."workspaceId" = :workspace_id`,
      params: { workspace_id: workspaceId },
    };
  }

  const agentIds = await getVisibleAgentIds(auth);

  return {
    clause: `ac."status" = 'active'
        AND ac."workspaceId" = :workspace_id
        AND (ac."scope" = 'visible' OR ac."id" IN (:agent_ids))`,
    params: {
      workspace_id: workspaceId,
      agent_ids: agentIds.length > 0 ? agentIds : [-1],
    },
  };
}

function rowToUsageEntry(
  row: MCPServerUsageRow,
  workspaceId: ModelId
): { key: string; usage: AgentsAndSkillsUsageType } {
  const key =
    row.internalMCPServerId ||
    remoteMCPServerNameToSId({
      remoteMCPServerId: row.remoteMCPServerId!,
      workspaceId,
    });

  return {
    key,
    usage: {
      count: row.sIds.length,
      agents: row.sIds.map((sId, index) => ({
        sId,
        name: row.names[index],
        pictureUrl: row.pictureUrls[index],
      })),
      skills: [],
    },
  };
}

async function fetchSkillsByMCPServer(
  auth: Authenticator
): Promise<Map<string, UsedBySkillType[]>> {
  const workspaceSkills = await SkillResource.listByWorkspace(auth, {
    status: "active",
    withInstructions: false,
    withTools: true,
    withFileAttachments: false,
  });
  const skills = auth.isAdmin()
    ? workspaceSkills
    : workspaceSkills.filter(
        (skill) => skill.availability !== "editors" || skill.canWrite(auth)
      );

  const skillsByMCPServer = new Map<string, UsedBySkillType[]>();
  for (const skill of skills) {
    const usedBySkill: UsedBySkillType = {
      sId: skill.sId,
      name: skill.name,
      icon: skill.icon,
    };
    for (const mcpServerId of new Set(
      skill.mcpServerViews.map((view) => view.mcpServerId)
    )) {
      const usedBySkills = skillsByMCPServer.get(mcpServerId) ?? [];
      usedBySkills.push(usedBySkill);
      skillsByMCPServer.set(mcpServerId, usedBySkills);
    }
  }

  for (const usedBySkills of skillsByMCPServer.values()) {
    usedBySkills.sort((a, b) => a.name.localeCompare(b.name));
  }

  return skillsByMCPServer;
}

export async function getToolsUsage(
  auth: Authenticator
): Promise<MCPServersUsage> {
  const owner = auth.workspace();

  if (!owner || !auth.isUser()) {
    return {};
  }

  if (DISABLE_QUERIES) {
    return {};
  }

  const replicaDb = getFrontReplicaDbConnection();

  const { clause, params } = await buildVisibilityFilter(auth);

  // biome-ignore lint/plugin/noRawSql: Read-only analytics query on replica.
  const rows = await replicaDb.query<MCPServerUsageRow>(
    `
    SELECT
      msv."internalMCPServerId",
      msv."remoteMCPServerId",
      array_agg(ac."name" ORDER BY ac."name")       AS "names",
      array_agg(ac."sId" ORDER BY ac."name")         AS "sIds",
      array_agg(ac."pictureUrl" ORDER BY ac."name")  AS "pictureUrls"
    FROM agent_configurations ac
    INNER JOIN agent_mcp_server_configurations amsc
      ON amsc."agentConfigurationId" = ac."id"
    INNER JOIN mcp_server_views msv
      ON msv."id" = amsc."mcpServerViewId"
    WHERE ${clause}
    GROUP BY msv."internalMCPServerId", msv."remoteMCPServerId"
    `,
    { replacements: params, type: QueryTypes.SELECT }
  );
  const result: MCPServersUsage = {};
  for (const row of rows) {
    const { key, usage } = rowToUsageEntry(row, owner.id);
    result[key] = usage;
  }

  const skillsByMCPServer = await fetchSkillsByMCPServer(auth);
  for (const [mcpServerId, skills] of skillsByMCPServer) {
    const usage = result[mcpServerId];
    if (usage) {
      usage.skills = skills;
      usage.count += skills.length;
    } else {
      result[mcpServerId] = {
        count: skills.length,
        agents: [],
        skills,
      };
    }
  }

  return result;
}
