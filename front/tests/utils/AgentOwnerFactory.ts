import { Authenticator } from "@app/lib/auth";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import type { LightWorkspaceType } from "@app/types/user";

export async function setupAgentOwner(
  workspace: LightWorkspaceType,
  agentOwnerRole: "admin" | "builder" | "user"
) {
  const agentOwner = await UserFactory.basic();
  await MembershipFactory.associate(workspace, agentOwner, {
    role: agentOwnerRole,
  });
  const agentOwnerAuth = await Authenticator.fromUserIdAndWorkspaceId(
    agentOwner.sId,
    workspace.sId
  );
  return { agentOwner, agentOwnerAuth };
}
