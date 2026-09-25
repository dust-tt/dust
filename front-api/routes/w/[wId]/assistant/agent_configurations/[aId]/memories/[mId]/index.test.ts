import { AgentMemoryResource } from "@app/lib/resources/agent_memory_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function patchMemory(
  workspace: { sId: string },
  aId: string,
  mId: string,
  content: string
) {
  return honoApp.request(
    `/api/w/${workspace.sId}/assistant/agent_configurations/${aId}/memories/${mId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    }
  );
}

describe("PATCH /api/w/:wId/assistant/agent_configurations/:aId/memories/:mId", () => {
  it("only updates a memory through the agent it belongs to", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      role: "user",
    });
    const memoryAgent = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Memory Agent",
    });
    const otherAgent = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Other Agent",
    });
    const user = auth.getNonNullableUser().toJSON();
    await AgentMemoryResource.recordEntries(auth, {
      agentConfiguration: memoryAgent,
      user,
      entries: ["original"],
    });
    const [entry] = await AgentMemoryResource.findByAgentConfigurationAndUser(
      auth,
      { agentConfiguration: memoryAgent, user }
    );

    const crossAgent = await patchMemory(
      workspace,
      otherAgent.sId,
      entry.sId,
      "tampered"
    );
    expect(crossAgent.status).toBe(404);
    expect((await crossAgent.json()).error.type).toBe("agent_memory_not_found");

    const ownAgent = await patchMemory(
      workspace,
      memoryAgent.sId,
      entry.sId,
      "updated"
    );
    expect(ownAgent.status).toBe(200);
    expect((await ownAgent.json()).memory.content).toBe("updated");
  });
});
