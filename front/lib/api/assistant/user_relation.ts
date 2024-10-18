import type { Result } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";

import { getAgentConfiguration } from "@app/lib/api/assistant/configuration";
import type { Authenticator } from "@app/lib/auth";
import { AgentUserRelation } from "@app/lib/models/assistant/agent";

export async function setAgentUserFavorite({
  auth,
  agentId,
  userFavorite,
}: {
  auth: Authenticator;
  agentId: string;
  userFavorite: boolean;
}): Promise<
  Result<
    {
      agentId: string;
      userFavorite: boolean;
    },
    Error
  >
> {
  const agentConfiguration = await getAgentConfiguration(auth, agentId);
  if (!agentConfiguration) {
    return new Err(new Error(`Could not find agent configuration ${agentId}`));
  }

  const [userId, workspaceId] = [auth.user()?.id, auth.workspace()?.id];
  if (!userId || !workspaceId || !auth.isUser()) {
    return new Err(new Error("User or workspace not found"));
  }

  if (agentConfiguration.status !== "active") {
    return new Err(new Error("Agent is not active"));
  }

  await AgentUserRelation.upsert({
    userId,
    workspaceId,
    agentConfiguration: agentConfiguration.sId,
    favorite: userFavorite,
  });

  return new Ok({
    agentId,
    userFavorite,
  });
}
