import { Authenticator } from "@app/lib/auth";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { AgentSuggestionResource } from "@app/lib/resources/agent_suggestion_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { AgentMCPServerConfigurationFactory } from "@app/tests/utils/AgentMCPServerConfigurationFactory";
import { setupAgentOwner } from "@app/tests/utils/AgentOwnerFactory";
import { AgentSuggestionFactory } from "@app/tests/utils/AgentSuggestionFactory";
import { BatchSuggestionFactory } from "@app/tests/utils/BatchSuggestionFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { setupSkillInstructionsMarkdownPipeline } from "@app/tests/utils/skill_instructions_html";
import { UserFactory } from "@app/tests/utils/UserFactory";
import type { MembershipRoleType } from "@app/types/memberships";
import type { AgentSuggestionState } from "@app/types/suggestions/agent_suggestion";
import { honoApp } from "@front-api/app";
import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  setupSkillInstructionsMarkdownPipeline();
});

async function setupTest(options: { role?: MembershipRoleType } = {}) {
  const role = options.role ?? "user";
  const { workspace, auth, user, globalSpace } =
    await createPrivateApiMockRequest({
      role,
    });
  const agent = await AgentConfigurationFactory.createTestAgent(auth);
  return { workspace, auth, user, agent, globalSpace };
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
      role: "user",
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

  it("returns 400 for a conversational suggestion", async () => {
    const { workspace, auth, agent } = await setupTest();
    const batch = await BatchSuggestionFactory.createEmpty(auth);
    const suggestion = await AgentSuggestionFactory.createInstructions(
      auth,
      agent,
      { source: "conversational", state: "pending", batchModelId: batch.id }
    );

    const response = await patchSuggestions(workspace, agent.sId, {
      suggestionIds: [suggestion.sId],
      state: "rejected",
    });

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error.type).toBe("invalid_request_error");
    expect(data.error.message).toContain(
      "Only Sidekick suggestions can be reviewed here"
    );

    const fetchedSuggestion = await AgentSuggestionResource.fetchById(
      auth,
      suggestion.sId
    );
    expect(fetchedSuggestion?.state).toBe("pending");
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

  it("returns 403 for a non-editor admin", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "admin" });
    const { agentOwnerAuth } = await setupAgentOwner(workspace, "user");
    const agent = await AgentConfigurationFactory.createTestAgent(
      agentOwnerAuth,
      { scope: "hidden" }
    );

    const response = await patchSuggestions(workspace, agent.sId, {
      suggestionIds: ["sug_does_not_matter"],
      state: "approved",
    });

    expect(response.status).toBe(403);
  });

  it("returns 403 for non-editor of the agent", async () => {
    const { workspace } = await setupTest();

    const agentOwner = await UserFactory.basic();
    await MembershipFactory.associate(workspace, agentOwner, {
      role: "user",
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

describe("PATCH /api/w/:wId/assistant/agent_configurations/:aId/suggestions - additions", () => {
  async function expectApprovalRefused(
    workspace: { sId: string },
    auth: Authenticator,
    agent: { sId: string },
    suggestion: AgentSuggestionResource
  ) {
    const response = await patchSuggestions(workspace, agent.sId, {
      suggestionIds: [suggestion.sId],
      state: "approved",
    });

    expect(response.status).toBe(400);
    expect((await response.json()).error.type).toBe("invalid_request_error");
    const fetched = await AgentSuggestionResource.fetchById(
      auth,
      suggestion.sId
    );
    expect(fetched?.state).toBe("pending");
  }

  it("approves adding a skill that is still active", async () => {
    const { workspace, auth, agent } = await setupTest();
    const skill = await SkillFactory.create(auth);
    const suggestion = await AgentSuggestionFactory.createSkills(auth, agent, {
      suggestion: { action: "add", skillId: skill.sId },
    });

    const response = await patchSuggestions(workspace, agent.sId, {
      suggestionIds: [suggestion.sId],
      state: "approved",
    });

    expect(response.status).toBe(200);
  });

  it("refuses to approve adding a skill archived since it was suggested", async () => {
    const { workspace, auth, agent } = await setupTest();
    const skill = await SkillFactory.create(auth);
    const suggestion = await AgentSuggestionFactory.createSkills(auth, agent, {
      suggestion: { action: "add", skillId: skill.sId },
    });
    await skill.archive(auth);

    await expectApprovalRefused(workspace, auth, agent, suggestion);
  });

  it("still rejects a suggestion adding a skill archived since it was suggested", async () => {
    const { workspace, auth, agent } = await setupTest();
    const skill = await SkillFactory.create(auth);
    const suggestion = await AgentSuggestionFactory.createSkills(auth, agent, {
      suggestion: { action: "add", skillId: skill.sId },
    });
    await skill.archive(auth);

    const response = await patchSuggestions(workspace, agent.sId, {
      suggestionIds: [suggestion.sId],
      state: "rejected",
    });

    expect(response.status).toBe(200);
  });

  it("refuses to approve adding a sub-agent archived since it was suggested", async () => {
    const { workspace, auth, agent } = await setupTest();
    const childAgent = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Child Agent",
    });
    const suggestion = await AgentSuggestionFactory.createSubAgent(
      auth,
      agent,
      {
        suggestion: {
          action: "add",
          toolId: "run_agent",
          childAgentId: childAgent.sId,
        },
      }
    );
    const childAgentResource = await AgentResource.fetchById(
      auth,
      childAgent.sId
    );
    expect(childAgentResource).not.toBeNull();
    await childAgentResource?.archive(auth);

    await expectApprovalRefused(workspace, auth, agent, suggestion);
  });

  it("refuses to approve adding a tool that is no longer accessible", async () => {
    const { workspace, auth, agent } = await setupTest();
    const suggestion = await AgentSuggestionFactory.createTools(auth, agent, {
      suggestion: { action: "add", toolId: "mcp_server_view_gone" },
    });

    await expectApprovalRefused(workspace, auth, agent, suggestion);
  });

  it("refuses to approve removing a tool used by a second action since it was suggested", async () => {
    const { workspace, auth, agent, globalSpace } = await setupTest();
    const server = await RemoteMCPServerFactory.create(workspace);
    const view = await MCPServerViewFactory.create(
      workspace,
      server.sId,
      globalSpace
    );
    await AgentMCPServerConfigurationFactory.create(auth, globalSpace, {
      agent,
      mcpServerView: view,
    });
    const suggestion = await AgentSuggestionFactory.createTools(auth, agent, {
      suggestion: { action: "remove", toolId: view.sId },
    });
    await AgentMCPServerConfigurationFactory.create(auth, globalSpace, {
      agent,
      mcpServerView: view,
    });

    await expectApprovalRefused(workspace, auth, agent, suggestion);
  });
});

describe("GET /api/w/:wId/assistant/agent_configurations/:aId/suggestions", () => {
  it("returns 403 for a non-editor admin", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "admin" });
    const { agentOwnerAuth } = await setupAgentOwner(workspace, "user");
    const agent = await AgentConfigurationFactory.createTestAgent(
      agentOwnerAuth,
      { scope: "hidden" }
    );

    const response = await getSuggestions(workspace, agent.sId);

    expect(response.status).toBe(403);
  });

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

  it("only returns Sidekick suggestions", async () => {
    const { workspace, auth, agent } = await setupTest();
    const sidekick = await AgentSuggestionFactory.createInstructions(
      auth,
      agent,
      { state: "pending", source: "sidekick" }
    );
    await AgentSuggestionFactory.createInstructions(auth, agent, {
      state: "pending",
      source: "conversational",
    });

    const response = await getSuggestions(workspace, agent.sId);

    expect(response.status).toBe(200);
    expect(
      (await response.json()).suggestions.map((s: { sId: string }) => s.sId)
    ).toEqual([sidekick.sId]);
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
      role: "user",
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
