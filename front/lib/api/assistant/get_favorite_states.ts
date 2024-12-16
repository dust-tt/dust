import { Op } from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import { AgentUserRelation } from "@app/lib/models/assistant/agent";

export async function getFavoriteStates(
  auth: Authenticator,
  {
    configurationIds,
  }: {
    configurationIds: string[];
  }
): Promise<Map<string, boolean>> {
  const user = auth.getNonNullableUser();

  if (configurationIds.length === 0) {
    return new Map();
  }

  const relations = await AgentUserRelation.findAll({
    where: {
      workspaceId: auth.getNonNullableWorkspace().id,
      agentConfiguration: { [Op.in]: configurationIds },
      userId: user.id,
    },
  });

  return relations.reduce((acc, relation) => {
    acc.set(relation.agentConfiguration, relation.favorite);
    return acc;
  }, new Map<string, boolean>());
}
