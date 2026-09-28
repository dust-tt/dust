import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { AgentSuggestionFactory } from "@app/tests/utils/AgentSuggestionFactory";
import { BatchSuggestionFactory } from "@app/tests/utils/BatchSuggestionFactory";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SkillSuggestionFactory } from "@app/tests/utils/SkillSuggestionFactory";
import type { WorkspaceType } from "@app/types/user";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

async function setup() {
  const { workspace, auth } = await createPrivateApiMockRequest({
    role: "user",
  });
  await FeatureFlagFactory.basic(auth, "conversational_building");

  const agentConfiguration =
    await AgentConfigurationFactory.createTestAgent(auth);
  const skill = await SkillFactory.create(auth);
  // Pick up the skill's editor grant created during SkillResource.makeNew.
  await auth.refresh();

  const batch = await BatchSuggestionFactory.createEmpty(auth);
  await AgentSuggestionFactory.createName(auth, agentConfiguration, {
    batchModelId: batch.id,
  });
  await SkillSuggestionFactory.create(auth, skill, {
    source: "conversational",
    batchModelId: batch.id,
  });

  return { workspace, auth, batch };
}

function patch(workspace: WorkspaceType, bId: string, body: unknown) {
  return honoApp.request(
    `/api/w/${workspace.sId}/assistant/suggestion_batches/${bId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

describe("PATCH /api/w/:wId/assistant/suggestion_batches/:bId", () => {
  it("returns 404 for an unknown batch", async () => {
    const { workspace } = await setup();

    const response = await patch(workspace, "bsu_unknown", {
      state: "approved",
    });

    expect(response.status).toBe(404);
    expect((await response.json()).error.type).toBe(
      "batch_suggestion_not_found"
    );
  });

  it("returns 400 for a state that cannot be requested", async () => {
    const { workspace, batch } = await setup();

    const response = await patch(workspace, batch.sId, { state: "outdated" });

    expect(response.status).toBe(400);
  });

  it("returns 400 for a batch that has already been reviewed", async () => {
    const { workspace, auth, batch } = await setup();
    await batch.updateState(auth, "rejected");

    const response = await patch(workspace, batch.sId, { state: "approved" });

    expect(response.status).toBe(400);
    expect((await response.json()).error.type).toBe("invalid_request_error");
  });

  it.each([
    "approved",
    "rejected",
  ] as const)("sets the batch and its suggestions to %s", async (state) => {
    const { workspace, batch } = await setup();

    const response = await patch(workspace, batch.sId, { state });

    expect(response.status).toBe(200);
    const { batch: updated } = await response.json();
    expect(updated.state).toBe(state);
    expect(
      [...updated.agentSuggestions, ...updated.skillSuggestions].map(
        (s: { state: string }) => s.state
      )
    ).toEqual([state, state]);
  });
});
