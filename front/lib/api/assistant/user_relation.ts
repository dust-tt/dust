import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import type { Authenticator } from "@app/lib/auth";
import { AgentUserRelationModel } from "@app/lib/models/agent/agent";
import type { Result } from "@app/types";
import { Err, Ok } from "@app/types";

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
  const agentConfiguration = await getAgentConfiguration(auth, {
    agentId,
    variant: "light",
  });
  if (!agentConfiguration) {
    return new Err(new Error(`Could not find agent configuration ${agentId}`));
  }

  const user = auth.getNonNullableUser();
  const workspace = auth.getNonNullableWorkspace();

  if (agentConfiguration.status !== "active") {
    return new Err(new Error("Agent is not active"));
  }

  await AgentUserRelationModel.upsert({
    userId: user.id,
    workspaceId: workspace.id,
    agentConfiguration: agentConfiguration.sId,
    favorite: userFavorite,
  });

  return new Ok({
    agentId,
    userFavorite,
  });
}
