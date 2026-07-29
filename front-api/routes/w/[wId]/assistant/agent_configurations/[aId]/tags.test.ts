import { Authenticator } from "@app/lib/auth";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { TagResource } from "@app/lib/resources/tags_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { honoApp } from "@front-api/app";
import { describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/assistant/recent_authors", () => ({
  agentConfigurationWasUpdatedBy: vi.fn(),
}));

function patchTags(workspace: { sId: string }, aId: string, body: unknown) {
  return honoApp.request(
    `/api/w/${workspace.sId}/assistant/agent_configurations/${aId}/tags`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

async function setupTest() {
  const { workspace, user, auth } = await createPrivateApiMockRequest({
    role: "user",
  });

  const agent = await AgentConfigurationFactory.createTestAgent(auth);

  const adminAuth = await Authenticator.internalAdminForWorkspace(
    workspace.sId
  );
  const protectedTag = await TagResource.makeNew(adminAuth, {
    name: "Protected Tag",
    kind: "protected",
  });

  return { workspace, user, agent, adminAuth, protectedTag };
}

describe("PATCH /api/w/:wId/assistant/agent_configurations/:aId/tags", () => {
  it("rejects adding a protected tag without the publish:agent capability", async () => {
    const { workspace, agent, protectedTag } = await setupTest();

    const res = await patchTags(workspace, agent.sId, {
      addTagIds: [protectedTag.sId],
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.message).toBe(
      "Protected tags cannot be added or removed."
    );

    const tags = await TagResource.listForAgent(
      await Authenticator.internalAdminForWorkspace(workspace.sId),
      agent.id
    );
    expect(tags?.some((t) => t.sId === protectedTag.sId)).toBe(false);
  });

  it("allows adding a protected tag once the publish:agent capability is granted", async () => {
    const { workspace, agent, adminAuth, protectedTag } = await setupTest();

    await GroupPermissionResource.setForEverybody(adminAuth, {
      grantType: "publish",
      resourceType: "agent",
    });

    const res = await patchTags(workspace, agent.sId, {
      addTagIds: [protectedTag.sId],
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tags.map((t: { sId: string }) => t.sId)).toContain(
      protectedTag.sId
    );
  });
});
