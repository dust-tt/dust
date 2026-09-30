import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { Authenticator } from "@app/lib/auth";
import { convertMarkdownToBlockHtml } from "@app/lib/editor/skill_instructions_html";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { AgentSuggestionResource } from "@app/lib/resources/agent_suggestion_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SkillSuggestionResource } from "@app/lib/resources/skill_suggestion_resource";
import { serializeSkillTag } from "@app/lib/skills/format";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { AgentSuggestionFactory } from "@app/tests/utils/AgentSuggestionFactory";
import { BatchSuggestionFactory } from "@app/tests/utils/BatchSuggestionFactory";
import { DataSourceViewFactory } from "@app/tests/utils/DataSourceViewFactory";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { grantWorkspacePermission } from "@app/tests/utils/permissions";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SkillSuggestionFactory } from "@app/tests/utils/SkillSuggestionFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { setupSkillInstructionsMarkdownPipeline } from "@app/tests/utils/skill_instructions_html";
import { UserFactory } from "@app/tests/utils/UserFactory";
import type { MembershipRoleType } from "@app/types/memberships";
import { INSTRUCTIONS_ROOT_TARGET_BLOCK_ID } from "@app/types/suggestions/agent_suggestion";
import type { WorkspaceType } from "@app/types/user";
import { honoApp } from "@front-api/app";
import assert from "assert";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  setupSkillInstructionsMarkdownPipeline();
});

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
    kind: "name",
    suggestion: { name: "RenamedSkill" },
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

// A skill its creator edits, and an empty batch its suggestions go into.
async function setupSkill(
  options: {
    role?: MembershipRoleType;
    skill?: Parameters<typeof SkillFactory.create>[1];
  } = {}
) {
  const role = options.role ?? "user";
  const { workspace, auth, globalSpace } = await createPrivateApiMockRequest({
    role,
  });

  await FeatureFlagFactory.basic(auth, "conversational_building");

  const skill = await SkillFactory.create(auth, options.skill);
  // Refresh authenticator to pick up the skill's editor group membership.
  await auth.refresh();
  const batch = await BatchSuggestionFactory.createEmpty(auth);

  return { workspace, auth, globalSpace, skill, batch };
}

function approve(workspace: { sId: string }, bId: string) {
  return patch(workspace as WorkspaceType, bId, { state: "approved" });
}

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
  const context = await setupSkill({
    skill: { instructions: markdown, instructionsHtml },
  });

  const blockIds = blockIdsOf(instructionsHtml);
  assert(blockIds.length > 0, "the generated instructions have no block");

  return { ...context, blockIds };
}

function instructionEditSuggestion(targetBlockId: string, content: string) {
  return {
    instructionEdits: [{ targetBlockId, content, type: "replace" as const }],
  };
}

describe("approving skill suggestions", () => {
  it("applies an agent-facing description edit", async () => {
    const { workspace, auth, skill, batch } = await setupSkill();
    await SkillSuggestionFactory.create(auth, skill, {
      batchModelId: batch.id,
      state: "pending",
      suggestion: {
        agentFacingDescriptionEdit: { content: "A better description" },
      },
    });

    const response = await approve(workspace, batch.sId);

    expect(response.status).toBe(200);
    expect((await response.json()).batch.state).toBe("approved");

    const updated = await SkillResource.fetchById(auth, skill.sId);
    expect(updated?.agentFacingDescription).toBe("A better description");
  });

  it("applies a delete suggestion by archiving the skill", async () => {
    const { workspace, auth, skill, batch } = await setupSkill();
    await SkillSuggestionFactory.create(auth, skill, {
      batchModelId: batch.id,
      kind: "delete",
      state: "pending",
      suggestion: {},
    });

    const response = await approve(workspace, batch.sId);

    expect(response.status).toBe(200);
    expect((await response.json()).batch.state).toBe("approved");

    const updated = await SkillResource.fetchById(auth, skill.sId, {
      onlyActive: false,
    });
    expect(updated?.status).toBe("archived");
  });

  it("returns 400 when applying a delete suggestion for an already archived skill", async () => {
    const { workspace, auth, skill, batch } = await setupSkill();
    await SkillSuggestionFactory.create(auth, skill, {
      batchModelId: batch.id,
      kind: "delete",
      state: "pending",
      suggestion: {},
    });
    await skill.archive(auth);

    const response = await approve(workspace, batch.sId);

    expect(response.status).toBe(400);
  });

  it("applies an instruction edit", async () => {
    const { workspace, auth, skill, blockIds, batch } =
      await setupSkillWithBlockInstructions();
    await SkillSuggestionFactory.create(auth, skill, {
      batchModelId: batch.id,
      state: "pending",
      suggestion: instructionEditSuggestion(
        blockIds[0],
        "<p>Rewritten instructions</p>"
      ),
    });

    const response = await approve(workspace, batch.sId);

    expect(response.status).toBe(200);

    const updated = await SkillResource.fetchById(auth, skill.sId);
    expect(updated?.instructions).toContain("Rewritten instructions");
    expect(updated?.instructions).not.toContain("Original instructions");
  });

  it("applies an edit holding a closed <tool></tool> tag", async () => {
    const { workspace, auth, globalSpace, skill, blockIds, batch } =
      await setupSkillWithBlockInstructions();
    const server = await RemoteMCPServerFactory.create(workspace, {
      name: "Web search",
    });
    const view = await MCPServerViewFactory.create(
      workspace,
      server.sId,
      globalSpace
    );
    await SkillSuggestionFactory.create(auth, skill, {
      batchModelId: batch.id,
      state: "pending",
      suggestion: instructionEditSuggestion(
        blockIds[0],
        `<p>Use <tool id="${view.sId}" name="Web search"></tool> then summarize.</p>`
      ),
    });

    const response = await approve(workspace, batch.sId);

    expect(response.status).toBe(200);

    const updated = await SkillResource.fetchById(auth, skill.sId);
    expect(updated?.instructions).toBe(
      `Use <tool id="${view.sId}" name="Web search" /> then summarize.`
    );
  });

  it("correctly applies an edit that inserts a <knowledge> tag", async () => {
    const { workspace, auth, globalSpace, skill, blockIds, batch } =
      await setupSkillWithBlockInstructions();
    const dataSourceView = await DataSourceViewFactory.folder(
      workspace,
      globalSpace
    );
    await SkillSuggestionFactory.create(auth, skill, {
      batchModelId: batch.id,
      state: "pending",
      suggestion: instructionEditSuggestion(
        blockIds[0],
        `<p>Read <knowledge id="node_1" title="Handbook" space="${globalSpace.sId}" dsv="${dataSourceView.sId}" hasChildren="false"></knowledge> first.</p>`
      ),
    });

    await approve(workspace, batch.sId);

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
    const { workspace, auth, skill, blockIds, batch } =
      await setupSkillWithBlockInstructions();
    await SkillSuggestionFactory.create(auth, skill, {
      batchModelId: batch.id,
      state: "pending",
      suggestion: instructionEditSuggestion(
        blockIds[0],
        '<p>Read <knowledge id="node_1" title="Handbook" space="spc_1" dsv="dsv_1" hasChildren="false"></knowledge> first.</p>'
      ),
    });

    const response = await approve(workspace, batch.sId);

    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toContain(
      'knowledge "Handbook" (node_1)'
    );

    const updated = await SkillResource.fetchById(auth, skill.sId);
    expect(updated?.instructions).toBe("Original instructions");
  });

  it("rejects an edit that adds a <tool> tag that does not exist", async () => {
    const { workspace, auth, skill, blockIds, batch } =
      await setupSkillWithBlockInstructions();
    await SkillSuggestionFactory.create(auth, skill, {
      batchModelId: batch.id,
      state: "pending",
      suggestion: instructionEditSuggestion(
        blockIds[0],
        '<p>Use <tool id="msv_abc123" name="Web search"></tool> then summarize.</p>'
      ),
    });

    const response = await approve(workspace, batch.sId);

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
    const { workspace, auth, skill, blockIds, batch } =
      await setupSkillWithBlockInstructions();
    const restrictedSpace = await restrictedSpaceWithCaller(workspace, auth);
    const child = await SkillFactory.create(auth, {
      name: "Restricted child",
      requestedSpaceIds: [restrictedSpace.id],
    });
    await SkillSuggestionFactory.create(auth, skill, {
      batchModelId: batch.id,
      state: "pending",
      suggestion: instructionEditSuggestion(
        blockIds[0],
        `<p>Start with ${skillReferenceHtml(child)}.</p>`
      ),
    });

    const response = await approve(workspace, batch.sId);

    expect(response.status).toBe(200);

    const updated = await SkillResource.fetchById(auth, skill.sId);
    assert(updated, "the skill is gone");
    expect(updated.instructions).toContain(`<skill id="${child.sId}"`);
    expect(updated.instructions).not.toContain("<unavailable_skill");
    expect(updated.requestedSpaceIds).toContain(restrictedSpace.id);
  });

  it("rejects a nested skill whose spaces another editor cannot read", async () => {
    const { workspace, auth, globalSpace, skill, blockIds, batch } =
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
      batchModelId: batch.id,
      state: "pending",
      suggestion: instructionEditSuggestion(
        blockIds[0],
        `<p>Start with ${skillReferenceHtml(child)}.</p>`
      ),
    });

    const response = await approve(workspace, batch.sId);

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
    const { workspace, auth, skill, blockIds, batch } =
      await setupSkillWithBlockInstructions();
    const { restrictedSpace, view } = await toolViewInRestrictedSpace(
      workspace,
      auth
    );
    await SkillSuggestionFactory.create(auth, skill, {
      batchModelId: batch.id,
      state: "pending",
      suggestion: instructionEditSuggestion(
        blockIds[0],
        `<p>Use <tool id="${view.sId}" name="GitHub"></tool> then summarize.</p>`
      ),
    });

    const response = await approve(workspace, batch.sId);

    expect(response.status).toBe(200);

    const updated = await SkillResource.fetchById(auth, skill.sId);
    assert(updated, "the skill is gone");
    expect(updated.instructions).toContain(`<tool id="${view.sId}"`);
    expect(updated.mcpServerViews.map((v) => v.sId)).toEqual([view.sId]);
    expect(updated.requestedSpaceIds).toContain(restrictedSpace.id);
  });

  it("rejects a tool whose space another editor cannot read", async () => {
    const { workspace, auth, globalSpace, skill, blockIds, batch } =
      await setupSkillWithBlockInstructions();
    const otherEditor = await UserFactory.basic();
    await MembershipFactory.associate(workspace, otherEditor, { role: "user" });
    expect((await skill.addEditors(auth, [otherEditor])).isOk()).toBe(true);
    // The caller joins the space; `otherEditor` does not.
    const { view } = await toolViewInRestrictedSpace(workspace, auth);
    const suggestion = await SkillSuggestionFactory.create(auth, skill, {
      batchModelId: batch.id,
      state: "pending",
      suggestion: instructionEditSuggestion(
        blockIds[0],
        `<p>Use <tool id="${view.sId}" name="GitHub"></tool> then summarize.</p>`
      ),
    });

    const response = await approve(workspace, batch.sId);

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
    await FeatureFlagFactory.basic(auth, "conversational_building");
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
    await auth.refresh();
    const batch = await BatchSuggestionFactory.createEmpty(auth);
    const [blockId] = blockIdsOf(instructionsHtml);
    await SkillSuggestionFactory.create(auth, skill, {
      batchModelId: batch.id,
      state: "pending",
      suggestion: instructionEditSuggestion(
        blockId,
        "<p>Summarize from memory.</p>"
      ),
    });

    const response = await approve(workspace, batch.sId);

    expect(response.status).toBe(200);

    const updated = await SkillResource.fetchById(auth, skill.sId);
    assert(updated, "the skill is gone");
    expect(updated.instructions).toBe("Summarize from memory.");
    expect(updated.mcpServerViews).toEqual([]);
    expect(updated.requestedSpaceIds).toEqual([globalSpace.id]);
  });

  it("attaches the knowledge a suggestion adds and requests its space", async () => {
    const { workspace, auth, skill, blockIds, batch } =
      await setupSkillWithBlockInstructions();
    const restrictedSpace = await restrictedSpaceWithCaller(workspace, auth);
    const dataSourceView = await DataSourceViewFactory.folder(
      workspace,
      restrictedSpace
    );
    await SkillSuggestionFactory.create(auth, skill, {
      batchModelId: batch.id,
      state: "pending",
      suggestion: instructionEditSuggestion(
        blockIds[0],
        `<p>Read <knowledge id="node_1" title="Handbook" space="${restrictedSpace.sId}" dsv="${dataSourceView.sId}" hasChildren="false"></knowledge> first.</p>`
      ),
    });

    const response = await approve(workspace, batch.sId);

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
    const { workspace, auth, skill, blockIds, batch } =
      await setupSkillWithBlockInstructions("Alpha\n\nBravo");
    const [alphaId, bravoId] = blockIds;

    await SkillSuggestionFactory.create(auth, skill, {
      batchModelId: batch.id,
      state: "pending",
      suggestion: instructionEditSuggestion(alphaId, "<p>Alpha edited</p>"),
    });
    await SkillSuggestionFactory.create(auth, skill, {
      batchModelId: batch.id,
      state: "pending",
      suggestion: instructionEditSuggestion(bravoId, "<p>Bravo edited</p>"),
    });

    const response = await approve(workspace, batch.sId);

    expect(response.status).toBe(200);

    const updated = await SkillResource.fetchById(auth, skill.sId);
    expect(updated?.instructions).toContain("Alpha edited");
    expect(updated?.instructions).toContain("Bravo edited");
  });

  it("refuses the whole call when one edit targets a missing block", async () => {
    const { workspace, auth, skill, blockIds, batch } =
      await setupSkillWithBlockInstructions();
    const applicable = await SkillSuggestionFactory.create(auth, skill, {
      batchModelId: batch.id,
      state: "pending",
      suggestion: instructionEditSuggestion(blockIds[0], "<p>Would apply</p>"),
    });
    const stale = await SkillSuggestionFactory.create(auth, skill, {
      batchModelId: batch.id,
      state: "pending",
      suggestion: instructionEditSuggestion("gone12345", "<p>Never</p>"),
    });

    const response = await approve(workspace, batch.sId);

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

  it("allows an admin who is not an editor to approve and apply a delete suggestion", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      role: "admin",
    });
    await FeatureFlagFactory.basic(auth, "conversational_building");

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
    const batch = await BatchSuggestionFactory.createEmpty(ownerAuth);
    await SkillSuggestionFactory.create(ownerAuth, skill, {
      batchModelId: batch.id,
      state: "pending",
      kind: "delete",
      suggestion: {},
    });

    const response = await approve(workspace, batch.sId);

    expect(response.status).toBe(200);
    expect((await response.json()).batch.state).toBe("approved");

    const updated = await SkillResource.fetchById(ownerAuth, skill.sId, {
      onlyActive: false,
    });
    expect(updated?.status).toBe("archived");
  });
});

describe("approving skill suggestions (editors)", () => {
  async function addMember(workspace: WorkspaceType) {
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "user" });

    return user;
  }

  async function editorsSuggestion(
    auth: Authenticator,
    skill: SkillResource,
    batch: { id: number },
    suggestion: { addUserIds?: string[]; removeUserIds?: string[] }
  ) {
    return SkillSuggestionFactory.create(auth, skill, {
      batchModelId: batch.id,
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
    const { workspace, auth, skill, batch } = await setupSkill();
    const added = await addMember(workspace);
    const removed = await addMember(workspace);
    expect((await skill.addEditors(auth, [removed])).isOk()).toBe(true);

    await editorsSuggestion(auth, skill, batch, {
      addUserIds: [added.sId],
      removeUserIds: [removed.sId],
    });

    const response = await approve(workspace, batch.sId);

    expect(response.status).toBe(200);
    expect((await response.json()).batch.state).toBe("approved");

    expect(await listEditorIds(auth, skill)).toEqual(
      [auth.getNonNullableUser().sId, added.sId].sort()
    );
  });

  it("does not save a skill version when only the editors change", async () => {
    const { workspace, auth, skill, batch } = await setupSkill();
    const added = await addMember(workspace);
    await editorsSuggestion(auth, skill, batch, {
      addUserIds: [added.sId],
    });
    const versionsBefore = (await skill.listVersions(auth)).length;

    const response = await approve(workspace, batch.sId);

    expect(response.status).toBe(200);
    expect((await skill.listVersions(auth)).length).toBe(versionsBefore);
  });

  it("rejects an added editor who left the workspace since the suggestion was recorded", async () => {
    const { workspace, auth, skill, batch } = await setupSkill();
    const departed = await addMember(workspace);
    const suggestion = await editorsSuggestion(auth, skill, batch, {
      addUserIds: [departed.sId],
    });
    await MembershipResource.revokeMembership({ user: departed, workspace });

    const response = await approve(workspace, batch.sId);

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
    const { workspace, auth, batch } = await setupSkill();
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
    await editorsSuggestion(auth, skill, batch, {
      addUserIds: [outsider.sId],
    });

    const response = await approve(workspace, batch.sId);

    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toContain(
      "do not have access"
    );
    expect(await listEditorIds(auth, skill)).toEqual([
      auth.getNonNullableUser().sId,
    ]);
  });

  it("rejects a batch that both adds and removes the same user", async () => {
    const { workspace, auth, skill, batch } = await setupSkill();
    const contested = await addMember(workspace);
    expect((await skill.addEditors(auth, [contested])).isOk()).toBe(true);

    await editorsSuggestion(auth, skill, batch, {
      addUserIds: [contested.sId],
    });
    await editorsSuggestion(auth, skill, batch, {
      removeUserIds: [contested.sId],
    });

    const response = await approve(workspace, batch.sId);

    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toContain(
      "both added and removed"
    );
    expect(await listEditorIds(auth, skill)).toEqual(
      [auth.getNonNullableUser().sId, contested.sId].sort()
    );
  });

  it("rejects a change that would leave the skill without an editor", async () => {
    const { workspace, auth, skill, batch } = await setupSkill();
    await editorsSuggestion(auth, skill, batch, {
      removeUserIds: [auth.getNonNullableUser().sId],
    });

    const response = await approve(workspace, batch.sId);

    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toContain(
      "without any editor"
    );
    expect(await listEditorIds(auth, skill)).toEqual([
      auth.getNonNullableUser().sId,
    ]);
  });
});

describe("approving skill suggestions (user_facing_description)", () => {
  async function descriptionSuggestion(
    auth: Authenticator,
    skill: SkillResource,
    batch: { id: number },
    userFacingDescription: string
  ) {
    return SkillSuggestionFactory.create(auth, skill, {
      batchModelId: batch.id,
      kind: "user_facing_description",
      source: "conversational",
      state: "pending",
      suggestion: { userFacingDescription },
    });
  }

  it("replaces the user-facing description and saves a version", async () => {
    const { workspace, auth, skill, batch } = await setupSkill();
    await descriptionSuggestion(
      auth,
      skill,
      batch,
      "Paste notes, get a summary."
    );
    const versionsBefore = (await skill.listVersions(auth)).length;

    const response = await approve(workspace, batch.sId);

    expect(response.status).toBe(200);
    expect((await response.json()).batch.state).toBe("approved");

    const updated = await SkillResource.fetchById(auth, skill.sId);
    expect(updated?.userFacingDescription).toBe("Paste notes, get a summary.");
    expect(updated?.agentFacingDescription).toBe(skill.agentFacingDescription);
    expect((await skill.listVersions(auth)).length).toBe(versionsBefore + 1);
  });
});

describe("approving skill suggestions (name)", () => {
  async function nameSuggestion(
    auth: Authenticator,
    skill: SkillResource,
    batch: { id: number },
    name: string
  ) {
    return SkillSuggestionFactory.create(auth, skill, {
      batchModelId: batch.id,
      kind: "name",
      source: "conversational",
      state: "pending",
      suggestion: { name },
    });
  }

  it("renames the skill and saves a version", async () => {
    const { workspace, auth, skill, batch } = await setupSkill();
    await nameSuggestion(auth, skill, batch, "Renamed Skill");
    const versionsBefore = (await skill.listVersions(auth)).length;

    const response = await approve(workspace, batch.sId);

    expect(response.status).toBe(200);
    expect((await response.json()).batch.state).toBe("approved");

    const updated = await SkillResource.fetchById(auth, skill.sId);
    expect(updated?.name).toBe("Renamed Skill");
    expect((await skill.listVersions(auth)).length).toBe(versionsBefore + 1);
  });

  it("returns 400 when the name was taken after the suggestion was recorded", async () => {
    const { workspace, auth, skill, batch } = await setupSkill();
    const suggestion = await nameSuggestion(auth, skill, batch, "Taken Later");
    await SkillFactory.create(auth, { name: "Taken Later" });

    const response = await approve(workspace, batch.sId);

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
});

describe("approving skill suggestions (availability)", () => {
  // `hasWorkspacePermission` is true for admins; the editor-without-publish case uses a plain user.
  async function availabilitySuggestion(
    auth: Authenticator,
    skill: SkillResource,
    batch: { id: number },
    availability: "editors" | "workspace_users" | "users_and_agents"
  ) {
    return SkillSuggestionFactory.create(auth, skill, {
      batchModelId: batch.id,
      kind: "availability",
      source: "conversational",
      state: "pending",
      suggestion: { availability },
    });
  }

  it("changes the availability and saves a version", async () => {
    const { workspace, auth, skill, batch } = await setupSkill({
      role: "admin",
    });
    await availabilitySuggestion(auth, skill, batch, "users_and_agents");
    const versionsBefore = (await skill.listVersions(auth)).length;

    const response = await approve(workspace, batch.sId);

    expect(response.status).toBe(200);
    expect((await response.json()).batch.state).toBe("approved");

    const updated = await SkillResource.fetchById(auth, skill.sId);
    expect(updated?.availability).toBe("users_and_agents");
    expect((await skill.listVersions(auth)).length).toBe(versionsBefore + 1);
  });

  it("does not save a version when the skill already has the suggested availability", async () => {
    const { workspace, auth, skill, batch } = await setupSkill({
      role: "admin",
    });
    await availabilitySuggestion(auth, skill, batch, "editors");
    const versionsBefore = (await skill.listVersions(auth)).length;

    const response = await approve(workspace, batch.sId);

    expect(response.status).toBe(200);
    expect((await response.json()).batch.state).toBe("approved");
    expect((await skill.listVersions(auth)).length).toBe(versionsBefore);
  });

  it("returns 403 when the approving editor lacks the publish capability", async () => {
    const { workspace, auth, skill, batch } = await setupSkill({
      role: "user",
    });
    // Recording an availability suggestion also requires `publish`: a workspace admin records it.
    const suggestion = await availabilitySuggestion(
      await Authenticator.internalAdminForWorkspace(workspace.sId),
      skill,
      batch,
      "workspace_users"
    );

    const response = await approve(workspace, batch.sId);

    expect(response.status).toBe(403);

    const reloaded = await SkillSuggestionResource.fetchById(
      auth,
      suggestion.sId
    );
    expect(reloaded?.state).toBe("pending");
    const updated = await SkillResource.fetchById(auth, skill.sId);
    expect(updated?.availability).toBe("editors");
  });
});

// An agent its creator edits, and an empty batch its suggestions go into.
async function setupAgent(options: { role?: MembershipRoleType } = {}) {
  const { workspace, auth, user } = await createPrivateApiMockRequest({
    role: options.role ?? "user",
  });
  await FeatureFlagFactory.basic(auth, "conversational_building");
  const agent = await AgentConfigurationFactory.createTestAgent(auth);
  const batch = await BatchSuggestionFactory.createEmpty(auth);

  return { workspace, auth, user, agent, batch };
}

describe("approving agent suggestions", () => {
  async function setupPendingAgent() {
    // Admins hold the create-agent capability the placeholder needs.
    const { workspace, auth } = await createPrivateApiMockRequest({
      role: "admin",
    });
    await FeatureFlagFactory.basic(auth, "conversational_building");
    const batch = await BatchSuggestionFactory.createEmpty(auth);
    const pending = await AgentResource.createPending(auth);
    if (pending.isErr()) {
      throw pending.error;
    }
    const agent = await getAgentConfiguration(auth, {
      agentId: pending.value.sId,
      variant: "light",
    });
    if (!agent) {
      throw new Error("Pending agent not found.");
    }
    return { workspace, auth, agent, batch };
  }

  it("turns the pending placeholder into an active hidden agent", async () => {
    const { workspace, auth, agent, batch } = await setupPendingAgent();
    await AgentSuggestionFactory.createCreate(auth, agent, {
      batchModelId: batch.id,
      suggestion: {
        name: "Incident Helper",
        description: "Helps triage incidents.",
        instructions: "<p>Collect <strong>impact</strong> and timeline.</p>",
      },
    });

    const response = await approve(workspace, batch.sId);

    expect(response.status).toBe(200);
    expect((await response.json()).batch.state).toBe("approved");

    const created = await getAgentConfiguration(auth, {
      agentId: agent.sId,
      variant: "full",
    });
    expect(created).toMatchObject({
      sId: agent.sId,
      status: "active",
      scope: "hidden",
      name: "Incident Helper",
      description: "Helps triage incidents.",
      instructions: "Collect **impact** and timeline.",
    });
    expect(created?.instructionsHtml).toContain("data-block-id");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 404 when the caller does not have the create-agent capability anymore", async () => {
    const { workspace, auth, agent, batch } = await setupPendingAgent();
    await AgentSuggestionFactory.createCreate(auth, agent, {
      batchModelId: batch.id,
    });

    // The capability was held when the placeholder was created; simulate it being revoked since.
    // A suggestion is only readable with the permissions its kind needs to be applied, and a batch
    // holding one the caller cannot read is not readable either.
    vi.spyOn(Authenticator.prototype, "hasWorkspacePermission").mockReturnValue(
      false
    );

    const response = await approve(workspace, batch.sId);

    expect(response.status).toBe(404);
    expect((await response.json()).error.type).toBe(
      "batch_suggestion_not_found"
    );

    const placeholder = await getAgentConfiguration(auth, {
      agentId: agent.sId,
      variant: "light",
    });
    expect(placeholder?.status).toBe("pending");
  });

  it("returns 400 and leaves the suggestion pending when the target is not a placeholder", async () => {
    const { workspace, auth, user, agent, batch } = await setupAgent();
    await grantWorkspacePermission(workspace, user, {
      grantType: "create",
      resourceType: "agent",
    });
    await auth.refresh();
    const suggestion = await AgentSuggestionFactory.createCreate(auth, agent, {
      batchModelId: batch.id,
    });

    const response = await approve(workspace, batch.sId);

    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toContain(
      "already been created"
    );
    const fetched = await AgentSuggestionResource.fetchById(
      auth,
      suggestion.sId
    );
    expect(fetched?.state).toBe("pending");
  });

  it("archives the agent for a delete suggestion", async () => {
    const { workspace, auth, agent, batch } = await setupAgent();
    await AgentSuggestionFactory.createDelete(auth, agent, {
      batchModelId: batch.id,
    });

    const response = await approve(workspace, batch.sId);

    expect(response.status).toBe(200);
    expect((await response.json()).batch.state).toBe("approved");

    const archived = await getAgentConfiguration(auth, {
      agentId: agent.sId,
      variant: "light",
    });
    expect(archived?.status).toBe("archived");
  });

  it("updates the agent's model for a model suggestion", async () => {
    const { workspace, auth, agent, batch } = await setupAgent();
    await AgentSuggestionFactory.createModel(auth, agent, {
      batchModelId: batch.id,
      suggestion: {
        modelId: "claude-haiku-4-5-20251001",
        reasoningEffort: "medium",
      },
    });

    const response = await approve(workspace, batch.sId);

    expect(response.status).toBe(200);
    expect((await response.json()).batch.state).toBe("approved");

    const updated = await getAgentConfiguration(auth, {
      agentId: agent.sId,
      variant: "light",
    });
    expect(updated?.model.modelId).toBe("claude-haiku-4-5-20251001");
    expect(updated?.model.reasoningEffort).toBe("medium");
  });

  it("returns 400 and leaves the suggestion pending when changing the model of a non-active agent", async () => {
    const { workspace, auth, agent, batch } = await setupPendingAgent();
    const suggestion = await AgentSuggestionFactory.createModel(auth, agent, {
      batchModelId: batch.id,
    });

    const response = await approve(workspace, batch.sId);

    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toContain(
      "cannot be updated"
    );
    const fetched = await AgentSuggestionResource.fetchById(
      auth,
      suggestion.sId
    );
    expect(fetched?.state).toBe("pending");
  });

  it("updates the agent's instructions for an instructions suggestion", async () => {
    const { workspace, auth, agent, batch } = await setupAgent();
    const instructionsHtml = convertMarkdownToBlockHtml("Be helpful.");
    const [, targetBlockId] =
      /data-block-id="((?!instructions-root)[^"]+)"/.exec(instructionsHtml) ??
      [];
    expect(targetBlockId).toBeTruthy();
    const updatedAgent = await AgentConfigurationFactory.updateTestAgent(
      auth,
      agent.sId,
      { instructionsHtml }
    );

    await AgentSuggestionFactory.createInstructions(auth, updatedAgent, {
      batchModelId: batch.id,
      suggestion: {
        targetBlockId: targetBlockId as string,
        type: "replace",
        content: "<p>Be extremely helpful.</p>",
      },
      source: "conversational",
    });

    const response = await approve(workspace, batch.sId);

    expect(response.status).toBe(200);
    expect((await response.json()).batch.state).toBe("approved");

    const updated = await getAgentConfiguration(auth, {
      agentId: agent.sId,
      variant: "full",
    });
    expect(updated?.instructionsHtml).toContain("Be extremely helpful.");
  });

  it("keeps the builder's instruction blocks when applying an instructions suggestion", async () => {
    const { workspace, auth, agent, batch } = await setupAgent();
    const instructionsHtml =
      '<div data-type="instructions-root" data-block-id="instructions-root">' +
      '<div data-block-id="c920ce2e" data-instruction-type="role" data-collapsed="false" data-type="instruction-block">' +
      '<p data-block-id="201659ea">Yu are a nice agent</p>' +
      "</div>" +
      '<div data-block-id="9411f1af" data-instruction-type="tools" data-collapsed="false" data-type="instruction-block">' +
      '<p data-block-id="7abb764c">Yu have access to many tools</p>' +
      "</div>" +
      "</div>";
    const updatedAgent = await AgentConfigurationFactory.updateTestAgent(
      auth,
      agent.sId,
      {
        instructions:
          "<role>\n\nYou are a nice agent\n\n</role>\n\n<tools>\n\nYou have access to many tools\n\n</tools>",
        instructionsHtml,
      }
    );

    await AgentSuggestionFactory.createInstructions(auth, updatedAgent, {
      batchModelId: batch.id,
      suggestion: {
        targetBlockId: "7abb764c",
        type: "replace",
        content: "<p>You have access to many tools.</p>",
      },
      source: "conversational",
    });

    const response = await approve(workspace, batch.sId);
    expect(response.status).toBe(200);

    const updated = await getAgentConfiguration(auth, {
      agentId: agent.sId,
      variant: "full",
    });
    const html = updated?.instructionsHtml ?? "";
    expect(html).toContain("You have access to many tools.");
    // Both sections survive, with their type and id, so the builder still shows them as blocks.
    expect(html).toContain(
      'data-block-id="c920ce2e" data-instruction-type="role"'
    );
    expect(html).toContain(
      'data-block-id="9411f1af" data-instruction-type="tools"'
    );
    // The markdown the model reads keeps the section tags.
    expect(updated?.instructions).toContain("<role>");
    expect(updated?.instructions).toContain("</role>");
    expect(updated?.instructions).toContain("<tools>");
    expect(updated?.instructions).toContain("</tools>");
  });

  it("returns 400 and leaves the suggestion pending when changing the instructions of a non-active agent", async () => {
    const { workspace, auth, agent, batch } = await setupPendingAgent();
    const suggestion = await AgentSuggestionFactory.createInstructions(
      auth,
      agent,
      {
        batchModelId: batch.id,
        source: "conversational",
      }
    );

    const response = await approve(workspace, batch.sId);

    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toContain(
      "cannot be updated"
    );
    const fetched = await AgentSuggestionResource.fetchById(
      auth,
      suggestion.sId
    );
    expect(fetched?.state).toBe("pending");
  });

  it("returns 400 and leaves the suggestion pending when deleting a non-active agent", async () => {
    const { workspace, auth, agent, batch } = await setupPendingAgent();
    const suggestion = await AgentSuggestionFactory.createDelete(auth, agent, {
      batchModelId: batch.id,
    });

    const response = await approve(workspace, batch.sId);

    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toContain(
      "Only an active agent"
    );
    const fetched = await AgentSuggestionResource.fetchById(
      auth,
      suggestion.sId
    );
    expect(fetched?.state).toBe("pending");
    const placeholder = await getAgentConfiguration(auth, {
      agentId: agent.sId,
      variant: "light",
    });
    expect(placeholder?.status).toBe("pending");
  });

  it("changes the agent's description for a description suggestion, leaving other fields alone", async () => {
    const { workspace, auth, agent, batch } = await setupAgent();
    await AgentSuggestionFactory.createDescription(auth, agent, {
      batchModelId: batch.id,
      suggestion: { description: "Handles incident triage end to end." },
    });

    const response = await approve(workspace, batch.sId);

    expect(response.status).toBe(200);
    expect((await response.json()).batch.state).toBe("approved");

    const updated = await getAgentConfiguration(auth, {
      agentId: agent.sId,
      variant: "full",
    });
    expect(updated).toMatchObject({
      sId: agent.sId,
      status: "active",
      name: agent.name,
      description: "Handles incident triage end to end.",
      scope: agent.scope,
      instructions: agent.instructions,
      version: agent.version + 1,
    });
  });

  it("applies a name and a description suggestion from the same batch as a single version", async () => {
    const { workspace, auth, agent, batch } = await setupAgent();
    await AgentSuggestionFactory.createName(auth, agent, {
      batchModelId: batch.id,
      suggestion: { name: "IncidentHelper" },
    });
    await AgentSuggestionFactory.createDescription(auth, agent, {
      batchModelId: batch.id,
      suggestion: { description: "Handles incident triage end to end." },
    });

    const response = await approve(workspace, batch.sId);

    expect(response.status).toBe(200);

    const updated = await getAgentConfiguration(auth, {
      agentId: agent.sId,
      variant: "full",
    });
    expect(updated).toMatchObject({
      sId: agent.sId,
      status: "active",
      name: "IncidentHelper",
      description: "Handles incident triage end to end.",
      scope: agent.scope,
      instructions: agent.instructions,
      // One batch, one version: both edits land in the same upgrade, not two.
      version: agent.version + 1,
    });
  });

  it("returns 400 for kinds that cannot be applied server-side", async () => {
    const { workspace, auth, agent, batch } = await setupAgent();
    await AgentSuggestionFactory.createKnowledge(auth, agent, {
      batchModelId: batch.id,
    });

    const response = await approve(workspace, batch.sId);

    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toContain(
      "cannot be applied server-side"
    );
  });
});
