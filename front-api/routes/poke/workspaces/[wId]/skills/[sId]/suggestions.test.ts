import { SkillSuggestionResource } from "@app/lib/resources/skill_suggestion_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SkillSuggestionFactory } from "@app/tests/utils/SkillSuggestionFactory";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function listSuggestions(workspace: { sId: string }, skillSId: string) {
  return honoApp.request(
    `/api/poke/workspaces/${workspace.sId}/skills/${skillSId}/suggestions`
  );
}

function deleteSuggestion(
  workspace: { sId: string },
  skillSId: string,
  query: Record<string, string> = {}
) {
  const search = new URLSearchParams(query).toString();
  return honoApp.request(
    `/api/poke/workspaces/${workspace.sId}/skills/${skillSId}/suggestions${
      search ? `?${search}` : ""
    }`,
    { method: "DELETE" }
  );
}

describe("GET /api/poke/workspaces/:wId/skills/:sId/suggestions", () => {
  it("returns 401 for non super users", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "GET",
      isSuperUser: false,
      role: "admin",
    });

    const response = await listSuggestions(workspace, "some-skill-id");

    expect(response.status).toBe(401);
  });

  it("returns suggestions for a given skill", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      method: "GET",
      isSuperUser: true,
      role: "admin",
    });

    const skill = await SkillFactory.create(auth);
    await SkillSuggestionFactory.create(auth, skill);

    const response = await listSuggestions(workspace, skill.sId);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.suggestions).toHaveLength(1);
    expect(data.suggestions[0].kind).toBe("edit");
  });

  it("returns empty array when skill has no suggestions", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      method: "GET",
      isSuperUser: true,
      role: "admin",
    });

    const skill = await SkillFactory.create(auth);

    const response = await listSuggestions(workspace, skill.sId);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.suggestions).toHaveLength(0);
  });
});

describe("DELETE /api/poke/workspaces/:wId/skills/:sId/suggestions", () => {
  it("returns 400 when suggestionSId query param is missing", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "DELETE",
      isSuperUser: true,
      role: "admin",
    });

    const response = await deleteSuggestion(workspace, "some-skill-id");

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error.type).toBe("invalid_request_error");
  });

  it("returns 404 when suggestion does not exist", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "DELETE",
      isSuperUser: true,
      role: "admin",
    });

    const response = await deleteSuggestion(workspace, "some-skill-id", {
      suggestionSId: "non-existent-suggestion-id",
    });

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error.type).toBe("skill_not_found");
  });

  it("deletes the suggestion and returns 204", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      method: "DELETE",
      isSuperUser: true,
      role: "admin",
    });

    const skill = await SkillFactory.create(auth);
    const suggestion = await SkillSuggestionFactory.create(auth, skill);

    const response = await deleteSuggestion(workspace, skill.sId, {
      suggestionSId: suggestion.sId,
    });

    expect(response.status).toBe(204);

    // Verify the suggestion is actually deleted.
    const deleted = await SkillSuggestionResource.fetchById(
      auth,
      suggestion.sId
    );
    expect(deleted).toBeNull();
  });
});
