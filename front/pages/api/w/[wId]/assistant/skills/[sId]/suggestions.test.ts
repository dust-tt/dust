import { Authenticator } from "@app/lib/auth";
import { SkillSuggestionResource } from "@app/lib/resources/skill_suggestion_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SkillSuggestionFactory } from "@app/tests/utils/SkillSuggestionFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import type { MembershipRoleType } from "@app/types/memberships";
import type { SkillSuggestionState } from "@app/types/suggestions/skill_suggestion";
import type { RequestMethod } from "node-mocks-http";
import { describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/reinforced_agent/workspace_check", () => ({
  hasReinforcementEnabled: vi.fn().mockResolvedValue(true),
}));

import handler from "./suggestions";

async function setupTest(
  options: { method?: RequestMethod; role?: MembershipRoleType } = {}
) {
  const method = options.method ?? "PATCH";
  const role = options.role ?? "builder";

  const { req, res, workspace, auth } = await createPrivateApiMockRequest({
    role,
    method,
  });

  const skill = await SkillFactory.create(auth);

  // Refresh authenticator to pick up the skill's editor group membership.
  await auth.refresh();

  req.query = { wId: workspace.sId, sId: skill.sId };

  return { req, res, workspace, auth, skill };
}

describe("PATCH /api/w/[wId]/assistant/skills/[sId]/suggestions", () => {
  it("returns 404 for non-existent skill", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      role: "builder",
      method: "PATCH",
    });

    req.query = { wId: workspace.sId, sId: "non-existent-skill" };
    req.body = {
      suggestionIds: ["test-id"],
      state: "approved",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData().error.type).toBe("skill_not_found");
  });

  it("returns 400 for missing suggestionIds", async () => {
    const { req, res } = await setupTest();

    req.body = {
      state: "approved",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.type).toBe("invalid_request_error");
  });

  it("returns 400 for empty suggestionIds array", async () => {
    const { req, res } = await setupTest();

    req.body = {
      suggestionIds: [],
      state: "approved",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.type).toBe("invalid_request_error");
  });

  it("returns 400 for missing state", async () => {
    const { req, res } = await setupTest();

    req.body = {
      suggestionIds: ["test-id"],
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.type).toBe("invalid_request_error");
  });

  it("returns 400 for invalid state value", async () => {
    const { req, res } = await setupTest();

    req.body = {
      suggestionIds: ["test-id"],
      state: "invalid_state",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.type).toBe("invalid_request_error");
  });

  it("returns 400 when trying to set state to pending", async () => {
    const { req, res } = await setupTest();

    req.body = {
      suggestionIds: ["test-id"],
      state: "pending",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.type).toBe("invalid_request_error");
  });

  it("returns 404 for non-existent suggestion", async () => {
    const { req, res } = await setupTest();

    req.body = {
      suggestionIds: ["non-existent-id"],
      state: "approved",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData().error.type).toBe("agent_suggestion_not_found");
  });

  it("returns 400 when suggestion belongs to a different skill", async () => {
    const { req, res, auth, skill } = await setupTest();

    // Create another skill owned by the same user.
    const otherSkill = await SkillFactory.create(auth, {
      name: "Other Skill",
    });
    await auth.refresh();

    // Create a suggestion for the other skill.
    const suggestion = await SkillSuggestionFactory.create(auth, otherSkill);

    // Try to update the suggestion via the first skill's endpoint.
    req.query = { ...req.query, sId: skill.sId };
    req.body = {
      suggestionIds: [suggestion.sId],
      state: "approved",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.type).toBe("invalid_request_error");
    expect(res._getJSONData().error.message).toContain(
      "do not belong to the specified skill configuration"
    );
  });

  it("returns 405 for unsupported methods", async () => {
    for (const method of ["POST", "PUT", "DELETE"] as const) {
      const { req, res } = await setupTest({ method });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(405);
      expect(res._getJSONData().error.type).toBe("method_not_supported_error");
    }
  });

  it.each<Exclude<SkillSuggestionState, "pending">>([
    "approved",
    "rejected",
    "outdated",
  ])("updates suggestion state to %s", async (newState) => {
    const { req, res, auth, skill } = await setupTest();

    const suggestion = await SkillSuggestionFactory.create(auth, skill, {
      state: "pending",
    });

    req.body = {
      suggestionIds: [suggestion.sId],
      state: newState,
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);

    const responseData = res._getJSONData();
    expect(responseData.suggestions).toBeDefined();
    expect(responseData.suggestions).toHaveLength(1);
    expect(responseData.suggestions[0].state).toBe(newState);
    expect(responseData.suggestions[0].sId).toBe(suggestion.sId);

    // Verify the state was persisted.
    const fetchedSuggestion = await SkillSuggestionResource.fetchById(
      auth,
      suggestion.sId
    );
    expect(fetchedSuggestion?.state).toBe(newState);
  });

  it("returns the full suggestion object with all fields", async () => {
    const { req, res, auth, skill } = await setupTest();

    const suggestion = await SkillSuggestionFactory.create(auth, skill, {
      suggestion: {
        instructionEdits: [
          {
            old_string: "original text",
            new_string: "updated instructions",
            expected_occurrences: 1,
          },
        ],
      },
      analysis: "Test analysis",
      state: "pending",
      source: "reinforcement",
    });

    req.body = {
      suggestionIds: [suggestion.sId],
      state: "approved",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);

    const responseData = res._getJSONData();
    expect(responseData.suggestions).toHaveLength(1);
    expect(responseData.suggestions[0]).toMatchObject({
      sId: suggestion.sId,
      state: "approved",
      kind: "edit",
      analysis: "Test analysis",
      source: "reinforcement",
      suggestion: {
        instructionEdits: [
          {
            old_string: "original text",
            new_string: "updated instructions",
            expected_occurrences: 1,
          },
        ],
      },
    });
    expect(responseData.suggestions[0].createdAt).toBeDefined();
    expect(responseData.suggestions[0].updatedAt).toBeDefined();
  });

  it("admin can update suggestions in their workspace", async () => {
    const { req, res, auth, skill } = await setupTest({
      role: "admin",
    });

    const suggestion = await SkillSuggestionFactory.create(auth, skill, {
      state: "pending",
    });

    req.body = {
      suggestionIds: [suggestion.sId],
      state: "approved",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData().suggestions[0].state).toBe("approved");
  });

  it("returns 403 for non-editor of the skill", async () => {
    const { req, res, workspace } = await setupTest();

    // Create another user owning a different skill.
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

    // Update request to target the other skill.
    req.query = { ...req.query, sId: otherSkill.sId };
    req.body = {
      suggestionIds: [suggestion.sId],
      state: "approved",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData().error.type).toBe("agent_group_permission_error");
  });

  it("updates multiple suggestions in a single request", async () => {
    const { req, res, auth, skill } = await setupTest();

    const suggestion1 = await SkillSuggestionFactory.create(auth, skill, {
      state: "pending",
    });
    const suggestion2 = await SkillSuggestionFactory.create(auth, skill, {
      state: "pending",
    });

    req.body = {
      suggestionIds: [suggestion1.sId, suggestion2.sId],
      state: "approved",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);

    const responseData = res._getJSONData();
    expect(responseData.suggestions).toHaveLength(2);
    expect(
      responseData.suggestions.every(
        (s: { state: string }) => s.state === "approved"
      )
    ).toBe(true);

    // Verify both were persisted.
    const fetched1 = await SkillSuggestionResource.fetchById(
      auth,
      suggestion1.sId
    );
    const fetched2 = await SkillSuggestionResource.fetchById(
      auth,
      suggestion2.sId
    );
    expect(fetched1?.state).toBe("approved");
    expect(fetched2?.state).toBe("approved");
  });

  it("returns 400 when reinforcement is disabled", async () => {
    const { hasReinforcementEnabled } = await import(
      "@app/lib/reinforced_agent/workspace_check"
    );
    vi.mocked(hasReinforcementEnabled).mockResolvedValueOnce(false);

    const { req, res, auth, skill } = await setupTest();

    const suggestion = await SkillSuggestionFactory.create(auth, skill, {
      state: "pending",
    });

    req.body = {
      suggestionIds: [suggestion.sId],
      state: "approved",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.message).toContain(
      "Reinforcement is not enabled"
    );
  });
});

describe("GET /api/w/[wId]/assistant/skills/[sId]/suggestions", () => {
  it("returns skill's suggestions", async () => {
    const { req, res, auth, skill } = await setupTest({
      method: "GET",
    });

    const suggestion = await SkillSuggestionFactory.create(auth, skill, {
      state: "pending",
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const responseData = res._getJSONData();
    expect(responseData.suggestions).toHaveLength(1);
    expect(responseData.suggestions[0].sId).toBe(suggestion.sId);
  });

  it("should not return other skill's suggestions", async () => {
    const { req, res, auth, skill } = await setupTest({
      method: "GET",
    });

    const skill2 = await SkillFactory.create(auth, {
      name: "Test Skill 2",
    });
    await auth.refresh();

    const suggestion1 = await SkillSuggestionFactory.create(auth, skill, {
      state: "pending",
    });
    await SkillSuggestionFactory.create(auth, skill2, {
      state: "pending",
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const responseData = res._getJSONData();
    expect(responseData.suggestions).toHaveLength(1);
    expect(responseData.suggestions[0].sId).toBe(suggestion1.sId);
  });

  it("filters on kind and state correctly", async () => {
    const { req, res, auth, skill } = await setupTest({
      method: "GET",
    });

    const matchingSuggestion = await SkillSuggestionFactory.create(
      auth,
      skill,
      {
        state: "pending",
        kind: "edit",
      }
    );
    await SkillSuggestionFactory.create(auth, skill, {
      state: "approved",
      kind: "edit",
    });

    req.query = {
      ...req.query,
      states: ["pending"],
      kind: "edit",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const responseData = res._getJSONData();
    expect(responseData.suggestions).toHaveLength(1);
    expect(responseData.suggestions[0].sId).toBe(matchingSuggestion.sId);
    expect(responseData.suggestions[0].kind).toBe("edit");
    expect(responseData.suggestions[0].state).toBe("pending");
  });

  it("limits the number of returned suggestions", async () => {
    const { req, res, auth, skill } = await setupTest({
      method: "GET",
    });

    await SkillSuggestionFactory.create(auth, skill, { state: "pending" });
    await SkillSuggestionFactory.create(auth, skill, { state: "pending" });
    await SkillSuggestionFactory.create(auth, skill, { state: "pending" });

    req.query = { ...req.query, limit: "2" };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const responseData = res._getJSONData();
    expect(responseData.suggestions).toHaveLength(2);
  });

  it("returns 403 for non-editor of the skill", async () => {
    const { req, res, workspace } = await setupTest({
      method: "GET",
    });

    // Create another user owning the skill and creating the suggestion.
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

    // Create suggestion for the skill (as owner).
    await SkillSuggestionFactory.create(ownerAuth, otherSkill, {
      state: "pending",
    });

    // Make API request as non-editor of the skill.
    req.query = { ...req.query, sId: otherSkill.sId };
    await handler(req, res);
    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData().error.type).toBe("agent_group_permission_error");
  });

  it("returns empty suggestions when reinforcement is disabled", async () => {
    const { hasReinforcementEnabled } = await import(
      "@app/lib/reinforced_agent/workspace_check"
    );
    vi.mocked(hasReinforcementEnabled).mockResolvedValueOnce(false);

    const { req, res, auth, skill } = await setupTest({ method: "GET" });

    await SkillSuggestionFactory.create(auth, skill, { state: "pending" });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData().suggestions).toHaveLength(0);
  });
});
