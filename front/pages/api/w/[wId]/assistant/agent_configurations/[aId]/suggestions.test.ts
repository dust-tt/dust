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
import type { RequestMethod } from "node-mocks-http";
import { describe, expect, it } from "vitest";

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

  await FeatureFlagFactory.basic("agent_builder_copilot", workspace);

  // Create a test agent for the user
  const agent = await AgentConfigurationFactory.createTestAgent(authenticator);

  req.query = { wId: workspace.sId, aId: agent.sId };

  return { req, res, workspace, authenticator, agent };
}

describe("PATCH /api/w/[wId]/assistant/agent_configurations/[aId]/suggestions", () => {
  it("returns 403 when agent_builder_copilot feature flag is not enabled", async () => {
    const { req, res, workspace, authenticator } =
      await createPrivateApiMockRequest({
        role: "builder",
        method: "PATCH",
      });

    const agent =
      await AgentConfigurationFactory.createTestAgent(authenticator);

    req.query = { wId: workspace.sId, aId: agent.sId };
    req.body = {
      suggestionIds: ["test-id"],
      state: "approved",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData().error.type).toBe("app_auth_error");
  });

  it("returns 404 for non-existent agent", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      role: "builder",
      method: "PATCH",
    });

    await FeatureFlagFactory.basic("agent_builder_copilot", workspace);

    req.query = { wId: workspace.sId, aId: "non-existent-agent" };
    req.body = {
      suggestionIds: ["test-id"],
      state: "approved",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData().error.type).toBe("agent_configuration_not_found");
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

  it("returns 400 when suggestion belongs to a different agent", async () => {
    const { req, res, authenticator, agent } = await setupTest();

    // Create another agent owned by the same user
    const otherAgent = await AgentConfigurationFactory.createTestAgent(
      authenticator,
      { name: "Other Agent" }
    );

    // Create a suggestion for the other agent
    const suggestion = await AgentSuggestionFactory.createInstructions(
      authenticator,
      otherAgent,
      { state: "pending" }
    );

    // Try to update the suggestion via the first agent's endpoint
    req.query = { ...req.query, aId: agent.sId };
    req.body = {
      suggestionIds: [suggestion.sId],
      state: "approved",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.type).toBe("invalid_request_error");
    expect(res._getJSONData().error.message).toContain(
      "do not belong to the specified agent configuration"
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

  it.each<Exclude<AgentSuggestionState, "pending">>([
    "approved",
    "rejected",
    "outdated",
  ])("updates suggestion state to %s", async (newState) => {
    const { req, res, authenticator, agent } = await setupTest();

    const suggestion = await AgentSuggestionFactory.createInstructions(
      authenticator,
      agent,
      { state: "pending" }
    );

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
    const fetchedSuggestion = await AgentSuggestionResource.fetchById(
      authenticator,
      suggestion.sId
    );
    expect(fetchedSuggestion?.state).toBe(newState);
  });

  it("returns the full suggestion object with all fields", async () => {
    const { req, res, authenticator, agent } = await setupTest();

    const suggestion = await AgentSuggestionFactory.createInstructions(
      authenticator,
      agent,
      {
        suggestion: {
          content: "<p>new text</p>",
          targetBlockId: "block123",
          type: "replace",
        },
        analysis: "Test analysis",
        state: "pending",
        source: "copilot",
      }
    );

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
      kind: "instructions",
      analysis: "Test analysis",
      source: "copilot",
      suggestion: {
        content: "<p>new text</p>",
        targetBlockId: "block123",
        type: "replace",
      },
    });
    expect(responseData.suggestions[0].createdAt).toBeDefined();
    expect(responseData.suggestions[0].updatedAt).toBeDefined();
  });

  it("admin can update suggestions in their workspace", async () => {
    const { req, res, authenticator, agent } = await setupTest({
      role: "admin",
    });

    const suggestion = await AgentSuggestionFactory.createInstructions(
      authenticator,
      agent,
      { state: "pending" }
    );

    req.body = {
      suggestionIds: [suggestion.sId],
      state: "approved",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData().suggestions[0].state).toBe("approved");
  });

  it("returns 403 for non-editor of the agent", async () => {
    const { req, res, workspace } = await setupTest();

    // Create another user owning a different agent
    const agentOwner = await UserFactory.basic();
    await MembershipFactory.associate(workspace, agentOwner, {
      role: "builder",
    });
    const ownerAuth = await Authenticator.fromUserIdAndWorkspaceId(
      agentOwner.sId,
      workspace.sId
    );
    const otherAgent = await AgentConfigurationFactory.createTestAgent(
      ownerAuth,
      { name: "Other Agent" }
    );

    const suggestion = await AgentSuggestionFactory.createInstructions(
      ownerAuth,
      otherAgent,
      { state: "pending" }
    );

    // Update request to target the other agent
    req.query = { ...req.query, aId: otherAgent.sId };
    req.body = {
      suggestionIds: [suggestion.sId],
      state: "approved",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData().error.type).toBe("agent_group_permission_error");
  });

  it("updates multiple suggestions in a single request", async () => {
    const { req, res, authenticator, agent } = await setupTest();

    const suggestion1 = await AgentSuggestionFactory.createInstructions(
      authenticator,
      agent,
      { state: "pending" }
    );
    const suggestion2 = await AgentSuggestionFactory.createInstructions(
      authenticator,
      agent,
      { state: "pending" }
    );

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
    const fetched1 = await AgentSuggestionResource.fetchById(
      authenticator,
      suggestion1.sId
    );
    const fetched2 = await AgentSuggestionResource.fetchById(
      authenticator,
      suggestion2.sId
    );
    expect(fetched1?.state).toBe("approved");
    expect(fetched2?.state).toBe("approved");
  });
});

describe("GET /api/w/[wId]/assistant/agent_configurations/[aId]/suggestions", () => {
  it("returns agent's suggestions", async () => {
    const { req, res, authenticator, agent } = await setupTest({
      method: "GET",
    });

    const suggestion = await AgentSuggestionFactory.createInstructions(
      authenticator,
      agent,
      { state: "pending" }
    );

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const responseData = res._getJSONData();
    expect(responseData.suggestions).toHaveLength(1);
    expect(responseData.suggestions[0].sId).toBe(suggestion.sId);
  });

  it("should not return other agent's suggestions", async () => {
    const { req, res, authenticator, agent } = await setupTest({
      method: "GET",
    });

    const agent2 = await AgentConfigurationFactory.createTestAgent(
      authenticator,
      { name: "Test Agent 2" }
    );

    const suggestion1 = await AgentSuggestionFactory.createInstructions(
      authenticator,
      agent,
      { state: "pending" }
    );
    await AgentSuggestionFactory.createInstructions(authenticator, agent2, {
      state: "pending",
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const responseData = res._getJSONData();
    expect(responseData.suggestions).toHaveLength(1);
    expect(responseData.suggestions[0].sId).toBe(suggestion1.sId);
  });

  it("filters on kind and state correctly", async () => {
    const { req, res, authenticator, agent } = await setupTest({
      method: "GET",
    });

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
    const { req, res, authenticator, agent } = await setupTest({
      method: "GET",
    });

    await AgentSuggestionFactory.createInstructions(authenticator, agent, {
      state: "pending",
    });
    await AgentSuggestionFactory.createTools(authenticator, agent, {
      state: "pending",
    });
    await AgentSuggestionFactory.createSkills(authenticator, agent, {
      state: "pending",
    });

    req.query = { ...req.query, limit: "2" };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const responseData = res._getJSONData();
    expect(responseData.suggestions).toHaveLength(2);
  });

  it("returns 403 for non-editor of the agent", async () => {
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
    const otherAgent = await AgentConfigurationFactory.createTestAgent(
      ownerAuth,
      { name: "Other Agent" }
    );

    // Create suggestion for the agent (as owner)
    await AgentSuggestionFactory.createInstructions(ownerAuth, otherAgent, {
      state: "pending",
    });

    // Make API request as non-editor of the agent
    req.query = { ...req.query, aId: otherAgent.sId };
    await handler(req, res);
    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData().error.type).toBe("agent_group_permission_error");
  });
});
