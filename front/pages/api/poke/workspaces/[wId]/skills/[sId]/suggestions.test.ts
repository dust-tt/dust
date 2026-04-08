import { SkillSuggestionResource } from "@app/lib/resources/skill_suggestion_resource";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SkillSuggestionFactory } from "@app/tests/utils/SkillSuggestionFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { describe, expect, it } from "vitest";

import handler from "./suggestions";

describe("GET /api/poke/workspaces/[wId]/skills/[sId]/suggestions", () => {
  it("returns 404 for non super users", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "GET",
      isSuperUser: false,
      role: "admin",
    });

    req.query = { wId: workspace.sId, sId: "some-skill-id" };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(401);
  });

  it("returns suggestions for a given skill", async () => {
    const { req, res, workspace, auth } = await createPrivateApiMockRequest({
      method: "GET",
      isSuperUser: true,
      role: "admin",
    });

    const skill = await SkillFactory.create(auth);
    await SkillSuggestionFactory.create(auth, skill);

    req.query = { wId: workspace.sId, sId: skill.sId };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.suggestions).toHaveLength(1);
    expect(data.suggestions[0].kind).toBe("edit_instructions");
  });

  it("returns empty array when skill has no suggestions", async () => {
    const { req, res, workspace, auth } = await createPrivateApiMockRequest({
      method: "GET",
      isSuperUser: true,
      role: "admin",
    });

    const skill = await SkillFactory.create(auth);

    req.query = { wId: workspace.sId, sId: skill.sId };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.suggestions).toHaveLength(0);
  });
});

describe("DELETE /api/poke/workspaces/[wId]/skills/[sId]/suggestions", () => {
  it("returns 400 when suggestionSId query param is missing", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "DELETE",
      isSuperUser: true,
      role: "admin",
    });

    req.query = { wId: workspace.sId, sId: "some-skill-id" };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.type).toBe("invalid_request_error");
  });

  it("returns 404 when suggestion does not exist", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "DELETE",
      isSuperUser: true,
      role: "admin",
    });

    req.query = {
      wId: workspace.sId,
      sId: "some-skill-id",
      suggestionSId: "non-existent-suggestion-id",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData().error.type).toBe("skill_not_found");
  });

  it("deletes the suggestion and returns 204", async () => {
    const { req, res, workspace, auth } = await createPrivateApiMockRequest({
      method: "DELETE",
      isSuperUser: true,
      role: "admin",
    });

    const skill = await SkillFactory.create(auth);
    const suggestion = await SkillSuggestionFactory.create(auth, skill);

    req.query = {
      wId: workspace.sId,
      sId: skill.sId,
      suggestionSId: suggestion.sId,
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(204);

    // Verify the suggestion is actually deleted.
    const deleted = await SkillSuggestionResource.fetchById(
      auth,
      suggestion.sId
    );
    expect(deleted).toBeNull();
  });
});
