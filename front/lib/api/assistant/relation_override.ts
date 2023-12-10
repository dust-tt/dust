import { AgentRelationOverrideType } from "@dust-tt/types";
import { Err, Ok, Result } from "@dust-tt/types";

import { getAgentConfiguration } from "@app/lib/api/assistant/configuration";
import { Authenticator } from "@app/lib/auth";
import {
  AgentConfiguration,
  AgentUserRelation,
} from "@app/lib/models/assistant/agent";

/**
 *
 * @returns Map of agentId to relation override
 */
export async function getAgentRelationOverridesForUser(
  auth: Authenticator
): Promise<
  Result<
    {
      [assistantId: string]: AgentRelationOverrideType;
    },
    Error
  >
> {
  const [userId, workspaceId] = [auth.user()?.id, auth.workspace()?.id];
  if (!userId || !workspaceId || !auth.isUser())
    return new Err(new Error("User or workspace not found"));
  const agentRelations = await AgentUserRelation.findAll({
    where: { userId, workspaceId },
    include: [
      {
        model: AgentConfiguration,
        attributes: ["sId"],
      },
    ],
  });
  const agentRelationOverrides = agentRelations.reduce(
    (acc, agentRelation) => {
      acc[agentRelation.agentConfiguration.sId] = agentRelation.relation;
      return acc;
    },
    {} as {
      [assistantId: string]: AgentRelationOverrideType;
    }
  );
  return new Ok(agentRelationOverrides);
}

export async function getAgentRelationOverrideForUser({
  auth,
  agentId,
}: {
  auth: Authenticator;
  agentId: string;
}): Promise<Result<AgentRelationOverrideType | null, Error>> {
  const agentConfiguration = await getAgentConfiguration(auth, agentId);
  if (!agentConfiguration)
    return new Err(new Error(`Could not find agent configuration ${agentId}`));
  const [userId, workspaceId] = [auth.user()?.id, auth.workspace()?.id];
  if (!userId || !workspaceId || !auth.isUser())
    return new Err(new Error("User or workspace not found"));
  const agentRelation = await AgentUserRelation.findOne({
    where: {
      userId,
      workspaceId,
      agentConfigurationId: agentConfiguration.id,
    },
  });
  if (!agentRelation) return new Ok(null);
  return new Ok(agentRelation.relation);
}

export async function setAgentRelationOverrideForUser({
  auth,
  agentId,
  relation,
}: {
  auth: Authenticator;
  agentId: string;
  relation: AgentRelationOverrideType;
}): Promise<
  Result<
    {
      agentRelationOverride: AgentRelationOverrideType;
      created: boolean | null;
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
  const [agentRelation, created] = await AgentUserRelation.upsert({
    userId,
    workspaceId,
    agentConfigurationId: agentConfiguration.id,
    relation,
  });
  return new Ok({ agentRelationOverride: agentRelation.relation, created });
}

export async function deleteAgentRelationOverrideForUser({
  auth,
  agentId,
}: {
  auth: Authenticator;
  agentId: string;
}): Promise<Result<{ success: boolean }, Error>> {
  const agentConfiguration = await getAgentConfiguration(auth, agentId);
  if (!agentConfiguration)
    return new Err(new Error(`Could not find agent configuration ${agentId}`));
  const [userId, workspaceId] = [auth.user()?.id, auth.workspace()?.id];
  if (!userId || !workspaceId || !auth.isUser())
    return new Err(new Error("User or workspace not found"));
  await AgentUserRelation.destroy({
    where: {
      userId,
      workspaceId,
      agentConfigurationId: agentConfiguration.id,
    },
  });

  return new Ok({ success: true });
}
