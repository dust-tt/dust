import type {
  AgentUserListStatus,
  LightAgentConfigurationType,
  Result,
} from "@dust-tt/types";
import { assertNever, Err, Ok } from "@dust-tt/types";

import { getAgentConfiguration } from "@app/lib/api/assistant/configuration";
import type { Authenticator } from "@app/lib/auth";
import { AgentUserRelation } from "@app/lib/models/assistant/agent";

export function agentUserListStatus({
  agentConfiguration,
  listStatusOverride,
}: {
  agentConfiguration: LightAgentConfigurationType;
  listStatusOverride: AgentUserListStatus | null;
}): AgentUserListStatus {
  if (listStatusOverride === null) {
    switch (agentConfiguration.scope) {
      case "global":
      case "workspace":
      case "private":
        return "in-list";
      case "published":
        return "not-in-list";
      default:
        assertNever(agentConfiguration.scope);
    }
  }

  return listStatusOverride;
}

export async function getAgentUserListStatus({
  auth,
  agentId,
}: {
  auth: Authenticator;
  agentId: string;
}): Promise<Result<AgentUserListStatus, Error>> {
  const agentConfiguration = await getAgentConfiguration(auth, agentId);

  if (!agentConfiguration)
    return new Err(new Error(`Could not find agent configuration ${agentId}`));

  const [userId, workspaceId] = [auth.user()?.id, auth.workspace()?.id];
  if (!userId || !workspaceId || !auth.isUser())
    return new Err(new Error("User or workspace not found"));

  if (agentConfiguration.status !== "active") {
    return new Ok("not-in-list");
  }

  const agentRelation = await AgentUserRelation.findOne({
    where: {
      userId,
      workspaceId,
      agentConfiguration: agentConfiguration.sId,
    },
  });

  return new Ok(
    agentUserListStatus({
      agentConfiguration,
      listStatusOverride: agentRelation?.listStatusOverride ?? null,
    })
  );
}

export async function setAgentUserListStatus({
  auth,
  agentId,
  listStatus,
}: {
  auth: Authenticator;
  agentId: string;
  listStatus: AgentUserListStatus;
}): Promise<
  Result<
    {
      agentId: string;
      listStatus: AgentUserListStatus;
    },
    Error
  >
> {
  const agentConfiguration = await getAgentConfiguration(auth, agentId);
  if (!agentConfiguration)
    return new Err(new Error(`Could not find agent configuration ${agentId}`));

  const [userId, workspaceId] = [auth.user()?.id, auth.workspace()?.id];
  if (!userId || !workspaceId || !auth.isUser())
    return new Err(new Error("User or workspace not found"));

  if (agentConfiguration.status !== "active") {
    return new Err(new Error("Agent is not active"));
  }
  if (agentConfiguration.scope === "private") {
    return new Err(new Error("Private agents cannot be removed from list"));
  }

  await AgentUserRelation.upsert({
    userId,
    workspaceId,
    agentConfiguration: agentConfiguration.sId,
    listStatusOverride: listStatus,
  });

  return new Ok({
    agentId,
    listStatus,
  });
}
