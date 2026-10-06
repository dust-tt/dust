import { AgentMemoryResource } from "@app/lib/resources/agent_memory_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { setupAgentOwner } from "@app/tests/utils/AgentOwnerFactory";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import type { GetMyAgentMemoriesResponseBody } from "@app/types/api/user_profile";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function listMyAgentMemories(wId: string) {
  return honoApp.request(`/api/w/${wId}/me/agent-memories`);
}

describe("GET /api/w/:wId/me/agent-memories", () => {
  it("returns 403 when user_profile is disabled", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "user" });

    const response = await listMyAgentMemories(workspace.sId);

    expect(response.status).toBe(403);
  });

  it("groups the caller's own memories by agent and never returns another user's", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      role: "user",
    });
    await FeatureFlagFactory.basic(auth, "user_profile");
    const user = auth.getNonNullableUser().toJSON();
    const { agentOwner, agentOwnerAuth } = await setupAgentOwner(
      workspace,
      "user"
    );

    const firstAgent = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "First Agent",
    });
    const secondAgent = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Second Agent",
    });
    await AgentMemoryResource.recordEntries(auth, {
      agentConfiguration: firstAgent,
      user,
      entries: ["likes concise answers", "works on billing"],
    });
    await AgentMemoryResource.recordEntries(auth, {
      agentConfiguration: secondAgent,
      user,
      entries: ["prefers French"],
    });
    // Another member's memory on the same agent must not leak.
    await AgentMemoryResource.recordEntries(agentOwnerAuth, {
      agentConfiguration: firstAgent,
      user: agentOwner.toJSON(),
      entries: ["someone else's secret"],
    });

    const response = await listMyAgentMemories(workspace.sId);

    expect(response.status).toBe(200);
    const { agentMemories }: GetMyAgentMemoriesResponseBody =
      await response.json();
    expect(agentMemories).toHaveLength(2);
    const byAgent = new Map(agentMemories.map((m) => [m.agent.sId, m]));
    expect(byAgent.get(firstAgent.sId)?.memoriesCount).toBe(2);
    expect(byAgent.get(secondAgent.sId)?.latestContent).toBe("prefers French");
    expect(JSON.stringify(agentMemories)).not.toContain(
      "someone else's secret"
    );
  });
});
