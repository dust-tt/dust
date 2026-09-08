import type { Authenticator } from "@app/lib/auth";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { Op } from "@app/lib/resources/storage/data_types";
import { UserResource } from "@app/lib/resources/user_resource";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";

export async function getAgentsCreators(
  auth: Authenticator,
  agents: LightAgentConfigurationType[]
): Promise<Map<string, string | null>> {
  const nonGlobalAgents = agents.filter((a) => a.scope !== "global");
  const sIds = nonGlobalAgents.map((a) => a.sId);

  if (sIds.length === 0) {
    return new Map(agents.map((a) => [a.sId, null]));
  }

  const rows = await AgentConfigurationModel.findAll({
    attributes: ["sId", "authorId"],
    where: {
      workspaceId: auth.getNonNullableWorkspace().id,
      sId: { [Op.in]: sIds },
      version: 0,
    },
  });

  const creatorModelIdBySId = new Map<string, number>();
  for (const row of rows) {
    creatorModelIdBySId.set(row.sId, row.authorId);
  }

  const uniqueModelIds = [...new Set(creatorModelIdBySId.values())];
  const users = await UserResource.fetchByModelIds(uniqueModelIds);
  const userSIdByModelId = new Map(users.map((u) => [u.id, u.sId]));

  const result = new Map<string, string | null>();
  for (const agent of agents) {
    if (agent.scope === "global") {
      result.set(agent.sId, null);
      continue;
    }
    const modelId = creatorModelIdBySId.get(agent.sId);
    result.set(
      agent.sId,
      modelId !== undefined ? (userSIdByModelId.get(modelId) ?? null) : null
    );
  }

  return result;
}
