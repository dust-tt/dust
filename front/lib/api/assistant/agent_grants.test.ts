import {
  canAdminAgent,
  filterEditableAgents,
  listAgentUsageConfigIds,
} from "@app/lib/api/assistant/agent_permissions";
import {
  archiveAgentConfiguration,
  getAgentConfiguration,
  getAgentConfigurationForDetails,
} from "@app/lib/api/assistant/configuration/agent";
import { getAgentConfigurationContext } from "@app/lib/api/assistant/configuration/context";
import { getAgentConfigurationsForView } from "@app/lib/api/assistant/configuration/views";
import { getAgentsEditors, getEditors } from "@app/lib/api/assistant/editors";
import * as legacyAcls from "@app/lib/api/permissions/legacy_acls";
import { Authenticator } from "@app/lib/auth";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { AgentSuggestionResource } from "@app/lib/resources/agent_suggestion_resource";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { AgentSuggestionFactory } from "@app/tests/utils/AgentSuggestionFactory";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import assert from "assert";
import { expect, it, vi } from "vitest";

it.each([
  "legacy",
  "grants",
  "rollback",
])("selects %s for editor lists, permissions, and views", async (mode) => {
  vi.spyOn(legacyAcls, "isLegacyAclsEnabled").mockReturnValue(
    mode === "rollback"
  );
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
  const resource = await AgentResource.fetchByAgentConfiguration(
    authorAuth,
    grantAgent
  );
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
  const suggestion = await AgentSuggestionFactory.createInstructions(
    authorAuth,
    grantAgent
  );
  if (mode !== "legacy") {
    await FeatureFlagFactory.basic(authorAuth, "agent_permission_grants");
  }
  const auth = await Authenticator.fromUserIdAndWorkspaceId(
    member.sId,
    workspace.sId
  );
  const selected = mode === "grants" ? grantAgent : legacyAgent;
  const excluded = mode === "grants" ? legacyAgent : grantAgent;

  expect(
    (await getEditors(auth, selected)).some((editor) => editor.id === member.id)
  ).toBe(true);
  expect(
    (await getEditors(auth, excluded)).some((editor) => editor.id === member.id)
  ).toBe(false);
  const batchEditors = await getAgentsEditors(auth, [selected, excluded]);
  expect(
    batchEditors[selected.sId].some((editor) => editor.id === member.id)
  ).toBe(true);
  expect(
    batchEditors[excluded.sId].some((editor) => editor.id === member.id)
  ).toBe(false);
  const context = await getAgentConfigurationContext(auth, selected.sId);
  assert(context.isOk());
  expect(
    context.value.editorUsers.some((editor) => editor.id === member.id)
  ).toBe(true);

  const selectedConfig = await getAgentConfiguration(auth, {
    agentId: selected.sId,
    variant: "light",
  });
  const excludedConfig = await getAgentConfiguration(auth, {
    agentId: excluded.sId,
    variant: "light",
  });
  assert(selectedConfig && excludedConfig);
  expect([selectedConfig.canRead, selectedConfig.canEdit]).toEqual([
    true,
    true,
  ]);
  expect([excludedConfig.canRead, excludedConfig.canEdit]).toEqual([
    false,
    false,
  ]);
  const legacyPermission = async () => legacyGroup.value.isMember(member);
  expect(await canAdminAgent(auth, legacyAgent, legacyPermission, "test")).toBe(
    mode !== "grants"
  );
  expect(
    (
      await filterEditableAgents(
        auth,
        [grantAgent, legacyAgent],
        [legacyAgent],
        "test"
      )
    ).map((agent) => agent.sId)
  ).toEqual([selected.sId]);
  expect(await listAgentUsageConfigIds(auth, "test")).toEqual([selected.id]);
  expect(await AgentSuggestionResource.fetchById(auth, suggestion.sId)).toEqual(
    mode === "grants" ? expect.objectContaining({ sId: suggestion.sId }) : null
  );

  for (const view of ["list", "manage"] as const) {
    const agents = await getAgentConfigurationsForView({
      auth,
      agentsGetView: view,
      variant: "light",
    });
    expect(agents.map((agent) => agent.sId)).toContain(selected.sId);
    expect(agents.map((agent) => agent.sId)).not.toContain(excluded.sId);
  }
  await archiveAgentConfiguration(authorAuth, legacyAgent.sId);
  await archiveAgentConfiguration(authorAuth, grantAgent.sId);
  const archived = await getAgentConfigurationsForView({
    auth,
    agentsGetView: "archived",
    variant: "light",
  });
  expect(archived.map((agent) => agent.sId)).toEqual([selected.sId]);
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
  const resource = await AgentResource.fetchByAgentConfiguration(
    authorAuth,
    agent
  );
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
  await FeatureFlagFactory.basic(authorAuth, "agent_permission_grants");
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
  expect(await canAdminAgent(adminAuth, agent, async () => true, "test")).toBe(
    true
  );
});
