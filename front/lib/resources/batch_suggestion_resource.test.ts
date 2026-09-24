import { Authenticator } from "@app/lib/auth";
import { BatchSuggestionResource } from "@app/lib/resources/batch_suggestion_resource";
import type { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { AgentSuggestionFactory } from "@app/tests/utils/AgentSuggestionFactory";
import { BatchSuggestionFactory } from "@app/tests/utils/BatchSuggestionFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SkillSuggestionFactory } from "@app/tests/utils/SkillSuggestionFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { WorkspaceType } from "@app/types/user";
import { beforeEach, describe, expect, it } from "vitest";

describe("BatchSuggestionResource", () => {
  let workspace: WorkspaceType;
  let authenticator: Authenticator;
  let agentConfiguration: LightAgentConfigurationType;
  let skill: SkillResource;

  beforeEach(async () => {
    const testSetup = await createResourceTest({ role: "user" });
    workspace = testSetup.workspace;
    authenticator = testSetup.authenticator;

    agentConfiguration =
      await AgentConfigurationFactory.createTestAgent(authenticator);
    skill = await SkillFactory.create(authenticator);
    // Pick up the skill's editor grant created during SkillResource.makeNew.
    await authenticator.refresh();
  });

  async function createBatchWithMembers(auth: Authenticator) {
    const batch = await BatchSuggestionFactory.createEmpty(auth, {
      title: "Extract triage skill",
      analysis: "The agent needs the skill and the instructions together.",
    });
    const agentSuggestion = await AgentSuggestionFactory.createInstructions(
      auth,
      agentConfiguration,
      { source: "conversational", batchId: batch.id }
    );
    const skillSuggestion = await SkillSuggestionFactory.create(auth, skill, {
      source: "conversational",
      batchId: batch.id,
    });

    return { batch, agentSuggestion, skillSuggestion };
  }

  it("creates a batch and fetches it back with its members", async () => {
    const { batch, agentSuggestion, skillSuggestion } =
      await createBatchWithMembers(authenticator);

    expect(batch.sId).toMatch(/^bsu_/);
    expect(batch.workspaceId).toBe(workspace.id);

    const fetched = await BatchSuggestionResource.fetchById(
      authenticator,
      batch.sId
    );
    expect(fetched).not.toBeNull();
    expect(fetched!.agentSuggestions.map((s) => s.sId)).toEqual([
      agentSuggestion.sId,
    ]);
    expect(fetched!.skillSuggestions.map((s) => s.sId)).toEqual([
      skillSuggestion.sId,
    ]);

    expect(fetched!.toJSON()).toEqual({
      id: batch.sId,
      createdAt: batch.createdAt.getTime(),
      updatedAt: batch.updatedAt.getTime(),
      title: "Extract triage skill",
      analysis: "The agent needs the skill and the instructions together.",
      state: "pending",
      sourceConversationId: null,
      agentSuggestionIds: [agentSuggestion.sId],
      skillSuggestionIds: [skillSuggestion.sId],
    });
  });

  it("exposes the batch sId on its members", async () => {
    const { batch, agentSuggestion, skillSuggestion } =
      await createBatchWithMembers(authenticator);

    expect(agentSuggestion.toJSON().batchId).toBe(batch.sId);
    expect(skillSuggestion.toJSON().batchId).toBe(batch.sId);

    const unbatched = await AgentSuggestionFactory.createInstructions(
      authenticator,
      agentConfiguration
    );
    expect(unbatched.toJSON().batchId).toBeNull();
  });

  it("fetches several batches at once, each with its own members", async () => {
    const first = await createBatchWithMembers(authenticator);
    const second = await createBatchWithMembers(authenticator);

    const fetched = await BatchSuggestionResource.fetchByIds(authenticator, [
      first.batch.sId,
      second.batch.sId,
    ]);

    const bySId = new Map(fetched.map((b) => [b.sId, b]));
    expect(bySId.size).toBe(2);
    expect(
      bySId.get(first.batch.sId)!.agentSuggestions.map((s) => s.sId)
    ).toEqual([first.agentSuggestion.sId]);
    expect(
      bySId.get(second.batch.sId)!.skillSuggestions.map((s) => s.sId)
    ).toEqual([second.skillSuggestion.sId]);
  });

  it("does not return a batch without members", async () => {
    const batch = await BatchSuggestionFactory.createEmpty(authenticator);

    expect(
      await BatchSuggestionResource.fetchById(authenticator, batch.sId)
    ).toBeNull();
  });

  it("throws when one member of the batch is not accessible", async () => {
    const { batch } = await createBatchWithMembers(authenticator);

    // Another member edits a skill of their own, and adds a suggestion on it to the same batch.
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
    await SkillSuggestionFactory.create(otherAuth, otherSkill, {
      source: "conversational",
      batchId: batch.id,
    });

    // Neither user can access every member.
    await expect(
      BatchSuggestionResource.fetchById(authenticator, batch.sId)
    ).rejects.toThrow();
    await expect(
      BatchSuggestionResource.fetchById(otherAuth, batch.sId)
    ).rejects.toThrow();
  });

  it("updates the state of the batch and of all its members", async () => {
    const { batch, agentSuggestion, skillSuggestion } =
      await createBatchWithMembers(authenticator);
    const fetched = await BatchSuggestionResource.fetchById(
      authenticator,
      batch.sId
    );

    await fetched!.updateState(authenticator, "approved");
    expect(fetched!.state).toBe("approved");

    const refetched = await BatchSuggestionResource.fetchById(
      authenticator,
      batch.sId
    );
    expect(refetched!.state).toBe("approved");
    expect(refetched!.agentSuggestions.map((s) => [s.sId, s.state])).toEqual([
      [agentSuggestion.sId, "approved"],
    ]);
    expect(refetched!.skillSuggestions.map((s) => [s.sId, s.state])).toEqual([
      [skillSuggestion.sId, "approved"],
    ]);
  });

  it("deletes a batch once its members are gone", async () => {
    const batch = await BatchSuggestionFactory.createEmpty(authenticator);
    const agentSuggestion = await AgentSuggestionFactory.createInstructions(
      authenticator,
      agentConfiguration,
      { source: "conversational", batchId: batch.id }
    );

    const deleteSuggestion = await agentSuggestion.delete(authenticator);
    expect(deleteSuggestion.isOk()).toBe(true);

    const res = await batch.delete(authenticator);
    expect(res.isOk()).toBe(true);
    expect(
      await BatchSuggestionResource.fetchById(authenticator, batch.sId)
    ).toBeNull();
  });
});
