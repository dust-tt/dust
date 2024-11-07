import { Op } from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import { AgentUserRelation } from "@app/lib/models/assistant/agent";

export async function getFavoriteStates({
  auth,
  configurationSIds,
}: {
  auth: Authenticator;
  configurationSIds: string[];
}): Promise<Map<string, boolean>> {
  const [userId, workspaceId] = [auth.user()?.id, auth.workspace()?.id];
  if (!userId || !workspaceId || !auth.isUser()) {
    throw new Error("User or workspace not found");
  }

  if (configurationSIds.length === 0) {
    return new Map();
  }

  const relations = await AgentUserRelation.findAll({
    where: {
      agentConfiguration: { [Op.in]: configurationSIds },
      userId,
    },
  });

  return relations.reduce((acc, relation) => {
    acc.set(relation.agentConfiguration, relation.favorite);
    return acc;
  }, new Map<string, boolean>());
}
