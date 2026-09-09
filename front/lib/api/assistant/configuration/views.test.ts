import { archiveAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { getAgentIdFromName } from "@app/lib/api/assistant/configuration/helpers";
import { getAgentConfigurationsForView } from "@app/lib/api/assistant/configuration/views";
import { Authenticator } from "@app/lib/auth";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { AgentUserRelationResource } from "@app/lib/resources/agent_user_relation_resource";
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

const REPORTING_ROLES = ["admin", "manager"] as const;

describe("resource-owned agent listing compatibility", () => {
  it("keeps name lookup scoped to active versions in the caller's workspace", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "admin" });
    const other = await createResourceTest({ role: "admin" });
    const name = "Lookup scoped agent";
    const agent = await AgentConfigurationFactory.createTestAgent(auth, {
      name,
    });
    const foreign = await AgentConfigurationFactory.createTestAgent(
      other.authenticator,
      { name }
    );

    expect(await getAgentIdFromName(auth, name)).toBe(agent.sId);
    expect(await getAgentIdFromName(other.authenticator, name)).toBe(
      foreign.sId
    );
    await archiveAgentConfiguration(auth, agent.sId);
    expect(await getAgentIdFromName(auth, name)).toBeNull();
    expect(await getAgentIdFromName(other.authenticator, name)).toBe(
      foreign.sId
    );
  });

  it("preserves favorite, extra-light and redacted details behavior across the resource boundary", async () => {
    const { authenticator: editorAuth, workspace } = await createResourceTest({
      role: "user",
    });
    const agent = await AgentConfigurationFactory.createTestAgent(editorAuth, {
      name: "Private listing agent",
      scope: "hidden",
    });
    await AgentUserRelationResource.setFavorite(editorAuth, {
      agentId: agent.sId,
      favorite: true,
    });

    const listed = await getAgentConfigurationsForView({
      auth: editorAuth,
      agentsGetView: "favorites",
      variant: "light",
      omitHeavyAttributes: true,
    });
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({
      sId: agent.sId,
      canRead: true,
      canEdit: true,
      userFavorite: true,
    });
    expect(listed[0].instructions).toBeUndefined();

    const extraLight = await getAgentConfigurationsForView({
      auth: editorAuth,
      agentsGetView: "list",
      variant: "extra_light",
      agentPrefix: "Private listing",
    });
    expect(extraLight).toHaveLength(1);
    expect(extraLight[0]).toMatchObject({
      sId: agent.sId,
      userFavorite: false,
      tags: [],
    });

    const adminAuth = await authenticatorForNewMember(workspace, "admin");
    const metadata = await getAgentConfigurationsForView({
      auth: adminAuth,
      agentsGetView: "manage_unrestricted",
      variant: "light",
      omitHeavyAttributes: true,
      agentPrefix: "Private listing",
    });
    expect(metadata).toHaveLength(1);
    expect(metadata[0]).toMatchObject({
      sId: agent.sId,
      canRead: false,
      canEdit: false,
    });
    const details = await AgentResource.getAgentConfigurationForDetails(
      adminAuth,
      { agentId: agent.sId }
    );
    expect(details).toMatchObject({
      canRead: false,
      instructions: null,
      instructionsHtml: null,
      actions: [],
      skills: [],
    });

    const memberAuth = await authenticatorForNewMember(workspace, "user");
    await expect(
      getAgentConfigurationsForView({
        auth: memberAuth,
        agentsGetView: "manage_unrestricted",
        variant: "light",
      })
    ).rejects.toThrow("The unrestricted manage view is for admins only.");
    expect(
      await AgentResource.getAgentConfigurationForDetails(memberAuth, {
        agentId: agent.sId,
      })
    ).toBeNull();
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
    expect(await archiveAgentConfiguration(everySpaceAuth, agent.sId)).toBe(
      true
    );

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
    await archiveAgentConfiguration(everySpaceAuth, agent.sId);

    const memberAuth = await authenticatorForNewMember(workspace, "user");

    expect(await listAgentIdsForArchived(memberAuth)).not.toContain(agent.sId);
  });
});
