import { getAgentConfigurationsForView } from "@app/lib/api/assistant/configuration/views";
import { Authenticator } from "@app/lib/auth";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import type { MembershipRoleType } from "@app/types/memberships";
import type { LightWorkspaceType } from "@app/types/user";
import { describe, expect, it } from "vitest";

async function authenticatorForNewMember(
  workspace: LightWorkspaceType,
  role: MembershipRoleType
): Promise<Authenticator> {
  const user = await UserFactory.basic();
  await MembershipFactory.associate(workspace, user, { role });
  return Authenticator.fromUserIdAndWorkspaceId(user.sId, workspace.sId);
}

async function listAgentIdsForAnalytics(auth: Authenticator) {
  const agents = await getAgentConfigurationsForView({
    auth,
    agentsGetView: "analytics",
    variant: "light",
  });
  return agents.map((agent) => agent.sId);
}

describe("getAgentConfigurationsForView, 'analytics' view", () => {
  it("lists private agents of other users for admins", async () => {
    const { workspace, authenticator: editorAuth } = await createResourceTest({
      role: "user",
    });
    const privateAgent = await AgentConfigurationFactory.createTestAgent(
      editorAuth,
      { name: "Secret agent", scope: "hidden" }
    );
    const adminAuth = await authenticatorForNewMember(workspace, "admin");

    expect(await listAgentIdsForAnalytics(adminAuth)).toContain(
      privateAgent.sId
    );
  });

  it("hides private agents of other users below the admin role", async () => {
    const { workspace, authenticator: editorAuth } = await createResourceTest({
      role: "user",
    });
    const privateAgent = await AgentConfigurationFactory.createTestAgent(
      editorAuth,
      { name: "Secret agent", scope: "hidden" }
    );
    const sharedAgent = await AgentConfigurationFactory.createTestAgent(
      editorAuth,
      { name: "Shared agent", scope: "visible" }
    );
    const managerAuth = await authenticatorForNewMember(workspace, "manager");

    const agentIds = await listAgentIdsForAnalytics(managerAuth);
    expect(agentIds).toContain(sharedAgent.sId);
    expect(agentIds).not.toContain(privateAgent.sId);
  });

  it("lists agents built on spaces the admin is not a member of", async () => {
    const { workspace, authenticator: editorAuth } = await createResourceTest({
      role: "user",
    });
    const space = await SpaceFactory.regular(
      editorAuth.getNonNullableWorkspace()
    );
    const agent = await AgentConfigurationFactory.createTestAgent(editorAuth, {
      name: "Restricted agent",
      scope: "visible",
      requestedSpaceIds: [space.id],
    });
    const adminAuth = await authenticatorForNewMember(workspace, "admin");

    expect(await listAgentIdsForAnalytics(adminAuth)).toContain(agent.sId);
    // The admin is not a member of the space, so every other view still hides
    // the agent: only the analytics view opens it up.
    const listedForAdmin = await getAgentConfigurationsForView({
      auth: adminAuth,
      agentsGetView: "all",
      variant: "light",
    });
    expect(listedForAdmin.map((a) => a.sId)).not.toContain(agent.sId);
  });

  it("hides agents built on unreadable spaces below the admin role", async () => {
    const { workspace, authenticator: editorAuth } = await createResourceTest({
      role: "user",
    });
    const space = await SpaceFactory.regular(
      editorAuth.getNonNullableWorkspace()
    );
    const agent = await AgentConfigurationFactory.createTestAgent(editorAuth, {
      name: "Restricted agent",
      scope: "visible",
      requestedSpaceIds: [space.id],
    });
    const managerAuth = await authenticatorForNewMember(workspace, "manager");

    expect(await listAgentIdsForAnalytics(managerAuth)).not.toContain(
      agent.sId
    );
  });

  it("returns the 'all' set to a plain member instead of throwing", async () => {
    const { workspace, authenticator: editorAuth } = await createResourceTest({
      role: "user",
    });
    await AgentConfigurationFactory.createTestAgent(editorAuth, {
      name: "Secret agent",
      scope: "hidden",
    });
    await AgentConfigurationFactory.createTestAgent(editorAuth, {
      name: "Shared agent",
      scope: "visible",
    });
    const memberAuth = await authenticatorForNewMember(workspace, "user");

    const listedForMember = await getAgentConfigurationsForView({
      auth: memberAuth,
      agentsGetView: "all",
      variant: "light",
    });
    expect(await listAgentIdsForAnalytics(memberAuth)).toEqual(
      listedForMember.map((agent) => agent.sId)
    );
  });
});
