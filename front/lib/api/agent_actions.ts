import { remoteMCPServerNameToSId } from "@app/lib/actions/mcp_helper";
import type { Authenticator } from "@app/lib/auth";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { getFrontReplicaDbConnection } from "@app/lib/resources/storage";
import type {
  SkillUsageType,
  UsedBySkillType,
} from "@app/types/assistant/skill_configuration";
import type { ModelId } from "@app/types/shared/model_id";
import { QueryTypes } from "sequelize";

// To use in case of heavy db load emergency with these usages queries
// If it is a problem, let's add caching
const DISABLE_QUERIES = false;

export type MCPServersUsage = Record<string, SkillUsageType>;

interface MCPServerUsageRow {
  internalMCPServerId: string | null;
  remoteMCPServerId: ModelId | null;
  names: string[];
  sIds: string[];
  pictureUrls: string[];
}

function rowToUsageEntry(
  row: MCPServerUsageRow,
  workspaceId: ModelId
): { key: string; usage: SkillUsageType } {
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
  const skills = await SkillResource.listByWorkspace(auth, {
    status: "active",
    withInstructions: false,
    withTools: true,
    withFileAttachments: false,
  });

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
  const owner = auth.getNonNullableWorkspace();

  if (DISABLE_QUERIES) {
    return {};
  }

  const replicaDb = getFrontReplicaDbConnection();

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
    WHERE ac."status" = 'active' AND ac."workspaceId" = :workspace_id
    GROUP BY msv."internalMCPServerId", msv."remoteMCPServerId"
    `,
    {
      replacements: { workspace_id: owner.id },
      type: QueryTypes.SELECT,
    }
  );
  const skillsByMCPServer = await fetchSkillsByMCPServer(auth);

  const result: MCPServersUsage = {};
  for (const row of rows) {
    const { key, usage } = rowToUsageEntry(row, owner.id);
    result[key] = usage;
  }

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
