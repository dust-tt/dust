import { TagResource } from "@app/lib/resources/tags_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { TagFactory } from "@app/tests/utils/TagFactory";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function batchUpdateTags(workspace: { sId: string }, body: unknown) {
  return honoApp.request(
    `/api/w/${workspace.sId}/assistant/agent_configurations/batch_update_tags`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

describe("POST /api/w/:wId/assistant/agent_configurations/batch_update_tags", () => {
  it("adds and removes tags for multiple agents", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
    });
    const firstAgent = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "First agent",
    });
    const secondAgent = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Second agent",
    });
    const tagToAdd = await TagFactory.create(workspace, { name: "to-add" });
    const tagToRemove = await TagFactory.create(workspace, {
      name: "to-remove",
    });
    await tagToRemove.addToAgent(auth, firstAgent);
    await tagToRemove.addToAgent(auth, secondAgent);

    const response = await batchUpdateTags(workspace, {
      agentIds: [firstAgent.sId, secondAgent.sId],
      addTagIds: [tagToAdd.sId],
      removeTagIds: [tagToRemove.sId],
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });

    const tagsByAgent = await TagResource.listForAgents(auth, [
      firstAgent.id,
      secondAgent.id,
    ]);
    for (const agent of [firstAgent, secondAgent]) {
      expect(tagsByAgent[agent.id]?.map((tag) => tag.sId)).toEqual([
        tagToAdd.sId,
      ]);
    }
  });
});
