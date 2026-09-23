import { getAgentConfigurationsForView } from "@app/lib/api/assistant/configuration/views";
import { Authenticator } from "@app/lib/auth";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import type { MembershipRoleType } from "@app/types/memberships";
import { Ok } from "@app/types/shared/result";
import type { LightWorkspaceType } from "@app/types/user";
import assert from "assert";
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

const REPORTING_ROLES = ["admin", "manager"] as const;

describe("getAgentConfigurationsForView, default ordering", () => {
  it.each([
    undefined,
    2,
  ])("defaults to alphabetical ordering with limit=%s", async (limit) => {
    const { authenticator } = await createResourceTest({});
    const agentC = await AgentConfigurationFactory.createTestAgent(
      authenticator,
      { name: "Ordering C" }
    );
    const agentB = await AgentConfigurationFactory.createTestAgent(
      authenticator,
      { name: "Ordering B" }
    );
    const agentA = await AgentConfigurationFactory.createTestAgent(
      authenticator,
      { name: "Ordering A" }
    );

    const agents = await getAgentConfigurationsForView({
      auth: authenticator,
      agentsGetView: "list",
      variant: "light",
      agentPrefix: "Ordering",
      limit,
    });

    expect(agents.map((agent) => agent.sId)).toEqual(
      [agentA.sId, agentB.sId, agentC.sId].slice(0, limit)
    );
  });
});

describe("getAgentConfigurationsForView, 'current_user' view", () => {
  it("hides an authored hidden agent after its editor grant is removed", async () => {
    const { authenticator, user } = await createResourceTest({ role: "user" });
    const retainedAgent = await AgentConfigurationFactory.createTestAgent(
      authenticator,
      { name: "Still editable", scope: "hidden" }
    );
    const revokedAgent = await AgentConfigurationFactory.createTestAgent(
      authenticator,
      { name: "No longer editable", scope: "hidden" }
    );
    const resource = await AgentResource.fetchById(
      authenticator,
      revokedAgent.sId
    );
    assert(resource !== null);
    assert(resource.id !== null);

    expect(
      (
        await GroupPermissionResource.revokeFromUser(authenticator, {
          user: user.toJSON(),
          resourceType: "agent",
          resourceId: resource.id,
          grantType: "editor",
        })
      ).isOk()
    ).toBe(true);
    await authenticator.refresh();

    const agents = await getAgentConfigurationsForView({
      auth: authenticator,
      agentsGetView: "current_user",
      variant: "light",
    });

    expect(agents.map((agent) => agent.sId)).toEqual([retainedAgent.sId]);
  });
});

describe("getAgentConfigurationsForView, 'analytics' view", () => {
  it.each(
    REPORTING_ROLES
  )("lists private agents of other users for %ss", async (role) => {
    const { workspace, authenticator: editorAuth } = await createResourceTest({
      role: "user",
    });
    const privateAgent = await AgentConfigurationFactory.createTestAgent(
      editorAuth,
      { name: "Secret agent", scope: "hidden" }
    );
    const auth = await authenticatorForNewMember(workspace, role);

    expect(await listAgentIdsForAnalytics(auth)).toContain(privateAgent.sId);
  });

  it("hides private agents of other users below the manager role", async () => {
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
    const memberAuth = await authenticatorForNewMember(workspace, "user");

    const agentIds = await listAgentIdsForAnalytics(memberAuth);
    expect(agentIds).toContain(sharedAgent.sId);
    expect(agentIds).not.toContain(privateAgent.sId);
  });

  it.each(
    REPORTING_ROLES
  )("lists agents built on spaces the %s is not a member of", async (role) => {
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
    const auth = await authenticatorForNewMember(workspace, role);

    expect(await listAgentIdsForAnalytics(auth)).toContain(agent.sId);
    // The caller is not a member of the space, so every other view still
    // hides the agent: only the analytics view opens it up.
    const listedForAll = await getAgentConfigurationsForView({
      auth,
      agentsGetView: "all",
      variant: "light",
    });
    expect(listedForAll.map((a) => a.sId)).not.toContain(agent.sId);
  });

  it("hides agents built on unreadable spaces below the manager role", async () => {
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
    const memberAuth = await authenticatorForNewMember(workspace, "user");

    expect(await listAgentIdsForAnalytics(memberAuth)).not.toContain(agent.sId);
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

describe("getAgentConfigurationsForView, 'archived' view", () => {
  async function listAgentIdsForArchived(auth: Authenticator) {
    const agents = await getAgentConfigurationsForView({
      auth,
      agentsGetView: "archived",
      variant: "light",
    });
    return agents.map((agent) => agent.sId);
  }

  it("lets an admin find an archived agent built on a space they are not a member of", async () => {
    const { workspace, authenticator: editorAuth } = await createResourceTest({
      role: "user",
    });
    const space = await SpaceFactory.regular(
      editorAuth.getNonNullableWorkspace()
    );
    const agent = await AgentConfigurationFactory.createTestAgent(editorAuth, {
      name: "Restricted archived agent",
      scope: "visible",
      requestedSpaceIds: [space.id],
    });
    // Archiving reads the agent first: an actor scoped to editorAuth's own groups cannot see an
    // agent on a space it never joined, so the archive itself needs every-space visibility.
    const everySpaceAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId,
      { dangerouslyRequestAllGroups: true }
    );
    expect(
      await (await AgentResource.fetchById(everySpaceAuth, agent.sId))!.archive(
        everySpaceAuth
      )
    ).toEqual(new Ok(true));

    const adminAuth = await authenticatorForNewMember(workspace, "admin");

    expect(await listAgentIdsForArchived(adminAuth)).toContain(agent.sId);
  });

  it("still hides an archived agent on an unreadable space from a plain member", async () => {
    const { workspace, authenticator: editorAuth } = await createResourceTest({
      role: "user",
    });
    const space = await SpaceFactory.regular(
      editorAuth.getNonNullableWorkspace()
    );
    const agent = await AgentConfigurationFactory.createTestAgent(editorAuth, {
      name: "Restricted archived agent",
      scope: "visible",
      requestedSpaceIds: [space.id],
    });
    const everySpaceAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId,
      { dangerouslyRequestAllGroups: true }
    );
    await (await AgentResource.fetchById(everySpaceAuth, agent.sId))!.archive(
      everySpaceAuth
    );

    const memberAuth = await authenticatorForNewMember(workspace, "user");

    expect(await listAgentIdsForArchived(memberAuth)).not.toContain(agent.sId);
  });

  it("hides an archived agent from a non-editor with space access", async () => {
    const { workspace, authenticator: editorAuth } = await createResourceTest({
      role: "user",
    });
    const agent = await AgentConfigurationFactory.createTestAgent(editorAuth, {
      name: "Private archived agent",
      scope: "hidden",
    });
    const everySpaceAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId,
      { dangerouslyRequestAllGroups: true }
    );
    await (await AgentResource.fetchById(everySpaceAuth, agent.sId))!.archive(
      everySpaceAuth
    );

    const memberAuth = await authenticatorForNewMember(workspace, "user");

    expect(await listAgentIdsForArchived(memberAuth)).not.toContain(agent.sId);
  });
});
