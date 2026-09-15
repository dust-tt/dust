import { shadowCanAdminAgent } from "@app/lib/api/assistant/agent_permissions";
import {
  getAgentConfiguration,
  getAgentConfigurationForDetails,
} from "@app/lib/api/assistant/configuration/agent";
import { getEditors } from "@app/lib/api/assistant/editors";
import * as legacyAcls from "@app/lib/api/permissions/legacy_acls";
import { Authenticator } from "@app/lib/auth";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import assert from "assert";
import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
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
  vi.spyOn(legacyAcls, "isLegacyAclsEnabled").mockReturnValue(false);
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
  expect(
    await shadowCanAdminAgent(adminAuth, agent, async () => true, "test")
  ).toBe(true);
});
