import type { BatchApplicationStep } from "@app/lib/api/assistant/batch_application_plan";
import { planBatchApplication } from "@app/lib/api/assistant/batch_application_plan";
import type { Authenticator } from "@app/lib/auth";
import { BatchSuggestionResource } from "@app/lib/resources/batch_suggestion_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { AgentSuggestionFactory } from "@app/tests/utils/AgentSuggestionFactory";
import { BatchSuggestionFactory } from "@app/tests/utils/BatchSuggestionFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SkillSuggestionFactory } from "@app/tests/utils/SkillSuggestionFactory";
import assert from "assert";
import { beforeEach, describe, expect, it } from "vitest";

function describeStep(step: BatchApplicationStep): string {
  const targetId = step.type === "skill" ? step.skillId : step.agentId;
  return `${step.action} ${step.type} ${targetId}`;
}

describe("planBatchApplication", () => {
  let auth: Authenticator;

  beforeEach(async () => {
    ({ authenticator: auth } = await createResourceTest({ role: "user" }));
  });

  async function fetchBatch(batchId: string) {
    const batch = await BatchSuggestionResource.fetchById(auth, batchId);
    assert(batch);
    return batch;
  }

  it("orders creations first, then edits, then deletions", async () => {
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const skill = await SkillFactory.create(auth);
    await auth.refresh();
    const { id: batchModelId, sId } =
      await BatchSuggestionFactory.createEmpty(auth);

    // Created in reverse order, so the plan cannot just follow insertion order.
    await SkillSuggestionFactory.create(auth, skill, {
      kind: "delete",
      suggestion: {},
      batchModelId,
    });
    await AgentSuggestionFactory.createDelete(auth, agent, { batchModelId });
    await AgentSuggestionFactory.createInstructions(auth, agent, {
      batchModelId,
    });
    await SkillSuggestionFactory.create(auth, skill, { batchModelId });
    await AgentSuggestionFactory.createCreate(auth, agent, { batchModelId });
    await SkillSuggestionFactory.create(auth, skill, {
      kind: "create",
      suggestion: { name: skill.name },
      batchModelId,
    });

    const steps = planBatchApplication(await fetchBatch(sId));

    expect(steps.map(describeStep)).toEqual([
      `create skill ${skill.sId}`,
      `create agent ${agent.sId}`,
      `edit skill ${skill.sId}`,
      `edit agent ${agent.sId}`,
      `delete agent ${agent.sId}`,
      `delete skill ${skill.sId}`,
    ]);
  });

  it("groups the suggestions of a target and action into one step", async () => {
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const otherAgent = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Other Agent",
    });
    const { id: batchModelId, sId } =
      await BatchSuggestionFactory.createEmpty(auth);

    const instructions = await AgentSuggestionFactory.createInstructions(
      auth,
      agent,
      { batchModelId }
    );
    const otherInstructions = await AgentSuggestionFactory.createInstructions(
      auth,
      otherAgent,
      { batchModelId }
    );
    const moreInstructions = await AgentSuggestionFactory.createInstructions(
      auth,
      agent,
      { batchModelId }
    );

    const steps = planBatchApplication(await fetchBatch(sId));

    expect(
      steps.map((step) => ({
        step: describeStep(step),
        suggestionIds: step.suggestions.map((s) => s.sId),
      }))
    ).toEqual([
      {
        step: `edit agent ${agent.sId}`,
        suggestionIds: [instructions.sId, moreInstructions.sId],
      },
      {
        step: `edit agent ${otherAgent.sId}`,
        suggestionIds: [otherInstructions.sId],
      },
    ]);
  });
});
