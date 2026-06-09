import { Authenticator } from "@app/lib/auth";
import { SkillSuggestionResource } from "@app/lib/resources/skill_suggestion_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SkillSuggestionFactory } from "@app/tests/utils/SkillSuggestionFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import type { MembershipRoleType } from "@app/types/memberships";
import type { SkillSuggestionState } from "@app/types/suggestions/skill_suggestion";
import { describe, expect, it, vi } from "vitest";

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

async function setup(options: { role?: MembershipRoleType } = {}) {
  const role = options.role ?? "builder";
  const { workspace, auth } = await createPrivateApiMockRequest({ role });

  const skill = await SkillFactory.create(auth);
  // Refresh authenticator to pick up the skill's editor group membership.
  await auth.refresh();

  return { workspace, auth, skill };
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
      role: "builder",
    });

    const response = await patch(workspace, "non-existent-skill", {
      suggestionIds: ["test-id"],
      state: "approved",
    });

    expect(response.status).toBe(404);
    expect((await response.json()).error.type).toBe("skill_not_found");
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

  it("returns 403 for non-editor of the skill", async () => {
    const { workspace } = await setup();

    const skillOwner = await UserFactory.basic();
    await MembershipFactory.associate(workspace, skillOwner, {
      role: "builder",
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
    expect((await response.json()).error.message).toContain(
      "Self-improving skills are not enabled"
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
      role: "builder",
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
