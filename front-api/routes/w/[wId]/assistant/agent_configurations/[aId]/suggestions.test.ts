import { Authenticator } from "@app/lib/auth";
import { AgentSuggestionResource } from "@app/lib/resources/agent_suggestion_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { AgentSuggestionFactory } from "@app/tests/utils/AgentSuggestionFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import type { MembershipRoleType } from "@app/types/memberships";
import type { AgentSuggestionState } from "@app/types/suggestions/agent_suggestion";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

async function setupTest(options: { role?: MembershipRoleType } = {}) {
  const role = options.role ?? "builder";
  const { workspace, auth } = await createPrivateApiMockRequest({ role });
  const agent = await AgentConfigurationFactory.createTestAgent(auth);
  return { workspace, auth, agent };
}

function getSuggestions(
  workspace: { sId: string },
  aId: string,
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
    `/api/w/${workspace.sId}/assistant/agent_configurations/${aId}/suggestions${qs ? `?${qs}` : ""}`
  );
}

function patchSuggestions(
  workspace: { sId: string },
  aId: string,
  body: unknown
) {
  return honoApp.request(
    `/api/w/${workspace.sId}/assistant/agent_configurations/${aId}/suggestions`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

describe("PATCH /api/w/:wId/assistant/agent_configurations/:aId/suggestions", () => {
  it("returns 404 for non-existent agent", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      role: "builder",
    });

    const response = await patchSuggestions(workspace, "non-existent-agent", {
      suggestionIds: ["test-id"],
      state: "approved",
    });

    expect(response.status).toBe(404);
    expect((await response.json()).error.type).toBe(
      "agent_configuration_not_found"
    );
  });

  it("returns 400 for missing suggestionIds", async () => {
    const { workspace, agent } = await setupTest();

    const response = await patchSuggestions(workspace, agent.sId, {
      state: "approved",
    });

    expect(response.status).toBe(400);
    expect((await response.json()).error.type).toBe("invalid_request_error");
  });

  it("returns 400 for empty suggestionIds array", async () => {
    const { workspace, agent } = await setupTest();

    const response = await patchSuggestions(workspace, agent.sId, {
      suggestionIds: [],
      state: "approved",
    });

    expect(response.status).toBe(400);
    expect((await response.json()).error.type).toBe("invalid_request_error");
  });

  it("returns 400 for missing state", async () => {
    const { workspace, agent } = await setupTest();

    const response = await patchSuggestions(workspace, agent.sId, {
      suggestionIds: ["test-id"],
    });

    expect(response.status).toBe(400);
    expect((await response.json()).error.type).toBe("invalid_request_error");
  });

  it("returns 400 for invalid state value", async () => {
    const { workspace, agent } = await setupTest();

    const response = await patchSuggestions(workspace, agent.sId, {
      suggestionIds: ["test-id"],
      state: "invalid_state",
    });

    expect(response.status).toBe(400);
    expect((await response.json()).error.type).toBe("invalid_request_error");
  });

  it("returns 400 when trying to set state to pending", async () => {
    const { workspace, agent } = await setupTest();

    const response = await patchSuggestions(workspace, agent.sId, {
      suggestionIds: ["test-id"],
      state: "pending",
    });

    expect(response.status).toBe(400);
    expect((await response.json()).error.type).toBe("invalid_request_error");
  });

  it("returns 404 for non-existent suggestion", async () => {
    const { workspace, agent } = await setupTest();

    const response = await patchSuggestions(workspace, agent.sId, {
      suggestionIds: ["non-existent-id"],
      state: "approved",
    });

    expect(response.status).toBe(404);
    expect((await response.json()).error.type).toBe(
      "agent_suggestion_not_found"
    );
  });

  it("returns 400 when suggestion belongs to a different agent", async () => {
    const { workspace, auth, agent } = await setupTest();

    const otherAgent = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Other Agent",
    });

    const suggestion = await AgentSuggestionFactory.createInstructions(
      auth,
      otherAgent,
      { state: "pending" }
    );

    const response = await patchSuggestions(workspace, agent.sId, {
      suggestionIds: [suggestion.sId],
      state: "approved",
    });

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error.type).toBe("invalid_request_error");
    expect(data.error.message).toContain(
      "do not belong to the specified agent configuration"
    );
  });

  it.each<Exclude<AgentSuggestionState, "pending">>([
    "approved",
    "rejected",
    "outdated",
  ])("updates suggestion state to %s", async (newState) => {
    const { workspace, auth, agent } = await setupTest();

    const suggestion = await AgentSuggestionFactory.createInstructions(
      auth,
      agent,
      { state: "pending" }
    );

    const response = await patchSuggestions(workspace, agent.sId, {
      suggestionIds: [suggestion.sId],
      state: newState,
    });

    expect(response.status).toBe(200);

    const responseData = await response.json();
    expect(responseData.suggestions).toBeDefined();
    expect(responseData.suggestions).toHaveLength(1);
    expect(responseData.suggestions[0].state).toBe(newState);
    expect(responseData.suggestions[0].sId).toBe(suggestion.sId);

    const fetchedSuggestion = await AgentSuggestionResource.fetchById(
      auth,
      suggestion.sId
    );
    expect(fetchedSuggestion?.state).toBe(newState);
  });

  it("returns the full suggestion object with all fields", async () => {
    const { workspace, auth, agent } = await setupTest();

    const suggestion = await AgentSuggestionFactory.createInstructions(
      auth,
      agent,
      {
        suggestion: {
          content: "<p>new text</p>",
          targetBlockId: "block123",
          type: "replace",
        },
        analysis: "Test analysis",
        state: "pending",
      }
    );

    const response = await patchSuggestions(workspace, agent.sId, {
      suggestionIds: [suggestion.sId],
      state: "approved",
    });

    expect(response.status).toBe(200);

    const responseData = await response.json();
    expect(responseData.suggestions).toHaveLength(1);
    expect(responseData.suggestions[0]).toMatchObject({
      sId: suggestion.sId,
      state: "approved",
      kind: "instructions",
      analysis: "Test analysis",
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
    const { workspace, auth, agent } = await setupTest({ role: "admin" });

    const suggestion = await AgentSuggestionFactory.createInstructions(
      auth,
      agent,
      { state: "pending" }
    );

    const response = await patchSuggestions(workspace, agent.sId, {
      suggestionIds: [suggestion.sId],
      state: "approved",
    });

    expect(response.status).toBe(200);
    expect((await response.json()).suggestions[0].state).toBe("approved");
  });

  it("returns 403 for non-editor of the agent", async () => {
    const { workspace } = await setupTest();

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

    const response = await patchSuggestions(workspace, otherAgent.sId, {
      suggestionIds: [suggestion.sId],
      state: "approved",
    });

    expect(response.status).toBe(403);
    expect((await response.json()).error.type).toBe(
      "agent_group_permission_error"
    );
  });

  it("updates multiple suggestions in a single request", async () => {
    const { workspace, auth, agent } = await setupTest();

    const suggestion1 = await AgentSuggestionFactory.createInstructions(
      auth,
      agent,
      { state: "pending" }
    );
    const suggestion2 = await AgentSuggestionFactory.createInstructions(
      auth,
      agent,
      { state: "pending" }
    );

    const response = await patchSuggestions(workspace, agent.sId, {
      suggestionIds: [suggestion1.sId, suggestion2.sId],
      state: "approved",
    });

    expect(response.status).toBe(200);

    const responseData = await response.json();
    expect(responseData.suggestions).toHaveLength(2);
    expect(
      responseData.suggestions.every(
        (s: { state: string }) => s.state === "approved"
      )
    ).toBe(true);

    const fetched1 = await AgentSuggestionResource.fetchById(
      auth,
      suggestion1.sId
    );
    const fetched2 = await AgentSuggestionResource.fetchById(
      auth,
      suggestion2.sId
    );
    expect(fetched1?.state).toBe("approved");
    expect(fetched2?.state).toBe("approved");
  });
});

describe("GET /api/w/:wId/assistant/agent_configurations/:aId/suggestions", () => {
  it("returns agent's suggestions", async () => {
    const { workspace, auth, agent } = await setupTest();

    const suggestion = await AgentSuggestionFactory.createInstructions(
      auth,
      agent,
      { state: "pending" }
    );

    const response = await getSuggestions(workspace, agent.sId);

    expect(response.status).toBe(200);
    const responseData = await response.json();
    expect(responseData.suggestions).toHaveLength(1);
    expect(responseData.suggestions[0].sId).toBe(suggestion.sId);
  });

  it("should not return other agent's suggestions", async () => {
    const { workspace, auth, agent } = await setupTest();

    const agent2 = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Test Agent 2",
    });

    const suggestion1 = await AgentSuggestionFactory.createInstructions(
      auth,
      agent,
      { state: "pending" }
    );
    await AgentSuggestionFactory.createInstructions(auth, agent2, {
      state: "pending",
    });

    const response = await getSuggestions(workspace, agent.sId);

    expect(response.status).toBe(200);
    const responseData = await response.json();
    expect(responseData.suggestions).toHaveLength(1);
    expect(responseData.suggestions[0].sId).toBe(suggestion1.sId);
  });

  it("filters on kind and state correctly", async () => {
    const { workspace, auth, agent } = await setupTest();

    const matchingSuggestion = await AgentSuggestionFactory.createInstructions(
      auth,
      agent,
      { state: "pending" }
    );
    await AgentSuggestionFactory.createTools(auth, agent, {
      state: "pending",
    });
    await AgentSuggestionFactory.createInstructions(auth, agent, {
      state: "approved",
    });

    const response = await getSuggestions(workspace, agent.sId, {
      states: ["pending"],
      kind: "instructions",
    });

    expect(response.status).toBe(200);
    const responseData = await response.json();
    expect(responseData.suggestions).toHaveLength(1);
    expect(responseData.suggestions[0].sId).toBe(matchingSuggestion.sId);
    expect(responseData.suggestions[0].kind).toBe("instructions");
    expect(responseData.suggestions[0].state).toBe("pending");
  });

  it("limits the number of returned suggestions", async () => {
    const { workspace, auth, agent } = await setupTest();

    await AgentSuggestionFactory.createInstructions(auth, agent, {
      state: "pending",
    });
    await AgentSuggestionFactory.createTools(auth, agent, { state: "pending" });
    await AgentSuggestionFactory.createSkills(auth, agent, {
      state: "pending",
    });

    const response = await getSuggestions(workspace, agent.sId, {
      limit: "2",
    });

    expect(response.status).toBe(200);
    const responseData = await response.json();
    expect(responseData.suggestions).toHaveLength(2);
  });

  it("returns 403 for non-editor of the agent", async () => {
    const { workspace } = await setupTest();

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

    await AgentSuggestionFactory.createInstructions(ownerAuth, otherAgent, {
      state: "pending",
    });

    const response = await getSuggestions(workspace, otherAgent.sId);

    expect(response.status).toBe(403);
    expect((await response.json()).error.type).toBe(
      "agent_group_permission_error"
    );
  });
});
