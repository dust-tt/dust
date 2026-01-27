import type { RequestMethod } from "node-mocks-http";
import { describe, expect, it } from "vitest";

import { Authenticator } from "@app/lib/auth";
import { AgentSuggestionResource } from "@app/lib/resources/agent_suggestion_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { AgentSuggestionFactory } from "@app/tests/utils/AgentSuggestionFactory";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
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

  await FeatureFlagFactory.basic("agent_builder_copilot", workspace);

  return { req, res, workspace, authenticator };
}

describe("PATCH /api/w/[wId]/assistant/agents/suggestions", () => {
  it("returns 403 when agent_builder_copilot feature flag is not enabled", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      role: "builder",
      method: "PATCH",
    });

    req.query = { wId: workspace.sId };
    req.body = {
      suggestionId: "test-id",
      state: "approved",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData().error.type).toBe("app_auth_error");
  });

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
    for (const method of ["POST", "PUT", "DELETE"] as const) {
      const { req, res } = await setupTest({ method });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(405);
      expect(res._getJSONData().error.type).toBe("method_not_supported_error");
    }
  });

  it.each<Exclude<AgentSuggestionState, "pending">>([
    "approved",
    "rejected",
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

describe("GET /api/w/[wId]/assistant/agents/suggestions", () => {
  it("returns agent's suggestions", async () => {
    const { req, res, authenticator } = await setupTest({ method: "GET" });

    const agent =
      await AgentConfigurationFactory.createTestAgent(authenticator);
    const suggestion = await AgentSuggestionFactory.createInstructions(
      authenticator,
      agent,
      { state: "pending" }
    );

    req.query = { ...req.query, agentId: agent.sId };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const responseData = res._getJSONData();
    expect(responseData.suggestions).toHaveLength(1);
    expect(responseData.suggestions[0].sId).toBe(suggestion.sId);
  });

  it("should not return other agent's suggestions", async () => {
    const { req, res, authenticator } = await setupTest({ method: "GET" });

    const agent1 = await AgentConfigurationFactory.createTestAgent(
      authenticator,
      { name: "Test Agent 1" }
    );
    const agent2 = await AgentConfigurationFactory.createTestAgent(
      authenticator,
      { name: "Test Agent 2" }
    );

    const suggestion1 = await AgentSuggestionFactory.createInstructions(
      authenticator,
      agent1,
      { state: "pending" }
    );
    await AgentSuggestionFactory.createInstructions(authenticator, agent2, {
      state: "pending",
    });

    req.query = { ...req.query, agentId: agent1.sId };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const responseData = res._getJSONData();
    expect(responseData.suggestions).toHaveLength(1);
    expect(responseData.suggestions[0].sId).toBe(suggestion1.sId);
  });

  it("filters on kind and state correctly", async () => {
    const { req, res, authenticator } = await setupTest({ method: "GET" });

    const agent =
      await AgentConfigurationFactory.createTestAgent(authenticator);

    const matchingSuggestion = await AgentSuggestionFactory.createInstructions(
      authenticator,
      agent,
      {
        state: "pending",
      }
    );
    await AgentSuggestionFactory.createTools(authenticator, agent, {
      state: "pending",
    });
    await AgentSuggestionFactory.createInstructions(authenticator, agent, {
      state: "approved",
    });

    req.query = {
      ...req.query,
      agentId: agent.sId,
      states: ["pending"],
      kind: "instructions",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const responseData = res._getJSONData();
    expect(responseData.suggestions).toHaveLength(1);
    expect(responseData.suggestions[0].sId).toBe(matchingSuggestion.sId);
    expect(responseData.suggestions[0].kind).toBe("instructions");
    expect(responseData.suggestions[0].state).toBe("pending");
  });

  it("limits the number of returned suggestions", async () => {
    const { req, res, authenticator } = await setupTest({ method: "GET" });

    const agent =
      await AgentConfigurationFactory.createTestAgent(authenticator);

    await AgentSuggestionFactory.createInstructions(authenticator, agent, {
      state: "pending",
    });
    await AgentSuggestionFactory.createTools(authenticator, agent, {
      state: "pending",
    });
    await AgentSuggestionFactory.createSkills(authenticator, agent, {
      state: "pending",
    });

    req.query = { ...req.query, agentId: agent.sId, limit: "2" };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const responseData = res._getJSONData();
    expect(responseData.suggestions).toHaveLength(2);
  });

  it("returns empty list for non-editor of the agent", async () => {
    // Create workspace with user1 (who will make the request but is NOT the agent owner)
    const { req, res, workspace } = await setupTest({
      method: "GET",
    });

    // Create another user owning the agent and creating the suggestion
    const agentOwner = await UserFactory.basic();
    await MembershipFactory.associate(workspace, agentOwner, {
      role: "builder",
    });
    const ownerAuth = await Authenticator.fromUserIdAndWorkspaceId(
      agentOwner.sId,
      workspace.sId
    );
    const agent = await AgentConfigurationFactory.createTestAgent(ownerAuth);

    // Create suggestion for the agent (as owner)
    await AgentSuggestionFactory.createInstructions(ownerAuth, agent, {
      state: "pending",
    });

    // Make API request as not editor of the agent: should not see any result.
    req.query = { ...req.query, agentId: agent.sId };
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    const responseData = res._getJSONData();
    expect(responseData.suggestions).toHaveLength(0);
  });
});
