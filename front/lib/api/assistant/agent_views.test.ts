import { listAgentsForView } from "@app/lib/api/assistant/agent_views";
import { Authenticator } from "@app/lib/auth";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
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
  const agents = await listAgentsForView(auth, "analytics");
  return agents.map((agent) => agent.sId);
}

const REPORTING_ROLES = ["admin", "manager"] as const;

describe("listAgentsForView, default ordering", () => {
  it("defaults to alphabetical ordering", async () => {
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

    const agents = await listAgentsForView(authenticator, "list", {
      namePrefix: "Ordering",
    });

    expect(agents.map((agent) => agent.sId)).toEqual([
      agentA.sId,
      agentB.sId,
      agentC.sId,
    ]);
  });
});

describe("listAgentsForView, 'favorites' view", () => {
  it("lists the favorited default global agents in their default order, and no other global agent", async () => {
    const { authenticator } = await createResourceTest({ role: "user" });
    const [first, second] = (
      await AgentResource.listGlobalAgents(authenticator)
    ).filter((agent) => agent.status === "active");
    const sidekick = await AgentResource.fetchById(
      authenticator,
      GLOBAL_AGENTS_SID.SIDEKICK
    );
    assert(first && second && sidekick);

    for (const agent of [second, sidekick, first]) {
      expect((await agent.setUserFavorite(authenticator, true)).isOk()).toBe(
        true
      );
    }

    const agents = await listAgentsForView(authenticator, "favorites");

    expect(agents.map((agent) => agent.sId)).toEqual([first.sId, second.sId]);
  });
});

describe("listAgentsForView, 'current_user' view", () => {
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

    const agents = await listAgentsForView(authenticator, "current_user");

    expect(agents.map((agent) => agent.sId)).toEqual([retainedAgent.sId]);
  });
});

describe("listAgentsForView, 'analytics' view", () => {
  it.each(REPORTING_ROLES)(
    "lists private agents of other users for %ss",
    async (role) => {
      const { workspace, authenticator: editorAuth } = await createResourceTest(
        {
          role: "user",
        }
      );
      const privateAgent = await AgentConfigurationFactory.createTestAgent(
        editorAuth,
        { name: "Secret agent", scope: "hidden" }
      );
      const auth = await authenticatorForNewMember(workspace, role);

      expect(await listAgentIdsForAnalytics(auth)).toContain(privateAgent.sId);
    }
  );

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

  it.each(REPORTING_ROLES)(
    "lists agents built on spaces the %s is not a member of",
    async (role) => {
      const { workspace, authenticator: editorAuth } = await createResourceTest(
        {
          role: "user",
        }
      );
      const space = await SpaceFactory.regular(
        editorAuth.getNonNullableWorkspace()
      );
      const agent = await AgentConfigurationFactory.createTestAgent(
        editorAuth,
        {
          name: "Restricted agent",
          scope: "visible",
          requestedSpaceIds: [space.id],
        }
      );
      const auth = await authenticatorForNewMember(workspace, role);

      expect(await listAgentIdsForAnalytics(auth)).toContain(agent.sId);
      // The caller is not a member of the space, so every other view still
      // hides the agent: only the analytics view opens it up.
      const listedForAll = await listAgentsForView(auth, "all");
      expect(listedForAll.map((a) => a.sId)).not.toContain(agent.sId);
    }
  );

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

    const listedForMember = await listAgentsForView(memberAuth, "all");
    expect(await listAgentIdsForAnalytics(memberAuth)).toEqual(
      listedForMember.map((agent) => agent.sId)
    );
  });
});

describe("listAgentsForView, 'archived' view", () => {
  async function listAgentIdsForArchived(auth: Authenticator) {
    const agents = await listAgentsForView(auth, "archived");
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
