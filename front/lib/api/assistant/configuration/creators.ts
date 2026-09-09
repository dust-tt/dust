import type { Authenticator } from "@app/lib/auth";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { Op } from "@app/lib/resources/storage/data_types";
import { UserResource } from "@app/lib/resources/user_resource";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";

export async function getAgentsCreators(
  auth: Authenticator,
  agents: LightAgentConfigurationType[]
): Promise<Map<string, UserResource | null>> {
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

  const creatorModelIdById = new Map<string, number>();
  for (const row of rows) {
    creatorModelIdById.set(row.sId, row.authorId);
  }

  const uniqueModelIds = [...new Set(creatorModelIdById.values())];
  const users = await UserResource.fetchByModelIds(uniqueModelIds);
  const userByModelId = new Map(users.map((u) => [u.id, u]));

  const result = new Map<string, UserResource | null>();
  for (const agent of agents) {
    if (agent.scope === "global") {
      result.set(agent.sId, null);
      continue;
    }
    const modelId = creatorModelIdById.get(agent.sId);
    result.set(
      agent.sId,
      modelId !== undefined ? (userByModelId.get(modelId) ?? null) : null
    );
  }

  return result;
}
