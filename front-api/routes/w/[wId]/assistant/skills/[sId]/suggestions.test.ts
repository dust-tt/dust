import { Authenticator } from "@app/lib/auth";
import { convertMarkdownToBlockHtml } from "@app/lib/editor/skill_instructions_html";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SkillSuggestionResource } from "@app/lib/resources/skill_suggestion_resource";
import { serializeSkillTag } from "@app/lib/skills/format";
import { BatchSuggestionFactory } from "@app/tests/utils/BatchSuggestionFactory";
import { DataSourceViewFactory } from "@app/tests/utils/DataSourceViewFactory";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SkillSuggestionFactory } from "@app/tests/utils/SkillSuggestionFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { setupSkillInstructionsMarkdownPipeline } from "@app/tests/utils/skill_instructions_html";
import { UserFactory } from "@app/tests/utils/UserFactory";
import type { MembershipRoleType } from "@app/types/memberships";
import { INSTRUCTIONS_ROOT_TARGET_BLOCK_ID } from "@app/types/suggestions/agent_suggestion";
import type { SkillSuggestionState } from "@app/types/suggestions/skill_suggestion";
import type { WorkspaceType } from "@app/types/user";
import assert from "assert";
import { beforeAll, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  setupSkillInstructionsMarkdownPipeline();
});

vi.mock("@app/lib/reinforcement/workspace_check", () => ({
  hasReinforcementEnabled: vi.fn().mockResolvedValue(true),
}));

const postSkillSuggestionStatusUpdateMock = vi
  .fn()
  .mockResolvedValue(undefined);

vi.mock("@app/lib/reinforcement/aggregate_suggestions", () => ({
  postSkillSuggestionStatusUpdate: (...args: unknown[]) =>
    postSkillSuggestionStatusUpdateMock(...args),
}));

import { honoApp } from "@front-api/app";

async function setup(
  options: {
    role?: MembershipRoleType;
    skill?: Parameters<typeof SkillFactory.create>[1];
  } = {}
) {
  const role = options.role ?? "user";
  const { workspace, auth, globalSpace } = await createPrivateApiMockRequest({
    role,
  });

  const skill = await SkillFactory.create(auth, options.skill);
  // Refresh authenticator to pick up the skill's editor group membership.
  await auth.refresh();

  return { workspace, auth, globalSpace, skill };
}

async function setupAdminWithOtherBuilderSkill() {
  const { workspace } = await createPrivateApiMockRequest({ role: "admin" });

  const skillOwner = await UserFactory.basic();
  await MembershipFactory.associate(workspace, skillOwner, {
    role: "user",
  });
  const ownerAuth = await Authenticator.fromUserIdAndWorkspaceId(
    skillOwner.sId,
    workspace.sId
  );
  const skill = await SkillFactory.create(ownerAuth, {
    name: "Other Builder Skill",
  });
  await ownerAuth.refresh();
  const suggestion = await SkillSuggestionFactory.create(ownerAuth, skill, {
    state: "pending",
  });

  return { workspace, skill, suggestion };
}

function patch(workspace: { sId: string }, sId: string, body: unknown) {
  return honoApp.request(
    `/api/w/${workspace.sId}/assistant/skills/${sId}/suggestions`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

function get(
  workspace: { sId: string },
  sId: string,
  query: Record<string, string | string[]> = {}
) {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (Array.isArray(v)) {
      for (const x of v) {
        search.append(k, x);
      }
    } else {
      search.append(k, v);
    }
  }
  const qs = search.toString();
  return honoApp.request(
    `/api/w/${workspace.sId}/assistant/skills/${sId}/suggestions${qs ? `?${qs}` : ""}`
  );
}

describe("PATCH /api/w/:wId/assistant/skills/:sId/suggestions", () => {
  it("returns 404 for non-existent skill", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      role: "user",
    });

    const response = await patch(workspace, "non-existent-skill", {
      suggestionIds: ["test-id"],
      state: "approved",
    });

    expect(response.status).toBe(404);
    expect((await response.json()).error.type).toBe("skill_not_found");
  });

  it("returns 400 for a suggestion that belongs to a batch", async () => {
    const { workspace, auth, skill } = await setup();
    const batch = await BatchSuggestionFactory.createEmpty(auth);
    const suggestion = await SkillSuggestionFactory.create(auth, skill, {
      source: "conversational",
      batchModelId: batch.id,
    });

    const response = await patch(workspace, skill.sId, {
      suggestionIds: [suggestion.sId],
      state: "rejected",
    });

    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toContain(
      "belong to a batch"
    );
    const reloaded = await SkillSuggestionResource.fetchById(
      auth,
      suggestion.sId
    );
    expect(reloaded?.state).toBe("pending");
  });

  it("returns 400 for missing suggestionIds", async () => {
    const { workspace, skill } = await setup();
    const response = await patch(workspace, skill.sId, { state: "approved" });

    expect(response.status).toBe(400);
    expect((await response.json()).error.type).toBe("invalid_request_error");
  });

  it("returns 400 for empty suggestionIds array", async () => {
    const { workspace, skill } = await setup();
    const response = await patch(workspace, skill.sId, {
      suggestionIds: [],
      state: "approved",
    });

    expect(response.status).toBe(400);
    expect((await response.json()).error.type).toBe("invalid_request_error");
  });

  it("returns 400 for missing state", async () => {
    const { workspace, skill } = await setup();
    const response = await patch(workspace, skill.sId, {
      suggestionIds: ["test-id"],
    });

    expect(response.status).toBe(400);
    expect((await response.json()).error.type).toBe("invalid_request_error");
  });

  it("returns 400 for invalid state value", async () => {
    const { workspace, skill } = await setup();
    const response = await patch(workspace, skill.sId, {
      suggestionIds: ["test-id"],
      state: "invalid_state",
    });

    expect(response.status).toBe(400);
    expect((await response.json()).error.type).toBe("invalid_request_error");
  });

  it("returns 400 when trying to set state to pending", async () => {
    const { workspace, skill } = await setup();
    const response = await patch(workspace, skill.sId, {
      suggestionIds: ["test-id"],
      state: "pending",
    });

    expect(response.status).toBe(400);
    expect((await response.json()).error.type).toBe("invalid_request_error");
  });

  it("returns 404 for non-existent suggestion", async () => {
    const { workspace, skill } = await setup();
    const response = await patch(workspace, skill.sId, {
      suggestionIds: ["non-existent-id"],
      state: "approved",
    });

    expect(response.status).toBe(404);
    expect((await response.json()).error.type).toBe(
      "agent_suggestion_not_found"
    );
  });

  it("returns 400 when suggestion belongs to a different skill", async () => {
    const { workspace, auth, skill } = await setup();
    const otherSkill = await SkillFactory.create(auth, { name: "Other Skill" });
    await auth.refresh();

    const suggestion = await SkillSuggestionFactory.create(auth, otherSkill);

    const response = await patch(workspace, skill.sId, {
      suggestionIds: [suggestion.sId],
      state: "approved",
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.type).toBe("invalid_request_error");
    expect(body.error.message).toContain(
      "do not belong to the specified skill configuration"
    );
  });

  it.each<Exclude<SkillSuggestionState, "pending">>([
    "approved",
    "rejected",
    "outdated",
  ])("updates suggestion state to %s", async (newState) => {
    const { workspace, auth, skill } = await setup();
    const suggestion = await SkillSuggestionFactory.create(auth, skill, {
      state: "pending",
    });

    const response = await patch(workspace, skill.sId, {
      suggestionIds: [suggestion.sId],
      state: newState,
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.suggestions).toHaveLength(1);
    expect(body.suggestions[0].state).toBe(newState);
    expect(body.suggestions[0].sId).toBe(suggestion.sId);

    const fetched = await SkillSuggestionResource.fetchById(
      auth,
      suggestion.sId
    );
    expect(fetched?.state).toBe(newState);
  });

  it("returns the full suggestion object with all fields", async () => {
    const { workspace, auth, skill } = await setup();
    const suggestion = await SkillSuggestionFactory.create(auth, skill, {
      suggestion: {
        instructionEdits: [
          {
            targetBlockId: "abc12345",
            content: "<p>Updated instructions</p>",
            type: "replace",
          },
        ],
      },
      analysis: "Test analysis",
      state: "pending",
      source: "reinforcement",
    });

    const response = await patch(workspace, skill.sId, {
      suggestionIds: [suggestion.sId],
      state: "approved",
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.suggestions).toHaveLength(1);
    expect(body.suggestions[0]).toMatchObject({
      sId: suggestion.sId,
      state: "approved",
      kind: "edit",
      analysis: "Test analysis",
      source: "reinforcement",
      suggestion: {
        instructionEdits: [
          {
            targetBlockId: "abc12345",
            content: "<p>Updated instructions</p>",
            type: "replace",
          },
        ],
      },
    });
    expect(body.suggestions[0].createdAt).toBeDefined();
    expect(body.suggestions[0].updatedAt).toBeDefined();
  });

  it("admin can update suggestions in their workspace", async () => {
    const { workspace, auth, skill } = await setup({ role: "admin" });
    const suggestion = await SkillSuggestionFactory.create(auth, skill, {
      state: "pending",
    });

    const response = await patch(workspace, skill.sId, {
      suggestionIds: [suggestion.sId],
      state: "approved",
    });

    expect(response.status).toBe(200);
    expect((await response.json()).suggestions[0].state).toBe("approved");
  });

  it("admin can update suggestions for a skill they do not edit", async () => {
    const { workspace, skill, suggestion } =
      await setupAdminWithOtherBuilderSkill();

    const response = await patch(workspace, skill.sId, {
      suggestionIds: [suggestion.sId],
      state: "approved",
    });

    expect(response.status).toBe(200);
    expect((await response.json()).suggestions[0].state).toBe("approved");
  });

  it("returns 403 for non-editor of the skill", async () => {
    const { workspace } = await setup();

    const skillOwner = await UserFactory.basic();
    await MembershipFactory.associate(workspace, skillOwner, {
      role: "user",
    });
    const ownerAuth = await Authenticator.fromUserIdAndWorkspaceId(
      skillOwner.sId,
      workspace.sId
    );
    const otherSkill = await SkillFactory.create(ownerAuth, {
      name: "Other Skill",
    });
    await ownerAuth.refresh();
    const suggestion = await SkillSuggestionFactory.create(
      ownerAuth,
      otherSkill,
      { state: "pending" }
    );

    const response = await patch(workspace, otherSkill.sId, {
      suggestionIds: [suggestion.sId],
      state: "approved",
    });

    expect(response.status).toBe(403);
    expect((await response.json()).error.type).toBe(
      "agent_group_permission_error"
    );
  });

  it("updates multiple suggestions in a single request", async () => {
    const { workspace, auth, skill } = await setup();
    const s1 = await SkillSuggestionFactory.create(auth, skill, {
      state: "pending",
    });
    const s2 = await SkillSuggestionFactory.create(auth, skill, {
      state: "pending",
    });

    const response = await patch(workspace, skill.sId, {
      suggestionIds: [s1.sId, s2.sId],
      state: "approved",
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.suggestions).toHaveLength(2);
    expect(
      body.suggestions.every((s: { state: string }) => s.state === "approved")
    ).toBe(true);

    const fetched1 = await SkillSuggestionResource.fetchById(auth, s1.sId);
    const fetched2 = await SkillSuggestionResource.fetchById(auth, s2.sId);
    expect(fetched1?.state).toBe("approved");
    expect(fetched2?.state).toBe("approved");
  });

  it("triggers postSkillSuggestionStatusUpdate when approving", async () => {
    postSkillSuggestionStatusUpdateMock.mockClear();
    const { workspace, auth, skill } = await setup();
    const suggestion = await SkillSuggestionFactory.create(auth, skill, {
      state: "pending",
    });

    const response = await patch(workspace, skill.sId, {
      suggestionIds: [suggestion.sId],
      state: "approved",
    });

    expect(response.status).toBe(200);
    expect(postSkillSuggestionStatusUpdateMock).toHaveBeenCalledTimes(1);
    const [, suggestions, state] =
      postSkillSuggestionStatusUpdateMock.mock.calls[0];
    expect(state).toBe("approved");
    expect(suggestions.map((s: { sId: string }) => s.sId)).toEqual([
      suggestion.sId,
    ]);
  });

  it("triggers postSkillSuggestionStatusUpdate when rejecting", async () => {
    postSkillSuggestionStatusUpdateMock.mockClear();
    const { workspace, auth, skill } = await setup();
    const suggestion = await SkillSuggestionFactory.create(auth, skill, {
      state: "pending",
    });

    const response = await patch(workspace, skill.sId, {
      suggestionIds: [suggestion.sId],
      state: "rejected",
    });

    expect(response.status).toBe(200);
    expect(postSkillSuggestionStatusUpdateMock).toHaveBeenCalledTimes(1);
    expect(postSkillSuggestionStatusUpdateMock.mock.calls[0][2]).toBe(
      "rejected"
    );
  });

  it("does not trigger postSkillSuggestionStatusUpdate when marking outdated", async () => {
    postSkillSuggestionStatusUpdateMock.mockClear();
    const { workspace, auth, skill } = await setup();
    const suggestion = await SkillSuggestionFactory.create(auth, skill, {
      state: "pending",
    });

    const response = await patch(workspace, skill.sId, {
      suggestionIds: [suggestion.sId],
      state: "outdated",
    });

    expect(response.status).toBe(200);
    expect(postSkillSuggestionStatusUpdateMock).not.toHaveBeenCalled();
  });

  it("returns 400 when reinforcement is disabled", async () => {
    const { hasReinforcementEnabled } = await import(
      "@app/lib/reinforcement/workspace_check"
    );
    vi.mocked(hasReinforcementEnabled).mockResolvedValueOnce(false);

    const { workspace, auth, skill } = await setup();
    const suggestion = await SkillSuggestionFactory.create(auth, skill, {
      state: "pending",
    });

    const response = await patch(workspace, skill.sId, {
      suggestionIds: [suggestion.sId],
      state: "approved",
    });

    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toBe(
      `The following skill suggestions are not available: ${suggestion.sId}.`
    );
  });

  it("updates a conversational suggestion when the feature flag is on", async () => {
    const { hasReinforcementEnabled } = await import(
      "@app/lib/reinforcement/workspace_check"
    );
    vi.mocked(hasReinforcementEnabled).mockResolvedValueOnce(false);

    const { workspace, auth, skill } = await setup();
    await FeatureFlagFactory.basic(auth, "conversational_building");
    const suggestion = await SkillSuggestionFactory.create(auth, skill, {
      source: "conversational",
      state: "pending",
    });

    const response = await patch(workspace, skill.sId, {
      suggestionIds: [suggestion.sId],
      state: "approved",
    });

    expect(response.status).toBe(200);
    expect((await response.json()).suggestions[0].state).toBe("approved");
  });

  it("returns 400 for a conversational suggestion without the feature flag", async () => {
    const { workspace, auth, skill } = await setup();
    const suggestion = await SkillSuggestionFactory.create(auth, skill, {
      source: "conversational",
      state: "pending",
    });

    const response = await patch(workspace, skill.sId, {
      suggestionIds: [suggestion.sId],
      state: "approved",
    });

    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toBe(
      `The following skill suggestions are not available: ${suggestion.sId}.`
    );
  });
});

// Block ids of the real blocks, skipping the wrapping instructions root.
function blockIdsOf(instructionsHtml: string): string[] {
  return [...instructionsHtml.matchAll(/data-block-id="([^"]+)"/g)]
    .map((m) => m[1])
    .filter((id) => id !== INSTRUCTIONS_ROOT_TARGET_BLOCK_ID);
}

// Gives the skill real block-structured instructions and hands back its block ids, so edits can
// target something that actually exists.
async function setupSkillWithBlockInstructions(
  markdown: string = "Original instructions"
) {
  const instructionsHtml = convertMarkdownToBlockHtml(markdown);
  const { workspace, auth, globalSpace, skill } = await setup({
    skill: { instructions: markdown, instructionsHtml },
  });

  const blockIds = blockIdsOf(instructionsHtml);
  assert(blockIds.length > 0, "the generated instructions have no block");

  return { workspace, auth, globalSpace, skill, blockIds };
}

function instructionEditSuggestion(targetBlockId: string, content: string) {
  return {
    instructionEdits: [{ targetBlockId, content, type: "replace" as const }],
  };
}

describe("PATCH with applyToSkill", () => {
  it("applies an agent-facing description edit", async () => {
    const { workspace, auth, skill } = await setup();
    const suggestion = await SkillSuggestionFactory.create(auth, skill, {
      state: "pending",
      suggestion: {
        agentFacingDescriptionEdit: { content: "A better description" },
      },
    });

    const response = await patch(workspace, skill.sId, {
      suggestionIds: [suggestion.sId],
      state: "approved",
      applyToSkill: true,
    });

    expect(response.status).toBe(200);
    expect((await response.json()).suggestions[0].state).toBe("approved");

    const updated = await SkillResource.fetchById(auth, skill.sId);
    expect(updated?.agentFacingDescription).toBe("A better description");
  });

  it("applies a delete suggestion by archiving the skill", async () => {
    const { workspace, auth, skill } = await setup();
    const suggestion = await SkillSuggestionFactory.create(auth, skill, {
      kind: "delete",
      state: "pending",
      suggestion: {},
    });

    const response = await patch(workspace, skill.sId, {
      suggestionIds: [suggestion.sId],
      state: "approved",
      applyToSkill: true,
    });

    expect(response.status).toBe(200);
    expect((await response.json()).suggestions[0].state).toBe("approved");

    const updated = await SkillResource.fetchById(auth, skill.sId, {
      onlyActive: false,
    });
    expect(updated?.status).toBe("archived");
  });

  it("returns 400 when applying a delete suggestion for an already archived skill", async () => {
    const { workspace, auth, skill } = await setup();
    const suggestion = await SkillSuggestionFactory.create(auth, skill, {
      kind: "delete",
      state: "pending",
      suggestion: {},
    });
    await skill.archive(auth);

    const response = await patch(workspace, skill.sId, {
      suggestionIds: [suggestion.sId],
      state: "approved",
      applyToSkill: true,
    });

    expect(response.status).toBe(400);
  });

  it("applies an instruction edit", async () => {
    const { workspace, auth, skill, blockIds } =
      await setupSkillWithBlockInstructions();
    const suggestion = await SkillSuggestionFactory.create(auth, skill, {
      state: "pending",
      suggestion: instructionEditSuggestion(
        blockIds[0],
        "<p>Rewritten instructions</p>"
      ),
    });

    const response = await patch(workspace, skill.sId, {
      suggestionIds: [suggestion.sId],
      state: "approved",
      applyToSkill: true,
    });

    expect(response.status).toBe(200);

    const updated = await SkillResource.fetchById(auth, skill.sId);
    expect(updated?.instructions).toContain("Rewritten instructions");
    expect(updated?.instructions).not.toContain("Original instructions");
  });

  it("applies an edit holding a closed <tool></tool> tag", async () => {
    const { workspace, auth, globalSpace, skill, blockIds } =
      await setupSkillWithBlockInstructions();
    const server = await RemoteMCPServerFactory.create(workspace, {
      name: "Web search",
    });
    const view = await MCPServerViewFactory.create(
      workspace,
      server.sId,
      globalSpace
    );
    const suggestion = await SkillSuggestionFactory.create(auth, skill, {
      state: "pending",
      suggestion: instructionEditSuggestion(
        blockIds[0],
        `<p>Use <tool id="${view.sId}" name="Web search"></tool> then summarize.</p>`
      ),
    });

    const response = await patch(workspace, skill.sId, {
      suggestionIds: [suggestion.sId],
      state: "approved",
      applyToSkill: true,
    });

    expect(response.status).toBe(200);

    const updated = await SkillResource.fetchById(auth, skill.sId);
    expect(updated?.instructions).toBe(
      `Use <tool id="${view.sId}" name="Web search" /> then summarize.`
    );
  });

  it("correctly applies an edit that inserts a <knowledge> tag", async () => {
    const { workspace, auth, globalSpace, skill, blockIds } =
      await setupSkillWithBlockInstructions();
    const dataSourceView = await DataSourceViewFactory.folder(
      workspace,
      globalSpace
    );
    const suggestion = await SkillSuggestionFactory.create(auth, skill, {
      state: "pending",
      suggestion: instructionEditSuggestion(
        blockIds[0],
        `<p>Read <knowledge id="node_1" title="Handbook" space="${globalSpace.sId}" dsv="${dataSourceView.sId}" hasChildren="false"></knowledge> first.</p>`
      ),
    });

    await patch(workspace, skill.sId, {
      suggestionIds: [suggestion.sId],
      state: "approved",
      applyToSkill: true,
    });

    const updated = await SkillResource.fetchById(auth, skill.sId);
    assert(updated, "the skill is gone");

    const referencedNodeIds = [
      ...updated.instructions.matchAll(/<knowledge[^>]*\sid="([^"]+)"/g),
    ].map((m) => m[1]);
    const attachedNodeIds = (await updated.getAttachedKnowledge(auth)).map(
      (k) => k.nodeId
    );

    // Whatever the instructions reference, the skill must actually have attached.
    expect(attachedNodeIds).toEqual(referencedNodeIds);
  });

  it("rejects an edit that adds a <knowledge> tag the caller cannot read", async () => {
    const { workspace, auth, skill, blockIds } =
      await setupSkillWithBlockInstructions();
    const suggestion = await SkillSuggestionFactory.create(auth, skill, {
      state: "pending",
      suggestion: instructionEditSuggestion(
        blockIds[0],
        '<p>Read <knowledge id="node_1" title="Handbook" space="spc_1" dsv="dsv_1" hasChildren="false"></knowledge> first.</p>'
      ),
    });

    const response = await patch(workspace, skill.sId, {
      suggestionIds: [suggestion.sId],
      state: "approved",
      applyToSkill: true,
    });

    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toContain(
      'knowledge "Handbook" (node_1)'
    );

    const updated = await SkillResource.fetchById(auth, skill.sId);
    expect(updated?.instructions).toBe("Original instructions");
  });

  it("rejects an edit that adds a <tool> tag that does not exist", async () => {
    const { workspace, auth, skill, blockIds } =
      await setupSkillWithBlockInstructions();
    const suggestion = await SkillSuggestionFactory.create(auth, skill, {
      state: "pending",
      suggestion: instructionEditSuggestion(
        blockIds[0],
        '<p>Use <tool id="msv_abc123" name="Web search"></tool> then summarize.</p>'
      ),
    });

    const response = await patch(workspace, skill.sId, {
      suggestionIds: [suggestion.sId],
      state: "approved",
      applyToSkill: true,
    });

    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toContain(
      'tool "Web search" (msv_abc123)'
    );

    const updated = await SkillResource.fetchById(auth, skill.sId);
    expect(updated?.instructions).toBe("Original instructions");
    expect(updated?.mcpServerViews).toEqual([]);
  });

  // A regular space with no global group attached is restricted: only its members read it. The
  // caller joins it so the resources built on it stay readable to them.
  async function restrictedSpaceWithCaller(
    workspace: WorkspaceType,
    auth: Authenticator
  ) {
    const space = await SpaceFactory.regular(workspace);
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    await space.addMembers(adminAuth, {
      userIds: [auth.getNonNullableUser().sId],
    });
    await auth.refresh();

    return space;
  }

  function skillReferenceHtml(skill: SkillResource) {
    return serializeSkillTag(
      { icon: skill.icon, id: skill.sId, name: skill.name },
      { html: true }
    );
  }

  it("requests the spaces of a nested skill a suggestion adds", async () => {
    const { workspace, auth, skill, blockIds } =
      await setupSkillWithBlockInstructions();
    const restrictedSpace = await restrictedSpaceWithCaller(workspace, auth);
    const child = await SkillFactory.create(auth, {
      name: "Restricted child",
      requestedSpaceIds: [restrictedSpace.id],
    });
    const suggestion = await SkillSuggestionFactory.create(auth, skill, {
      state: "pending",
      suggestion: instructionEditSuggestion(
        blockIds[0],
        `<p>Start with ${skillReferenceHtml(child)}.</p>`
      ),
    });

    const response = await patch(workspace, skill.sId, {
      suggestionIds: [suggestion.sId],
      state: "approved",
      applyToSkill: true,
    });

    expect(response.status).toBe(200);

    const updated = await SkillResource.fetchById(auth, skill.sId);
    assert(updated, "the skill is gone");
    expect(updated.instructions).toContain(`<skill id="${child.sId}"`);
    expect(updated.instructions).not.toContain("<unavailable_skill");
    expect(updated.requestedSpaceIds).toContain(restrictedSpace.id);
  });

  it("rejects a nested skill whose spaces another editor cannot read", async () => {
    const { workspace, auth, globalSpace, skill, blockIds } =
      await setupSkillWithBlockInstructions();
    const otherEditor = await UserFactory.basic();
    await MembershipFactory.associate(workspace, otherEditor, { role: "user" });
    expect((await skill.addEditors(auth, [otherEditor])).isOk()).toBe(true);
    const restrictedSpace = await restrictedSpaceWithCaller(workspace, auth);
    const child = await SkillFactory.create(auth, {
      name: "Restricted child",
      requestedSpaceIds: [restrictedSpace.id],
    });
    const suggestion = await SkillSuggestionFactory.create(auth, skill, {
      state: "pending",
      suggestion: instructionEditSuggestion(
        blockIds[0],
        `<p>Start with ${skillReferenceHtml(child)}.</p>`
      ),
    });

    const response = await patch(workspace, skill.sId, {
      suggestionIds: [suggestion.sId],
      state: "approved",
      applyToSkill: true,
    });

    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toContain(
      "do not have access"
    );

    const updated = await SkillResource.fetchById(auth, skill.sId);
    expect(updated?.instructions).toBe("Original instructions");
    expect(updated?.requestedSpaceIds).toEqual([globalSpace.id]);

    const reloaded = await SkillSuggestionResource.fetchById(
      auth,
      suggestion.sId
    );
    expect(reloaded?.state).toBe("pending");
  });

  // A remote server view in a restricted space: a tool that only members of that space can use,
  // so a skill holding it has to request the space (see `listSpaceRequirementsByIds`).
  async function toolViewInRestrictedSpace(
    workspace: WorkspaceType,
    auth: Authenticator
  ) {
    const restrictedSpace = await restrictedSpaceWithCaller(workspace, auth);
    const server = await RemoteMCPServerFactory.create(workspace, {
      name: "GitHub",
    });
    const view = await MCPServerViewFactory.create(
      workspace,
      server.sId,
      restrictedSpace
    );

    return { restrictedSpace, view };
  }

  it("attaches the tool a suggestion adds and requests its space", async () => {
    const { workspace, auth, skill, blockIds } =
      await setupSkillWithBlockInstructions();
    const { restrictedSpace, view } = await toolViewInRestrictedSpace(
      workspace,
      auth
    );
    const suggestion = await SkillSuggestionFactory.create(auth, skill, {
      state: "pending",
      suggestion: instructionEditSuggestion(
        blockIds[0],
        `<p>Use <tool id="${view.sId}" name="GitHub"></tool> then summarize.</p>`
      ),
    });

    const response = await patch(workspace, skill.sId, {
      suggestionIds: [suggestion.sId],
      state: "approved",
      applyToSkill: true,
    });

    expect(response.status).toBe(200);

    const updated = await SkillResource.fetchById(auth, skill.sId);
    assert(updated, "the skill is gone");
    expect(updated.instructions).toContain(`<tool id="${view.sId}"`);
    expect(updated.mcpServerViews.map((v) => v.sId)).toEqual([view.sId]);
    expect(updated.requestedSpaceIds).toContain(restrictedSpace.id);
  });

  it("rejects a tool whose space another editor cannot read", async () => {
    const { workspace, auth, globalSpace, skill, blockIds } =
      await setupSkillWithBlockInstructions();
    const otherEditor = await UserFactory.basic();
    await MembershipFactory.associate(workspace, otherEditor, { role: "user" });
    expect((await skill.addEditors(auth, [otherEditor])).isOk()).toBe(true);
    // The caller joins the space; `otherEditor` does not.
    const { view } = await toolViewInRestrictedSpace(workspace, auth);
    const suggestion = await SkillSuggestionFactory.create(auth, skill, {
      state: "pending",
      suggestion: instructionEditSuggestion(
        blockIds[0],
        `<p>Use <tool id="${view.sId}" name="GitHub"></tool> then summarize.</p>`
      ),
    });

    const response = await patch(workspace, skill.sId, {
      suggestionIds: [suggestion.sId],
      state: "approved",
      applyToSkill: true,
    });

    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toContain(
      "do not have access"
    );

    // Nothing was written: not the text, not the attachment, not the space.
    const updated = await SkillResource.fetchById(auth, skill.sId);
    assert(updated, "the skill is gone");
    expect(updated.instructions).toBe("Original instructions");
    expect(updated.mcpServerViews).toEqual([]);
    expect(updated.requestedSpaceIds).toEqual([globalSpace.id]);

    const reloaded = await SkillSuggestionResource.fetchById(
      auth,
      suggestion.sId
    );
    expect(reloaded?.state).toBe("pending");
  });

  it("detaches the tool a suggestion removes and stops requesting its space", async () => {
    const { workspace, auth, globalSpace } = await createPrivateApiMockRequest({
      role: "user",
    });
    const { restrictedSpace, view } = await toolViewInRestrictedSpace(
      workspace,
      auth
    );
    const markdown = `Use <tool id="${view.sId}" name="GitHub" /> then summarize.`;
    const instructionsHtml = convertMarkdownToBlockHtml(markdown);
    const skill = await SkillFactory.create(auth, {
      instructions: markdown,
      instructionsHtml,
      mcpServerViews: [view],
      requestedSpaceIds: [restrictedSpace.id],
    });
    const [blockId] = blockIdsOf(instructionsHtml);
    const suggestion = await SkillSuggestionFactory.create(auth, skill, {
      state: "pending",
      suggestion: instructionEditSuggestion(
        blockId,
        "<p>Summarize from memory.</p>"
      ),
    });

    const response = await patch(workspace, skill.sId, {
      suggestionIds: [suggestion.sId],
      state: "approved",
      applyToSkill: true,
    });

    expect(response.status).toBe(200);

    const updated = await SkillResource.fetchById(auth, skill.sId);
    assert(updated, "the skill is gone");
    expect(updated.instructions).toBe("Summarize from memory.");
    expect(updated.mcpServerViews).toEqual([]);
    expect(updated.requestedSpaceIds).toEqual([globalSpace.id]);
  });

  it("attaches the knowledge a suggestion adds and requests its space", async () => {
    const { workspace, auth, skill, blockIds } =
      await setupSkillWithBlockInstructions();
    const restrictedSpace = await restrictedSpaceWithCaller(workspace, auth);
    const dataSourceView = await DataSourceViewFactory.folder(
      workspace,
      restrictedSpace
    );
    const suggestion = await SkillSuggestionFactory.create(auth, skill, {
      state: "pending",
      suggestion: instructionEditSuggestion(
        blockIds[0],
        `<p>Read <knowledge id="node_1" title="Handbook" space="${restrictedSpace.sId}" dsv="${dataSourceView.sId}" hasChildren="false"></knowledge> first.</p>`
      ),
    });

    const response = await patch(workspace, skill.sId, {
      suggestionIds: [suggestion.sId],
      state: "approved",
      applyToSkill: true,
    });

    expect(response.status).toBe(200);

    const updated = await SkillResource.fetchById(auth, skill.sId);
    assert(updated, "the skill is gone");
    expect(updated.instructions).toContain('<knowledge id="node_1"');

    const attached = await updated.getAttachedKnowledge(auth);
    expect(
      attached.map((k) => ({
        dataSourceViewId: k.dataSourceView.sId,
        nodeId: k.nodeId,
      }))
    ).toEqual([{ dataSourceViewId: dataSourceView.sId, nodeId: "node_1" }]);
    expect(updated.requestedSpaceIds).toContain(restrictedSpace.id);
  });

  it("applies several suggestions targeting different blocks in one call", async () => {
    const { workspace, auth, skill, blockIds } =
      await setupSkillWithBlockInstructions("Alpha\n\nBravo");
    const [alphaId, bravoId] = blockIds;

    const first = await SkillSuggestionFactory.create(auth, skill, {
      state: "pending",
      suggestion: instructionEditSuggestion(alphaId, "<p>Alpha edited</p>"),
    });
    const second = await SkillSuggestionFactory.create(auth, skill, {
      state: "pending",
      suggestion: instructionEditSuggestion(bravoId, "<p>Bravo edited</p>"),
    });

    const response = await patch(workspace, skill.sId, {
      suggestionIds: [first.sId, second.sId],
      state: "approved",
      applyToSkill: true,
    });

    expect(response.status).toBe(200);

    const updated = await SkillResource.fetchById(auth, skill.sId);
    expect(updated?.instructions).toContain("Alpha edited");
    expect(updated?.instructions).toContain("Bravo edited");
  });

  it("refuses the whole call when one edit targets a missing block", async () => {
    const { workspace, auth, skill, blockIds } =
      await setupSkillWithBlockInstructions();
    const applicable = await SkillSuggestionFactory.create(auth, skill, {
      state: "pending",
      suggestion: instructionEditSuggestion(blockIds[0], "<p>Would apply</p>"),
    });
    const stale = await SkillSuggestionFactory.create(auth, skill, {
      state: "pending",
      suggestion: instructionEditSuggestion("gone12345", "<p>Never</p>"),
    });

    const response = await patch(workspace, skill.sId, {
      suggestionIds: [applicable.sId, stale.sId],
      state: "approved",
      applyToSkill: true,
    });

    expect(response.status).toBe(400);

    const updated = await SkillResource.fetchById(auth, skill.sId);
    expect(updated?.instructions).toBe("Original instructions");
    expect(updated?.instructions).not.toContain("Would apply");

    const untouched = await SkillSuggestionResource.fetchByIds(auth, [
      applicable.sId,
      stale.sId,
    ]);
    expect(untouched.map((s) => s.state)).toEqual(["pending", "pending"]);
  });

  it("returns 403 when an admin is not an editor of the skill", async () => {
    const { workspace, skill, suggestion } =
      await setupAdminWithOtherBuilderSkill();

    const response = await patch(workspace, skill.sId, {
      suggestionIds: [suggestion.sId],
      state: "approved",
      applyToSkill: true,
    });

    expect(response.status).toBe(403);
    expect((await response.json()).error.message).toContain(
      "Only editors can modify this skill"
    );
  });

  it("allows an admin who is not an editor to approve and apply a delete suggestion", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "admin" });

    const skillOwner = await UserFactory.basic();
    await MembershipFactory.associate(workspace, skillOwner, {
      role: "user",
    });
    const ownerAuth = await Authenticator.fromUserIdAndWorkspaceId(
      skillOwner.sId,
      workspace.sId
    );
    const skill = await SkillFactory.create(ownerAuth, {
      name: "Skill Pending Deletion",
    });
    await ownerAuth.refresh();
    const suggestion = await SkillSuggestionFactory.create(ownerAuth, skill, {
      state: "pending",
      kind: "delete",
      suggestion: {},
    });

    const response = await patch(workspace, skill.sId, {
      suggestionIds: [suggestion.sId],
      state: "approved",
      applyToSkill: true,
    });

    expect(response.status).toBe(200);
    expect((await response.json()).suggestions[0].state).toBe("approved");

    const updated = await SkillResource.fetchById(ownerAuth, skill.sId, {
      onlyActive: false,
    });
    expect(updated?.status).toBe("archived");
  });

  it("rejects applying with a state other than approved", async () => {
    const { workspace, auth, skill } = await setup();
    const suggestion = await SkillSuggestionFactory.create(auth, skill, {
      state: "pending",
    });

    const response = await patch(workspace, skill.sId, {
      suggestionIds: [suggestion.sId],
      state: "rejected",
      applyToSkill: true,
    });

    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toContain(
      "Only an approved suggestion can be applied"
    );
  });

  it("rejects applying a suggestion that was already reviewed", async () => {
    const { workspace, auth, skill } = await setup();
    const suggestion = await SkillSuggestionFactory.create(auth, skill, {
      state: "approved",
    });

    const response = await patch(workspace, skill.sId, {
      suggestionIds: [suggestion.sId],
      state: "approved",
      applyToSkill: true,
    });

    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toContain(
      "already been reviewed"
    );
  });
});

describe("GET /api/w/:wId/assistant/skills/:sId/suggestions", () => {
  it("returns skill's suggestions", async () => {
    const { workspace, auth, skill } = await setup();
    const suggestion = await SkillSuggestionFactory.create(auth, skill, {
      state: "pending",
    });

    const response = await get(workspace, skill.sId);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.suggestions).toHaveLength(1);
    expect(body.suggestions[0].sId).toBe(suggestion.sId);
  });

  it("returns suggestions to an admin for a skill they do not edit", async () => {
    const { workspace, skill, suggestion } =
      await setupAdminWithOtherBuilderSkill();

    const response = await get(workspace, skill.sId);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.suggestions).toHaveLength(1);
    expect(body.suggestions[0].sId).toBe(suggestion.sId);
  });

  it("does not return other skill's suggestions", async () => {
    const { workspace, auth, skill } = await setup();
    const skill2 = await SkillFactory.create(auth, { name: "Test Skill 2" });
    await auth.refresh();

    const s1 = await SkillSuggestionFactory.create(auth, skill, {
      state: "pending",
    });
    await SkillSuggestionFactory.create(auth, skill2, { state: "pending" });

    const response = await get(workspace, skill.sId);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.suggestions).toHaveLength(1);
    expect(body.suggestions[0].sId).toBe(s1.sId);
  });

  it("filters on kind and state correctly", async () => {
    const { workspace, auth, skill } = await setup();
    const matching = await SkillSuggestionFactory.create(auth, skill, {
      state: "pending",
      kind: "edit",
    });
    await SkillSuggestionFactory.create(auth, skill, {
      state: "approved",
      kind: "edit",
    });

    const response = await get(workspace, skill.sId, {
      states: ["pending"],
      kind: "edit",
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.suggestions).toHaveLength(1);
    expect(body.suggestions[0].sId).toBe(matching.sId);
    expect(body.suggestions[0].kind).toBe("edit");
    expect(body.suggestions[0].state).toBe("pending");
  });

  it("filters on a kind other than edit", async () => {
    const { workspace, auth, skill } = await setup();
    const matching = await SkillSuggestionFactory.create(auth, skill, {
      state: "pending",
      kind: "editors",
      suggestion: { addUserIds: ["usr_a"], removeUserIds: [] },
    });
    await SkillSuggestionFactory.create(auth, skill, {
      state: "pending",
      kind: "edit",
    });

    const response = await get(workspace, skill.sId, { kind: "editors" });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.suggestions).toHaveLength(1);
    expect(body.suggestions[0].sId).toBe(matching.sId);
    expect(body.suggestions[0].kind).toBe("editors");
  });

  it("limits the number of returned suggestions", async () => {
    const { workspace, auth, skill } = await setup();
    await SkillSuggestionFactory.create(auth, skill, { state: "pending" });
    await SkillSuggestionFactory.create(auth, skill, { state: "pending" });
    await SkillSuggestionFactory.create(auth, skill, { state: "pending" });

    const response = await get(workspace, skill.sId, { limit: "2" });

    expect(response.status).toBe(200);
    expect((await response.json()).suggestions).toHaveLength(2);
  });

  it("returns 403 for non-editor of the skill", async () => {
    const { workspace } = await setup();

    const skillOwner = await UserFactory.basic();
    await MembershipFactory.associate(workspace, skillOwner, {
      role: "user",
    });
    const ownerAuth = await Authenticator.fromUserIdAndWorkspaceId(
      skillOwner.sId,
      workspace.sId
    );
    const otherSkill = await SkillFactory.create(ownerAuth, {
      name: "Other Skill",
    });
    await ownerAuth.refresh();
    await SkillSuggestionFactory.create(ownerAuth, otherSkill, {
      state: "pending",
    });

    const response = await get(workspace, otherSkill.sId);

    expect(response.status).toBe(403);
    expect((await response.json()).error.type).toBe(
      "agent_group_permission_error"
    );
  });

  it("returns empty suggestions when reinforcement is disabled", async () => {
    const { hasReinforcementEnabled } = await import(
      "@app/lib/reinforcement/workspace_check"
    );
    vi.mocked(hasReinforcementEnabled).mockResolvedValueOnce(false);

    const { workspace, auth, skill } = await setup();
    await SkillSuggestionFactory.create(auth, skill, { state: "pending" });

    const response = await get(workspace, skill.sId);

    expect(response.status).toBe(200);
    expect((await response.json()).suggestions).toHaveLength(0);
  });
});

describe("skill suggestion sources", () => {
  it("omits conversational suggestions when no source is requested", async () => {
    const { workspace, auth, skill } = await setup();
    await FeatureFlagFactory.basic(auth, "conversational_building");
    const reinforcement = await SkillSuggestionFactory.create(auth, skill, {
      state: "pending",
      source: "reinforcement",
    });
    await SkillSuggestionFactory.create(auth, skill, {
      state: "pending",
      source: "conversational",
    });

    const response = await get(workspace, skill.sId);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.suggestions).toHaveLength(1);
    expect(body.suggestions[0].sId).toBe(reinforcement.sId);
  });

  it("returns conversational suggestions when they are requested", async () => {
    const { workspace, auth, skill } = await setup();
    await FeatureFlagFactory.basic(auth, "conversational_building");
    await SkillSuggestionFactory.create(auth, skill, {
      state: "pending",
      source: "reinforcement",
    });
    const conversational = await SkillSuggestionFactory.create(auth, skill, {
      state: "pending",
      source: "conversational",
    });

    const response = await get(workspace, skill.sId, {
      sources: ["conversational"],
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.suggestions).toHaveLength(1);
    expect(body.suggestions[0].sId).toBe(conversational.sId);
  });

  it("returns no conversational suggestions without the feature flag", async () => {
    const { workspace, auth, skill } = await setup();
    await SkillSuggestionFactory.create(auth, skill, {
      state: "pending",
      source: "conversational",
    });

    const response = await get(workspace, skill.sId, {
      sources: ["conversational"],
    });

    expect(response.status).toBe(200);
    expect((await response.json()).suggestions).toHaveLength(0);
  });

  it("rejects synthetic as a source", async () => {
    const { workspace, skill } = await setup();

    const response = await get(workspace, skill.sId, {
      sources: ["synthetic"],
    });

    expect(response.status).toBe(400);
    expect((await response.json()).error.type).toBe("invalid_request_error");
  });
});

describe("PATCH with applyToSkill (editors)", () => {
  async function addMember(workspace: WorkspaceType) {
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "user" });

    return user;
  }

  // Editors suggestions are recorded from a conversation, and the route only reviews
  // `conversational` rows when the flag that produces them is on.
  async function setupWithFlag() {
    const context = await setup();
    await FeatureFlagFactory.basic(context.auth, "conversational_building");

    return context;
  }

  async function editorsSuggestion(
    auth: Authenticator,
    skill: SkillResource,
    suggestion: { addUserIds?: string[]; removeUserIds?: string[] }
  ) {
    return SkillSuggestionFactory.create(auth, skill, {
      kind: "editors",
      source: "conversational",
      state: "pending",
      suggestion: {
        addUserIds: suggestion.addUserIds ?? [],
        removeUserIds: suggestion.removeUserIds ?? [],
      },
    });
  }

  async function listEditorIds(auth: Authenticator, skill: SkillResource) {
    const editors = (await skill.listEditors(auth)) ?? [];

    return editors.map((editor) => editor.sId).sort();
  }

  it("adds and removes editors", async () => {
    const { workspace, auth, skill } = await setupWithFlag();
    const added = await addMember(workspace);
    const removed = await addMember(workspace);
    expect((await skill.addEditors(auth, [removed])).isOk()).toBe(true);

    const suggestion = await editorsSuggestion(auth, skill, {
      addUserIds: [added.sId],
      removeUserIds: [removed.sId],
    });

    const response = await patch(workspace, skill.sId, {
      suggestionIds: [suggestion.sId],
      state: "approved",
      applyToSkill: true,
    });

    expect(response.status).toBe(200);
    expect((await response.json()).suggestions[0].state).toBe("approved");

    expect(await listEditorIds(auth, skill)).toEqual(
      [auth.getNonNullableUser().sId, added.sId].sort()
    );
  });

  it("does not save a skill version when only the editors change", async () => {
    const { workspace, auth, skill } = await setupWithFlag();
    const added = await addMember(workspace);
    const suggestion = await editorsSuggestion(auth, skill, {
      addUserIds: [added.sId],
    });
    const versionsBefore = (await skill.listVersions(auth)).length;

    const response = await patch(workspace, skill.sId, {
      suggestionIds: [suggestion.sId],
      state: "approved",
      applyToSkill: true,
    });

    expect(response.status).toBe(200);
    expect((await skill.listVersions(auth)).length).toBe(versionsBefore);
  });

  it("rejects an added editor who left the workspace since the suggestion was recorded", async () => {
    const { workspace, auth, skill } = await setupWithFlag();
    const departed = await addMember(workspace);
    const suggestion = await editorsSuggestion(auth, skill, {
      addUserIds: [departed.sId],
    });
    await MembershipResource.revokeMembership({ user: departed, workspace });

    const response = await patch(workspace, skill.sId, {
      suggestionIds: [suggestion.sId],
      state: "approved",
      applyToSkill: true,
    });

    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toContain(
      "not active members"
    );

    const reloaded = await SkillSuggestionResource.fetchById(
      auth,
      suggestion.sId
    );
    expect(reloaded?.state).toBe("pending");
    expect(await listEditorIds(auth, skill)).toEqual([
      auth.getNonNullableUser().sId,
    ]);
  });

  it("rejects an added editor without access to the skill's requested spaces", async () => {
    const { workspace, auth } = await setupWithFlag();
    // Restricted: no global group is associated with it.
    const restrictedSpace = await SpaceFactory.regular(workspace);
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    await restrictedSpace.addMembers(adminAuth, {
      userIds: [auth.getNonNullableUser().sId],
    });
    await auth.refresh();
    const skill = await SkillFactory.create(auth, {
      name: "Restricted",
      requestedSpaceIds: [restrictedSpace.id],
    });
    await auth.refresh();
    const outsider = await addMember(workspace);
    const suggestion = await editorsSuggestion(auth, skill, {
      addUserIds: [outsider.sId],
    });

    const response = await patch(workspace, skill.sId, {
      suggestionIds: [suggestion.sId],
      state: "approved",
      applyToSkill: true,
    });

    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toContain(
      "do not have access"
    );
    expect(await listEditorIds(auth, skill)).toEqual([
      auth.getNonNullableUser().sId,
    ]);
  });

  it("rejects a batch that both adds and removes the same user", async () => {
    const { workspace, auth, skill } = await setupWithFlag();
    const contested = await addMember(workspace);
    expect((await skill.addEditors(auth, [contested])).isOk()).toBe(true);

    const adding = await editorsSuggestion(auth, skill, {
      addUserIds: [contested.sId],
    });
    const removing = await editorsSuggestion(auth, skill, {
      removeUserIds: [contested.sId],
    });

    const response = await patch(workspace, skill.sId, {
      suggestionIds: [adding.sId, removing.sId],
      state: "approved",
      applyToSkill: true,
    });

    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toContain(
      "both added and removed"
    );
    expect(await listEditorIds(auth, skill)).toEqual(
      [auth.getNonNullableUser().sId, contested.sId].sort()
    );
  });

  it("rejects a change that would leave the skill without an editor", async () => {
    const { workspace, auth, skill } = await setupWithFlag();
    const suggestion = await editorsSuggestion(auth, skill, {
      removeUserIds: [auth.getNonNullableUser().sId],
    });

    const response = await patch(workspace, skill.sId, {
      suggestionIds: [suggestion.sId],
      state: "approved",
      applyToSkill: true,
    });

    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toContain(
      "without any editor"
    );
    expect(await listEditorIds(auth, skill)).toEqual([
      auth.getNonNullableUser().sId,
    ]);
  });

  it("outdates the conflicting pending suggestions only", async () => {
    const { workspace, auth, skill } = await setupWithFlag();
    const added = await addMember(workspace);
    const unrelated = await addMember(workspace);

    const approved = await editorsSuggestion(auth, skill, {
      addUserIds: [added.sId],
    });
    const conflicting = await editorsSuggestion(auth, skill, {
      addUserIds: [added.sId],
    });
    const nonConflicting = await editorsSuggestion(auth, skill, {
      addUserIds: [unrelated.sId],
    });
    const edit = await SkillSuggestionFactory.create(auth, skill, {
      state: "pending",
    });

    const response = await patch(workspace, skill.sId, {
      suggestionIds: [approved.sId],
      state: "approved",
      applyToSkill: true,
    });

    expect(response.status).toBe(200);

    const states = await Promise.all(
      [conflicting, nonConflicting, edit].map(
        async (suggestion) =>
          (await SkillSuggestionResource.fetchById(auth, suggestion.sId))?.state
      )
    );
    expect(states).toEqual(["outdated", "pending", "pending"]);
  });

  it("leaves the editors untouched when applyToSkill is not set", async () => {
    const { workspace, auth, skill } = await setupWithFlag();
    const added = await addMember(workspace);
    const suggestion = await editorsSuggestion(auth, skill, {
      addUserIds: [added.sId],
    });

    const response = await patch(workspace, skill.sId, {
      suggestionIds: [suggestion.sId],
      state: "approved",
    });

    expect(response.status).toBe(200);
    expect((await response.json()).suggestions[0].state).toBe("approved");
    expect(await listEditorIds(auth, skill)).toEqual([
      auth.getNonNullableUser().sId,
    ]);
  });
});

describe("PATCH with applyToSkill (user_facing_description)", () => {
  async function setupWithFlag() {
    const context = await setup();
    await FeatureFlagFactory.basic(context.auth, "conversational_building");

    return context;
  }

  async function descriptionSuggestion(
    auth: Authenticator,
    skill: SkillResource,
    userFacingDescription: string
  ) {
    return SkillSuggestionFactory.create(auth, skill, {
      kind: "user_facing_description",
      source: "conversational",
      state: "pending",
      suggestion: { userFacingDescription },
    });
  }

  it("replaces the user-facing description and saves a version", async () => {
    const { workspace, auth, skill } = await setupWithFlag();
    const suggestion = await descriptionSuggestion(
      auth,
      skill,
      "Paste notes, get a summary."
    );
    const versionsBefore = (await skill.listVersions(auth)).length;

    const response = await patch(workspace, skill.sId, {
      suggestionIds: [suggestion.sId],
      state: "approved",
      applyToSkill: true,
    });

    expect(response.status).toBe(200);
    expect((await response.json()).suggestions[0].state).toBe("approved");

    const updated = await SkillResource.fetchById(auth, skill.sId);
    expect(updated?.userFacingDescription).toBe("Paste notes, get a summary.");
    expect(updated?.agentFacingDescription).toBe(skill.agentFacingDescription);
    expect((await skill.listVersions(auth)).length).toBe(versionsBefore + 1);
  });

  it("outdates the other pending description suggestions only", async () => {
    const { workspace, auth, skill } = await setupWithFlag();
    const approved = await descriptionSuggestion(auth, skill, "Approved.");
    const conflicting = await descriptionSuggestion(auth, skill, "Other.");
    const edit = await SkillSuggestionFactory.create(auth, skill, {
      state: "pending",
    });

    const response = await patch(workspace, skill.sId, {
      suggestionIds: [approved.sId],
      state: "approved",
      applyToSkill: true,
    });

    expect(response.status).toBe(200);

    const states = await Promise.all(
      [conflicting, edit].map(
        async (suggestion) =>
          (await SkillSuggestionResource.fetchById(auth, suggestion.sId))?.state
      )
    );
    expect(states).toEqual(["outdated", "pending"]);
  });

  it("leaves the skill untouched when applyToSkill is not set", async () => {
    const { workspace, auth, skill } = await setupWithFlag();
    const suggestion = await descriptionSuggestion(auth, skill, "Unapplied.");

    const response = await patch(workspace, skill.sId, {
      suggestionIds: [suggestion.sId],
      state: "approved",
    });

    expect(response.status).toBe(200);
    const updated = await SkillResource.fetchById(auth, skill.sId);
    expect(updated?.userFacingDescription).toBe(skill.userFacingDescription);
  });
});

describe("PATCH with applyToSkill (name)", () => {
  async function setupWithFlag() {
    const context = await setup();
    await FeatureFlagFactory.basic(context.auth, "conversational_building");

    return context;
  }

  async function nameSuggestion(
    auth: Authenticator,
    skill: SkillResource,
    name: string
  ) {
    return SkillSuggestionFactory.create(auth, skill, {
      kind: "name",
      source: "conversational",
      state: "pending",
      suggestion: { name },
    });
  }

  it("renames the skill and saves a version", async () => {
    const { workspace, auth, skill } = await setupWithFlag();
    const suggestion = await nameSuggestion(auth, skill, "Renamed Skill");
    const versionsBefore = (await skill.listVersions(auth)).length;

    const response = await patch(workspace, skill.sId, {
      suggestionIds: [suggestion.sId],
      state: "approved",
      applyToSkill: true,
    });

    expect(response.status).toBe(200);
    expect((await response.json()).suggestions[0].state).toBe("approved");

    const updated = await SkillResource.fetchById(auth, skill.sId);
    expect(updated?.name).toBe("Renamed Skill");
    expect((await skill.listVersions(auth)).length).toBe(versionsBefore + 1);
  });

  it("returns 400 when the name was taken after the suggestion was recorded", async () => {
    const { workspace, auth, skill } = await setupWithFlag();
    const suggestion = await nameSuggestion(auth, skill, "Taken Later");
    await SkillFactory.create(auth, { name: "Taken Later" });

    const response = await patch(workspace, skill.sId, {
      suggestionIds: [suggestion.sId],
      state: "approved",
      applyToSkill: true,
    });

    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toContain("already exists");

    const reloaded = await SkillSuggestionResource.fetchById(
      auth,
      suggestion.sId
    );
    expect(reloaded?.state).toBe("pending");
    const updated = await SkillResource.fetchById(auth, skill.sId);
    expect(updated?.name).toBe(skill.name);
  });

  it("outdates the other pending renames only", async () => {
    const { workspace, auth, skill } = await setupWithFlag();
    const approved = await nameSuggestion(auth, skill, "Approved Name");
    const conflicting = await nameSuggestion(auth, skill, "Other Name");
    const edit = await SkillSuggestionFactory.create(auth, skill, {
      state: "pending",
    });

    const response = await patch(workspace, skill.sId, {
      suggestionIds: [approved.sId],
      state: "approved",
      applyToSkill: true,
    });

    expect(response.status).toBe(200);

    const states = await Promise.all(
      [conflicting, edit].map(
        async (suggestion) =>
          (await SkillSuggestionResource.fetchById(auth, suggestion.sId))?.state
      )
    );
    expect(states).toEqual(["outdated", "pending"]);
  });
});

describe("PATCH with applyToSkill (availability)", () => {
  // `hasWorkspacePermission` is true for admins; the editor-without-publish case uses a plain user.
  async function setupWithFlag(role: MembershipRoleType) {
    const context = await setup({ role });
    await FeatureFlagFactory.basic(context.auth, "conversational_building");

    return context;
  }

  async function availabilitySuggestion(
    auth: Authenticator,
    skill: SkillResource,
    availability: "editors" | "workspace_users" | "users_and_agents"
  ) {
    return SkillSuggestionFactory.create(auth, skill, {
      kind: "availability",
      source: "conversational",
      state: "pending",
      suggestion: { availability },
    });
  }

  it("changes the availability and saves a version", async () => {
    const { workspace, auth, skill } = await setupWithFlag("admin");
    const suggestion = await availabilitySuggestion(
      auth,
      skill,
      "users_and_agents"
    );
    const versionsBefore = (await skill.listVersions(auth)).length;

    const response = await patch(workspace, skill.sId, {
      suggestionIds: [suggestion.sId],
      state: "approved",
      applyToSkill: true,
    });

    expect(response.status).toBe(200);
    expect((await response.json()).suggestions[0].state).toBe("approved");

    const updated = await SkillResource.fetchById(auth, skill.sId);
    expect(updated?.availability).toBe("users_and_agents");
    expect((await skill.listVersions(auth)).length).toBe(versionsBefore + 1);
  });

  it("does not save a version when the skill already has the suggested availability", async () => {
    const { workspace, auth, skill } = await setupWithFlag("admin");
    const suggestion = await availabilitySuggestion(auth, skill, "editors");
    const versionsBefore = (await skill.listVersions(auth)).length;

    const response = await patch(workspace, skill.sId, {
      suggestionIds: [suggestion.sId],
      state: "approved",
      applyToSkill: true,
    });

    expect(response.status).toBe(200);
    expect((await response.json()).suggestions[0].state).toBe("approved");
    expect((await skill.listVersions(auth)).length).toBe(versionsBefore);
  });

  it("returns 403 when the approving editor lacks the publish capability", async () => {
    const { workspace, auth, skill } = await setupWithFlag("user");
    // Recording an availability suggestion also requires `publish`: a workspace admin records it.
    const suggestion = await availabilitySuggestion(
      await Authenticator.internalAdminForWorkspace(workspace.sId),
      skill,
      "workspace_users"
    );

    const response = await patch(workspace, skill.sId, {
      suggestionIds: [suggestion.sId],
      state: "approved",
      applyToSkill: true,
    });

    expect(response.status).toBe(403);

    const reloaded = await SkillSuggestionResource.fetchById(
      auth,
      suggestion.sId
    );
    expect(reloaded?.state).toBe("pending");
    const updated = await SkillResource.fetchById(auth, skill.sId);
    expect(updated?.availability).toBe("editors");
  });

  it("outdates the other pending availability suggestions only", async () => {
    const { workspace, auth, skill } = await setupWithFlag("admin");
    const approved = await availabilitySuggestion(
      auth,
      skill,
      "workspace_users"
    );
    const conflicting = await availabilitySuggestion(
      auth,
      skill,
      "users_and_agents"
    );
    const edit = await SkillSuggestionFactory.create(auth, skill, {
      state: "pending",
    });

    const response = await patch(workspace, skill.sId, {
      suggestionIds: [approved.sId],
      state: "approved",
      applyToSkill: true,
    });

    expect(response.status).toBe(200);

    const states = await Promise.all(
      [conflicting, edit].map(
        async (suggestion) =>
          (await SkillSuggestionResource.fetchById(auth, suggestion.sId))?.state
      )
    );
    expect(states).toEqual(["outdated", "pending"]);
  });
});
