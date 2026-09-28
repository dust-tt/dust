import { Authenticator } from "@app/lib/auth";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { AgentSuggestionFactory } from "@app/tests/utils/AgentSuggestionFactory";
import { BatchSuggestionFactory } from "@app/tests/utils/BatchSuggestionFactory";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SkillSuggestionFactory } from "@app/tests/utils/SkillSuggestionFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import type { WorkspaceType } from "@app/types/user";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

async function setup({ withFlag = true }: { withFlag?: boolean } = {}) {
  const { workspace, auth } = await createPrivateApiMockRequest({
    role: "user",
  });
  if (withFlag) {
    await FeatureFlagFactory.basic(auth, "conversational_building");
  }

  const agentConfiguration =
    await AgentConfigurationFactory.createTestAgent(auth);
  const skill = await SkillFactory.create(auth);
  // Pick up the skill's editor grant created during SkillResource.makeNew.
  await auth.refresh();

  const batch = await BatchSuggestionFactory.createEmpty(auth);
  const agentSuggestion = await AgentSuggestionFactory.createInstructions(
    auth,
    agentConfiguration,
    { source: "conversational", batchModelId: batch.id }
  );
  const skillSuggestion = await SkillSuggestionFactory.create(auth, skill, {
    source: "conversational",
    batchModelId: batch.id,
  });

  return { workspace, auth, batch, agentSuggestion, skillSuggestion };
}

function get(workspace: WorkspaceType, ids: string[]) {
  const search = new URLSearchParams();
  for (const id of ids) {
    search.append("ids", id);
  }
  const qs = search.toString();
  return honoApp.request(
    `/api/w/${workspace.sId}/assistant/suggestion_batches${qs ? `?${qs}` : ""}`
  );
}

describe("GET /api/w/:wId/assistant/suggestion_batches", () => {
  it("returns the batch with its agent and skill suggestions", async () => {
    const { workspace, batch, agentSuggestion, skillSuggestion } =
      await setup();

    const response = await get(workspace, [batch.sId]);

    expect(response.status).toBe(200);
    const { batches } = await response.json();
    expect(batches).toHaveLength(1);
    expect(batches[0].id).toBe(batch.sId);
    expect(
      batches[0].agentSuggestions.map((s: { sId: string }) => s.sId)
    ).toEqual([agentSuggestion.sId]);
    expect(
      batches[0].skillSuggestions.map((s: { sId: string }) => s.sId)
    ).toEqual([skillSuggestion.sId]);
  });

  it("fails and returns no batch when a requested batch has an inaccessible suggestion", async () => {
    const { workspace, batch } = await setup();

    // Another member adds a suggestion on their own skill to a second batch.
    const otherUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, otherUser, { role: "user" });
    const otherAuth = await Authenticator.fromUserIdAndWorkspaceId(
      otherUser.sId,
      workspace.sId
    );
    const otherSkill = await SkillFactory.create(otherAuth, {
      name: "Other Skill",
    });
    await otherAuth.refresh();
    const inaccessibleBatch =
      await BatchSuggestionFactory.createEmpty(otherAuth);
    await SkillSuggestionFactory.create(otherAuth, otherSkill, {
      source: "conversational",
      batchModelId: inaccessibleBatch.id,
    });

    const response = await get(workspace, [batch.sId, inaccessibleBatch.sId]);

    expect(response.status).toBe(500);
    expect((await response.json()).batches).toBeUndefined();
  });
});
