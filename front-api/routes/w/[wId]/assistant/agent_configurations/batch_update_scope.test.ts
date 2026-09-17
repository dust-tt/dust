import {
  archiveAgentConfiguration,
  getAgentConfiguration,
} from "@app/lib/api/assistant/configuration/agent";
import { Authenticator } from "@app/lib/auth";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import type { LightWorkspaceType } from "@app/types/user";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function batchUpdateScope(workspace: { sId: string }, body: unknown) {
  return honoApp.request(
    `/api/w/${workspace.sId}/assistant/agent_configurations/batch_update_scope`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

// An agent authored and edited by another member, built on a space the acting admin is not a
// member of: exactly what "Show hidden agents" surfaces on the manage agents page.
async function createOtherMemberAgent(
  workspace: LightWorkspaceType,
  { name }: { name: string }
) {
  const agentOwner = await UserFactory.basic();
  await MembershipFactory.associate(workspace, agentOwner, { role: "user" });
  const agentOwnerAuth = await Authenticator.fromUserIdAndWorkspaceId(
    agentOwner.sId,
    workspace.sId
  );
  const restrictedSpace = await SpaceFactory.regular(workspace);

  return AgentConfigurationFactory.createTestAgent(agentOwnerAuth, {
    name,
    scope: "visible",
    requestedSpaceIds: [restrictedSpace.id],
  });
}

describe("POST /api/w/:wId/assistant/agent_configurations/batch_update_scope", () => {
  it("unpublishes an agent of another member built on a restricted space", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
    });
    // Production seeds the "publish agents" capability to everybody (governance_seeding); the test
    // harness does not, so grant it — only callers who hold `publish` on an agent may rescope it.
    await GroupPermissionResource.setForEverybody(auth, {
      grantType: "publish",
      resourceType: "agent",
    });
    const agent = await createOtherMemberAgent(workspace, {
      name: "Restricted space agent",
    });

    const response = await batchUpdateScope(workspace, {
      agentIds: [agent.sId],
      scope: "hidden",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });

    const updatedAgent = await getAgentConfiguration(auth, {
      agentId: agent.sId,
      variant: "light",
      dangerouslySkipPermissionFiltering: true,
    });
    expect(updatedAgent?.scope).toBe("hidden");
  });

  it("does not (un)publish for a caller without the publish capability", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      method: "POST",
      role: "user",
    });
    // The caller edits the agent (they authored it) but the harness grants no publish capability, so
    // the resource skips it: (un)publishing requires the publish capability on top of edit rights.
    const agent = await AgentConfigurationFactory.createTestAgent(auth, {
      scope: "visible",
    });

    const response = await batchUpdateScope(workspace, {
      agentIds: [agent.sId],
      scope: "hidden",
    });

    expect(response.status).toBe(200);

    const unchanged = await getAgentConfiguration(auth, {
      agentId: agent.sId,
      variant: "light",
    });
    expect(unchanged?.scope).toBe("visible");
  });

  it("lets a non-admin editor with the publish capability unpublish their agent", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      method: "POST",
      role: "user",
    });
    // Seed the "publish agents" capability to everybody (as production does), via an admin.
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    await GroupPermissionResource.setForEverybody(adminAuth, {
      grantType: "publish",
      resourceType: "agent",
    });
    const agent = await AgentConfigurationFactory.createTestAgent(auth, {
      scope: "visible",
    });

    const response = await batchUpdateScope(workspace, {
      agentIds: [agent.sId],
      scope: "hidden",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });

    const updated = await getAgentConfiguration(auth, {
      agentId: agent.sId,
      variant: "light",
    });
    expect(updated?.scope).toBe("hidden");
  });

  it("rejects a batch containing an archived agent", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
    });
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    await archiveAgentConfiguration(auth, agent.sId);

    const response = await batchUpdateScope(workspace, {
      agentIds: [agent.sId],
      scope: "visible",
    });

    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toContain(agent.name);
  });
});
