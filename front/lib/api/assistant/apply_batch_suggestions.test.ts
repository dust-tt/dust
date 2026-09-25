import { applyBatchSuggestions } from "@app/lib/api/assistant/apply_batch_suggestions";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import type { Authenticator } from "@app/lib/auth";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { BatchSuggestionResource } from "@app/lib/resources/batch_suggestion_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { AgentSuggestionFactory } from "@app/tests/utils/AgentSuggestionFactory";
import { BatchSuggestionFactory } from "@app/tests/utils/BatchSuggestionFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import assert from "assert";
import { beforeEach, describe, expect, it } from "vitest";

describe("applyBatchSuggestions", () => {
  let auth: Authenticator;

  beforeEach(async () => {
    ({ authenticator: auth } = await createResourceTest({ role: "user" }));
  });

  async function fetchBatch(batchId: string) {
    const batch = await BatchSuggestionResource.fetchById(auth, batchId);
    assert(batch);
    return batch;
  }

  async function fetchAgentName(agentId: string) {
    const agent = await getAgentConfiguration(auth, {
      agentId,
      variant: "light",
    });
    return agent?.name;
  }

  it("applies the agent suggestions", async () => {
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const { id: batchModelId, sId } =
      await BatchSuggestionFactory.createEmpty(auth);
    await AgentSuggestionFactory.createName(auth, agent, {
      suggestion: { name: "RenamedAgent" },
      batchModelId,
    });

    const res = await applyBatchSuggestions(auth, await fetchBatch(sId));

    expect(res.isOk()).toBe(true);
    expect(await fetchAgentName(agent.sId)).toBe("RenamedAgent");
  });

  it("writes nothing when the batch holds several actions on the same agent", async () => {
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const { id: batchModelId, sId } =
      await BatchSuggestionFactory.createEmpty(auth);
    await AgentSuggestionFactory.createName(auth, agent, {
      suggestion: { name: "RenamedAgent" },
      batchModelId,
    });
    await AgentSuggestionFactory.createDelete(auth, agent, { batchModelId });

    const res = await applyBatchSuggestions(auth, await fetchBatch(sId));

    expect(res.isErr()).toBe(true);
    expect(await fetchAgentName(agent.sId)).toBe(agent.name);
  });

  it("writes nothing when a later step fails validation", async () => {
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const deletedAgent = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Deleted Agent",
    });
    const { id: batchModelId, sId } =
      await BatchSuggestionFactory.createEmpty(auth);
    await AgentSuggestionFactory.createName(auth, agent, {
      suggestion: { name: "RenamedAgent" },
      batchModelId,
    });
    // Deletions come after edits, so the rename would be written first without the upfront check.
    await AgentSuggestionFactory.createDelete(auth, deletedAgent, {
      batchModelId,
    });
    const batch = await fetchBatch(sId);

    const deletedAgentResource = await AgentResource.fetchById(
      auth,
      deletedAgent.sId
    );
    assert(deletedAgentResource);
    await deletedAgentResource.archive(auth);

    const res = await applyBatchSuggestions(auth, batch);

    expect(res.isErr()).toBe(true);
    expect(await fetchAgentName(agent.sId)).toBe(agent.name);
  });

  it("writes nothing when a later change does not fit its agent", async () => {
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const otherAgent = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Other Agent",
    });
    const { id: batchModelId, sId } =
      await BatchSuggestionFactory.createEmpty(auth);
    await AgentSuggestionFactory.createName(auth, agent, {
      suggestion: { name: "RenamedAgent" },
      batchModelId,
    });
    await AgentSuggestionFactory.createInstructions(auth, otherAgent, {
      suggestion: {
        content: "<p>Updated instructions.</p>",
        targetBlockId: "missing-block",
        type: "replace",
      },
      batchModelId: batchModelId,
    });

    const res = await applyBatchSuggestions(auth, await fetchBatch(sId));

    expect(res.isErr()).toBe(true);
    expect(await fetchAgentName(agent.sId)).toBe(agent.name);
  });
});
