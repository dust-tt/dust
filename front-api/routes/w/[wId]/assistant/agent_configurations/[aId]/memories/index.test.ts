import { AgentMemoryResource } from "@app/lib/resources/agent_memory_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { setupAgentOwner } from "@app/tests/utils/AgentOwnerFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function listMemories(workspace: { sId: string }, aId: string) {
  return honoApp.request(
    `/api/w/${workspace.sId}/assistant/agent_configurations/${aId}/memories`
  );
}

describe("GET /api/w/:wId/assistant/agent_configurations/:aId/memories", () => {
  it("lists the caller's memories of that agent only", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      role: "user",
    });
    const user = auth.getNonNullableUser().toJSON();
    const memoryAgent = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Memory Agent",
    });
    const otherAgent = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Other Agent",
    });
    await AgentMemoryResource.recordEntries(auth, {
      agentConfiguration: memoryAgent,
      user,
      entries: ["remembered"],
    });
    await AgentMemoryResource.recordEntries(auth, {
      agentConfiguration: otherAgent,
      user,
      entries: ["elsewhere"],
    });

    const response = await listMemories(workspace, memoryAgent.sId);

    expect(response.status).toBe(200);
    const { memories } = await response.json();
    expect(memories.map((m: { content: string }) => m.content)).toEqual([
      "remembered",
    ]);
  });

  it("returns not found for a hidden agent the caller cannot read", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "user" });
    const { agentOwnerAuth } = await setupAgentOwner(workspace, "user");
    const agent = await AgentConfigurationFactory.createTestAgent(
      agentOwnerAuth,
      { scope: "hidden" }
    );

    const response = await listMemories(workspace, agent.sId);

    expect(response.status).toBe(404);
  });
});
