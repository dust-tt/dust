import {
  archiveAgentConfiguration,
  getAgentConfiguration,
  getAgentConfigurationForDetails,
} from "@app/lib/api/assistant/configuration/agent";
import { getAgentConfigurationsForView } from "@app/lib/api/assistant/configuration/views";
import { getEditors } from "@app/lib/api/assistant/editors";
import { Authenticator } from "@app/lib/auth";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import assert from "assert";
import { expect, it } from "vitest";

it("uses agent grants for list, manage and archived views", async () => {
  const { authenticator: authorAuth, workspace } = await createResourceTest({
    role: "user",
  });
  const legacyAgent = await AgentConfigurationFactory.createTestAgent(
    authorAuth,
    { name: "Legacy", scope: "hidden" }
  );
  const grantAgent = await AgentConfigurationFactory.createTestAgent(
    authorAuth,
    { name: "Grants", scope: "hidden" }
  );
  const member = await UserFactory.basic();
  await MembershipFactory.associate(workspace, member, { role: "user" });
  const legacyGroup = await GroupResource.findEditorGroupForAgent(
    authorAuth,
    legacyAgent
  );
  assert(legacyGroup.isOk());
  assert(
    (
      await legacyGroup.value.dangerouslyAddMembers(authorAuth, {
        users: [member.toJSON()],
      })
    ).isOk()
  );
  const resource = AgentResource.fromAgentConfiguration(authorAuth, grantAgent);
  assert(resource.id !== null);
  assert(
    (
      await GroupPermissionResource.grantToUser(authorAuth, {
        user: member.toJSON(),
        resourceType: "agent",
        resourceId: resource.id,
        grantType: "editor",
      })
    ).isOk()
  );
  const auth = await Authenticator.fromUserIdAndWorkspaceId(
    member.sId,
    workspace.sId
  );

  for (const view of ["list", "manage"] as const) {
    const agents = await getAgentConfigurationsForView({
      auth,
      agentsGetView: view,
      variant: "light",
    });
    expect(agents.map((agent) => agent.sId)).toContain(grantAgent.sId);
    expect(agents.map((agent) => agent.sId)).not.toContain(legacyAgent.sId);
  }
  await archiveAgentConfiguration(authorAuth, legacyAgent.sId);
  await archiveAgentConfiguration(authorAuth, grantAgent.sId);
  const archived = await getAgentConfigurationsForView({
    auth,
    agentsGetView: "archived",
    variant: "light",
  });
  expect(archived.map((agent) => agent.sId)).toEqual([grantAgent.sId]);
});

it("keeps author access and admin redaction when grants are enabled", async () => {
  const {
    authenticator: authorAuth,
    workspace,
    user: author,
  } = await createResourceTest({ role: "user" });
  const agent = await AgentConfigurationFactory.createTestAgent(authorAuth, {
    scope: "hidden",
  });
  const resource = AgentResource.fromAgentConfiguration(authorAuth, agent);
  assert(resource.id !== null);
  assert(
    (
      await GroupPermissionResource.revokeFromUser(authorAuth, {
        user: author.toJSON(),
        resourceType: "agent",
        resourceId: resource.id,
        grantType: "editor",
      })
    ).isOk()
  );
  const legacyGroup = await GroupResource.findEditorGroupForAgent(
    authorAuth,
    agent
  );
  assert(legacyGroup.isOk());
  assert((await legacyGroup.value.delete(authorAuth)).isOk());
  expect(await getEditors(authorAuth, agent)).toEqual([]);
  await authorAuth.refresh();
  const authorAgent = await getAgentConfiguration(authorAuth, {
    agentId: agent.sId,
    variant: "light",
  });
  expect([authorAgent?.canRead, authorAgent?.canEdit]).toEqual([true, true]);
  const admin = await UserFactory.basic();
  await MembershipFactory.associate(workspace, admin, { role: "admin" });
  const adminAuth = await Authenticator.fromUserIdAndWorkspaceId(
    admin.sId,
    workspace.sId
  );
  const adminAgent = await getAgentConfigurationForDetails(adminAuth, {
    agentId: agent.sId,
  });
  expect(adminAgent).toMatchObject({
    canRead: false,
    canEdit: false,
    instructions: null,
  });
  // The admin role still administers the agent even though content is redacted.
  expect(
    adminAuth.can(
      "admin",
      AgentResource.fromAgentConfiguration(adminAuth, agent)
    )
  ).toBe(true);
});
