import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import type { Authenticator } from "@app/lib/auth";
import { getModelsForAuth } from "@app/lib/model_tiers/enabled_models";
import { TagResource } from "@app/lib/resources/tags_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { honoApp } from "@front-api/app";
import assert from "assert";
import { describe, expect, it } from "vitest";

const INITIAL_MODEL = {
  providerId: "openai",
  modelId: "gpt-5-mini",
} as const;

function postBatchUpdateModel(workspace: { sId: string }, body: unknown) {
  return honoApp.request(
    `/api/w/${workspace.sId}/assistant/agent_configurations/batch_update_model`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

// A selectable model that differs from the one the test agents start with.
async function findTargetModel(auth: Authenticator) {
  const { models } = await getModelsForAuth(auth);
  const target = models.find(
    (m) => m.isSelectable && m.modelId !== INITIAL_MODEL.modelId
  );
  assert(target, "Expected another selectable model to be available.");
  return target;
}

async function setupTest(role: "admin" | "user") {
  const { workspace, auth } = await createPrivateApiMockRequest({ role });

  const agent = await AgentConfigurationFactory.createTestAgent(auth, {
    model: { ...INITIAL_MODEL },
  });

  const tag = await TagResource.makeNew(auth, {
    name: "Test Tag",
    kind: "standard",
  });
  await tag.addToAgent(auth, agent);

  return { workspace, auth, agent, tag };
}

describe("POST /api/w/:wId/assistant/agent_configurations/batch_update_model", () => {
  it("saves a new version of the selected agents with the new model", async () => {
    const { workspace, auth, agent, tag } = await setupTest("admin");
    const target = await findTargetModel(auth);

    const res = await postBatchUpdateModel(workspace, {
      agentIds: [agent.sId],
      modelId: target.modelId,
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.updatedAgentIds).toEqual([agent.sId]);
    expect(body.skippedAgentIds).toEqual([]);

    const updated = await getAgentConfiguration(auth, {
      agentId: agent.sId,
      variant: "light",
    });
    expect(updated?.model.providerId).toBe(target.providerId);
    expect(updated?.model.modelId).toBe(target.modelId);
    // Reasoning effort defaults to the target model's own default.
    expect(updated?.model.reasoningEffort).toBe(target.defaultReasoningEffort);

    // A new version was created, and everything else was carried over.
    expect(updated?.version).toBe(agent.version + 1);
    expect(updated?.name).toBe(agent.name);
    expect(updated?.description).toBe(agent.description);
    expect(updated?.instructions).toBe(agent.instructions);
    expect(updated?.scope).toBe(agent.scope);
    expect(updated?.tags.map((t) => t.sId)).toEqual([tag.sId]);
  });

  it("rejects a model that is not available in the workspace", async () => {
    const { workspace, auth, agent } = await setupTest("admin");

    const res = await postBatchUpdateModel(workspace, {
      agentIds: [agent.sId],
      modelId: "not-a-model",
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.message).toContain("not available");

    const updated = await getAgentConfiguration(auth, {
      agentId: agent.sId,
      variant: "light",
    });
    expect(updated?.model.modelId).toBe(INITIAL_MODEL.modelId);
  });

  it("rejects non-admin members", async () => {
    const { workspace, auth, agent } = await setupTest("user");
    const target = await findTargetModel(auth);

    const res = await postBatchUpdateModel(workspace, {
      agentIds: [agent.sId],
      modelId: target.modelId,
    });

    expect(res.status).toBe(403);

    const updated = await getAgentConfiguration(auth, {
      agentId: agent.sId,
      variant: "light",
    });
    expect(updated?.model.modelId).toBe(INITIAL_MODEL.modelId);
  });
});
