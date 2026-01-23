import type { RequestMethod } from "node-mocks-http";
import { describe, expect, it } from "vitest";

import { AgentSuggestionResource } from "@app/lib/resources/agent_suggestion_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { AgentSuggestionFactory } from "@app/tests/utils/AgentSuggestionFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import type { MembershipRoleType } from "@app/types/memberships";
import type { AgentSuggestionState } from "@app/types/suggestions/agent_suggestion";

import handler from "./suggestions";

async function setupTest(
  options: { method?: RequestMethod; role?: MembershipRoleType } = {}
) {
  const method = options.method ?? "PATCH";
  const role = options.role ?? "builder";

  const { req, res, workspace, authenticator } =
    await createPrivateApiMockRequest({
      role,
      method,
    });

  req.query = { wId: workspace.sId };

  return { req, res, workspace, authenticator };
}

describe("PATCH /api/w/[wId]/assistant/agents/suggestions", () => {
  it("returns 400 for missing suggestionId", async () => {
    const { req, res } = await setupTest();

    req.body = {
      state: "approved",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.type).toBe("invalid_request_error");
  });

  it("returns 400 for missing state", async () => {
    const { req, res } = await setupTest();

    req.body = {
      suggestionId: "test-id",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.type).toBe("invalid_request_error");
  });

  it("returns 400 for invalid state value", async () => {
    const { req, res } = await setupTest();

    req.body = {
      suggestionId: "test-id",
      state: "invalid_state",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.type).toBe("invalid_request_error");
  });

  it("returns 400 when trying to set state to pending", async () => {
    const { req, res } = await setupTest();

    req.body = {
      suggestionId: "test-id",
      state: "pending",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.type).toBe("invalid_request_error");
  });

  it("returns 404 for non-existent suggestion", async () => {
    const { req, res } = await setupTest();

    req.body = {
      suggestionId: "non-existent-id",
      state: "approved",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData().error.type).toBe("agent_suggestion_not_found");
  });

  it("returns 405 for unsupported methods", async () => {
    for (const method of ["GET", "POST", "PUT", "DELETE"] as const) {
      const { req, res } = await setupTest({ method });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(405);
      expect(res._getJSONData().error.type).toBe("method_not_supported_error");
    }
  });

  it.each<Exclude<AgentSuggestionState, "pending">>([
    "approved",
    "declined",
    "outdated",
  ])("updates suggestion state to %s", async (newState) => {
    const { req, res, authenticator } = await setupTest();

    const agent =
      await AgentConfigurationFactory.createTestAgent(authenticator);
    const suggestion = await AgentSuggestionFactory.createInstructions(
      authenticator,
      agent,
      { state: "pending" }
    );

    req.body = {
      suggestionId: suggestion.sId,
      state: newState,
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);

    const responseData = res._getJSONData();
    expect(responseData.suggestion).toBeDefined();
    expect(responseData.suggestion.state).toBe(newState);
    expect(responseData.suggestion.sId).toBe(suggestion.sId);

    // Verify the state was persisted.
    const fetchedSuggestion = await AgentSuggestionResource.fetchById(
      authenticator,
      suggestion.sId
    );
    expect(fetchedSuggestion?.state).toBe(newState);
  });

  it("returns the full suggestion object with all fields", async () => {
    const { req, res, authenticator } = await setupTest();

    const agent =
      await AgentConfigurationFactory.createTestAgent(authenticator);
    const suggestion = await AgentSuggestionFactory.createInstructions(
      authenticator,
      agent,
      {
        suggestion: { oldString: "old text", newString: "new text" },
        analysis: "Test analysis",
        state: "pending",
        source: "copilot",
      }
    );

    req.body = {
      suggestionId: suggestion.sId,
      state: "approved",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);

    const responseData = res._getJSONData();
    expect(responseData.suggestion).toMatchObject({
      sId: suggestion.sId,
      state: "approved",
      kind: "instructions",
      analysis: "Test analysis",
      source: "copilot",
      suggestion: { oldString: "old text", newString: "new text" },
    });
    expect(responseData.suggestion.createdAt).toBeDefined();
    expect(responseData.suggestion.updatedAt).toBeDefined();
  });

  it("admin can update suggestions in their workspace", async () => {
    const { req, res, authenticator } = await setupTest({ role: "admin" });

    const agent =
      await AgentConfigurationFactory.createTestAgent(authenticator);
    const suggestion = await AgentSuggestionFactory.createInstructions(
      authenticator,
      agent,
      { state: "pending" }
    );

    req.body = {
      suggestionId: suggestion.sId,
      state: "approved",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData().suggestion.state).toBe("approved");
  });
});
