import { AgentVisibilityOverrideType } from "@dust-tt/types";

import { getAgentConfiguration } from "@app/lib/api/assistant/configuration";
import { Authenticator } from "@app/lib/auth";
import { Membership } from "@app/lib/models";
import { MemberAgentVisibility } from "@app/lib/models/assistant/agent";
import { Err, Ok, Result } from "@app/lib/result";

export async function setVisibilityOverrideForUser({
  auth,
  agentId,
  visibility,
}: {
  auth: Authenticator;
  agentId: string;
  visibility: AgentVisibilityOverrideType;
}): Promise<
  Result<
    { visibility: AgentVisibilityOverrideType; created: boolean | null },
    Error
  >
> {
  const agentConfiguration = await getAgentConfiguration(auth, agentId);
  if (!agentConfiguration)
    return new Err(new Error(`Could not find agent configuration ${agentId}`));
  const [userId, workspaceId] = [auth.user()?.id, auth.workspace()?.id];
  const membership = await Membership.findOne({
    where: { userId, workspaceId },
  });
  if (!membership)
    return new Err(
      new Error(`Could not find membership (user ${userId} ws ${workspaceId})`)
    );

  const [memberAgentVisibility, created] = await MemberAgentVisibility.upsert({
    membershipId: membership.id,
    agentConfigurationId: agentConfiguration.id,
    visibility: visibility,
  });
  return new Ok({ visibility: memberAgentVisibility.visibility, created });
}

export async function deleteVisibilityOverrideForUser({
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
  const membership = await Membership.findOne({
    where: { userId, workspaceId },
  });
  if (!membership)
    return new Err(
      new Error(`Could not find membership (user ${userId} ws ${workspaceId})`)
    );

  if (agentConfiguration.scope === "private") {
    return new Err(
      new Error(
        "Cannot remove visibility entry for a 'private'-scope assistant. Please delete the assistant instead."
      )
    );
  }
  await MemberAgentVisibility.destroy({
    where: {
      membershipId: membership.id,
      agentConfigurationId: agentConfiguration.id,
    },
  });

  return new Ok({ success: true });
}
