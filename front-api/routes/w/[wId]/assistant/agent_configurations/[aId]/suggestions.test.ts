import {
  createPendingAgentConfiguration,
  getAgentConfiguration,
} from "@app/lib/api/assistant/configuration/agent";
import { Authenticator } from "@app/lib/auth";
import { convertMarkdownToBlockHtml } from "@app/lib/editor/skill_instructions_html";
import { AgentSuggestionResource } from "@app/lib/resources/agent_suggestion_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { setupAgentOwner } from "@app/tests/utils/AgentOwnerFactory";
import { AgentSuggestionFactory } from "@app/tests/utils/AgentSuggestionFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { grantWorkspacePermission } from "@app/tests/utils/permissions";
import { setupSkillInstructionsMarkdownPipeline } from "@app/tests/utils/skill_instructions_html";
import { UserFactory } from "@app/tests/utils/UserFactory";
import type { MembershipRoleType } from "@app/types/memberships";
import type { AgentSuggestionState } from "@app/types/suggestions/agent_suggestion";
import { honoApp } from "@front-api/app";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  setupSkillInstructionsMarkdownPipeline();
});

async function setupTest(options: { role?: MembershipRoleType } = {}) {
  const role = options.role ?? "user";
  const { workspace, auth, user } = await createPrivateApiMockRequest({
    role,
  });
  const agent = await AgentConfigurationFactory.createTestAgent(auth);
  return { workspace, auth, user, agent };
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

describe("PATCH with applyToAgent", () => {
  async function setupPendingAgent() {
    // Admins hold the create-agent capability the placeholder needs.
    const { workspace, auth } = await createPrivateApiMockRequest({
      role: "admin",
    });
    const pending = await createPendingAgentConfiguration(auth);
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
    return { workspace, auth, agent };
  }

  it("turns the pending placeholder into an active hidden agent", async () => {
    const { workspace, auth, agent } = await setupPendingAgent();
    const suggestion = await AgentSuggestionFactory.createCreate(auth, agent, {
      suggestion: {
        name: "Incident Helper",
        description: "Helps triage incidents.",
        instructions: "<p>Collect <strong>impact</strong> and timeline.</p>",
      },
    });

    const response = await patchSuggestions(workspace, agent.sId, {
      suggestionIds: [suggestion.sId],
      state: "approved",
      applyToAgent: true,
    });

    expect(response.status).toBe(200);
    expect((await response.json()).suggestions[0].state).toBe("approved");

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

  it("returns 400 when the caller lost the create-agent capability", async () => {
    const { workspace, auth, agent } = await setupPendingAgent();
    const suggestion = await AgentSuggestionFactory.createCreate(auth, agent);

    // The capability was held when the placeholder was created; simulate it being revoked since.
    vi.spyOn(Authenticator.prototype, "hasWorkspacePermission").mockReturnValue(
      false
    );

    const response = await patchSuggestions(workspace, agent.sId, {
      suggestionIds: [suggestion.sId],
      state: "approved",
      applyToAgent: true,
    });

    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toContain("restricted");

    const placeholder = await getAgentConfiguration(auth, {
      agentId: agent.sId,
      variant: "light",
    });
    expect(placeholder?.status).toBe("pending");
  });

  it("returns 400 and leaves the suggestion pending when the target is not a placeholder", async () => {
    const { workspace, auth, agent } = await setupTest();
    const suggestion = await AgentSuggestionFactory.createCreate(auth, agent);

    const response = await patchSuggestions(workspace, agent.sId, {
      suggestionIds: [suggestion.sId],
      state: "approved",
      applyToAgent: true,
    });

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
    const { workspace, auth, agent } = await setupTest();
    const suggestion = await AgentSuggestionFactory.createDelete(auth, agent);

    const response = await patchSuggestions(workspace, agent.sId, {
      suggestionIds: [suggestion.sId],
      state: "approved",
      applyToAgent: true,
    });

    expect(response.status).toBe(200);
    expect((await response.json()).suggestions[0].state).toBe("approved");

    const archived = await getAgentConfiguration(auth, {
      agentId: agent.sId,
      variant: "light",
    });
    expect(archived?.status).toBe("archived");
  });

  it("updates the agent's model for a model suggestion", async () => {
    const { workspace, auth, agent } = await setupTest();
    const suggestion = await AgentSuggestionFactory.createModel(auth, agent, {
      suggestion: {
        modelId: "claude-haiku-4-5-20251001",
        reasoningEffort: "medium",
      },
    });

    const response = await patchSuggestions(workspace, agent.sId, {
      suggestionIds: [suggestion.sId],
      state: "approved",
      applyToAgent: true,
    });

    expect(response.status).toBe(200);
    expect((await response.json()).suggestions[0].state).toBe("approved");

    const updated = await getAgentConfiguration(auth, {
      agentId: agent.sId,
      variant: "light",
    });
    expect(updated?.model.modelId).toBe("claude-haiku-4-5-20251001");
    expect(updated?.model.reasoningEffort).toBe("medium");
  });

  it("returns 400 and leaves the suggestion pending when changing the model of a non-active agent", async () => {
    const { workspace, auth, agent } = await setupPendingAgent();
    const suggestion = await AgentSuggestionFactory.createModel(auth, agent);

    const response = await patchSuggestions(workspace, agent.sId, {
      suggestionIds: [suggestion.sId],
      state: "approved",
      applyToAgent: true,
    });

    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toContain(
      "cannot be exported or updated"
    );
    const fetched = await AgentSuggestionResource.fetchById(
      auth,
      suggestion.sId
    );
    expect(fetched?.state).toBe("pending");
  });

  it("updates the agent's instructions for an instructions suggestion", async () => {
    const { workspace, auth, agent } = await setupTest();
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

    const suggestion = await AgentSuggestionFactory.createInstructions(
      auth,
      updatedAgent,
      {
        suggestion: {
          targetBlockId: targetBlockId as string,
          type: "replace",
          content: "<p>Be extremely helpful.</p>",
        },
        source: "conversational",
      }
    );

    const response = await patchSuggestions(workspace, agent.sId, {
      suggestionIds: [suggestion.sId],
      state: "approved",
      applyToAgent: true,
    });

    expect(response.status).toBe(200);
    expect((await response.json()).suggestions[0].state).toBe("approved");

    const updated = await getAgentConfiguration(auth, {
      agentId: agent.sId,
      variant: "full",
    });
    expect(updated?.instructionsHtml).toContain("Be extremely helpful.");
  });

  it("returns 400 and leaves the suggestion pending when changing the instructions of a non-active agent", async () => {
    const { workspace, auth, agent } = await setupPendingAgent();
    const suggestion = await AgentSuggestionFactory.createInstructions(
      auth,
      agent,
      { source: "conversational" }
    );

    const response = await patchSuggestions(workspace, agent.sId, {
      suggestionIds: [suggestion.sId],
      state: "approved",
      applyToAgent: true,
    });

    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toContain(
      "cannot be exported or updated"
    );
    const fetched = await AgentSuggestionResource.fetchById(
      auth,
      suggestion.sId
    );
    expect(fetched?.state).toBe("pending");
  });

  it("returns 400 and leaves the suggestion pending when the targeted block no longer exists", async () => {
    const { workspace, auth, agent } = await setupTest();
    const instructionsHtml = convertMarkdownToBlockHtml("Be helpful.");
    const updatedAgent = await AgentConfigurationFactory.updateTestAgent(
      auth,
      agent.sId,
      { instructionsHtml }
    );

    const suggestion = await AgentSuggestionFactory.createInstructions(
      auth,
      updatedAgent,
      {
        suggestion: {
          targetBlockId: "does-not-exist",
          type: "replace",
          content: "<p>Be extremely helpful.</p>",
        },
        source: "conversational",
      }
    );

    const response = await patchSuggestions(workspace, agent.sId, {
      suggestionIds: [suggestion.sId],
      state: "approved",
      applyToAgent: true,
    });

    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toContain(
      "no longer contain the block"
    );
    const fetched = await AgentSuggestionResource.fetchById(
      auth,
      suggestion.sId
    );
    expect(fetched?.state).toBe("pending");
  });

  it("returns 400 and leaves the suggestion pending when deleting a non-active agent", async () => {
    const { workspace, auth, agent } = await setupPendingAgent();
    const suggestion = await AgentSuggestionFactory.createDelete(auth, agent);

    const response = await patchSuggestions(workspace, agent.sId, {
      suggestionIds: [suggestion.sId],
      state: "approved",
      applyToAgent: true,
    });

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

  it("renames the agent for a name suggestion, leaving its other fields alone", async () => {
    const { workspace, auth, agent } = await setupTest();
    const suggestion = await AgentSuggestionFactory.createName(auth, agent, {
      suggestion: { name: "IncidentHelper" },
    });

    const response = await patchSuggestions(workspace, agent.sId, {
      suggestionIds: [suggestion.sId],
      state: "approved",
      applyToAgent: true,
    });

    expect(response.status).toBe(200);
    expect((await response.json()).suggestions[0].state).toBe("approved");

    const renamed = await getAgentConfiguration(auth, {
      agentId: agent.sId,
      variant: "full",
    });
    expect(renamed).toMatchObject({
      sId: agent.sId,
      status: "active",
      name: "IncidentHelper",
      description: agent.description,
      scope: agent.scope,
      instructions: agent.instructions,
      version: agent.version + 1,
    });
  });

  it("changes the agent's description for a description suggestion, leaving other fields alone", async () => {
    const { workspace, auth, agent } = await setupTest();
    const suggestion = await AgentSuggestionFactory.createDescription(
      auth,
      agent,
      {
        suggestion: { description: "Handles incident triage end to end." },
      }
    );

    const response = await patchSuggestions(workspace, agent.sId, {
      suggestionIds: [suggestion.sId],
      state: "approved",
      applyToAgent: true,
    });

    expect(response.status).toBe(200);
    expect((await response.json()).suggestions[0].state).toBe("approved");

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
    const { workspace, auth, agent } = await setupTest();
    const nameSuggestion = await AgentSuggestionFactory.createName(
      auth,
      agent,
      { suggestion: { name: "IncidentHelper" } }
    );
    const descriptionSuggestion =
      await AgentSuggestionFactory.createDescription(auth, agent, {
        suggestion: { description: "Handles incident triage end to end." },
      });

    const response = await patchSuggestions(workspace, agent.sId, {
      suggestionIds: [nameSuggestion.sId, descriptionSuggestion.sId],
      state: "approved",
      applyToAgent: true,
    });

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

  it("publishes the agent for a publish state suggestion, leaving other fields alone", async () => {
    const { workspace, auth, user } = await createPrivateApiMockRequest({
      role: "user",
    });
    // Starts hidden so publishing it is a real scope change, not a no-op.
    const agent = await AgentConfigurationFactory.createTestAgent(auth, {
      scope: "hidden",
    });
    await grantWorkspacePermission(workspace, user, {
      grantType: "publish",
      resourceType: "agent",
    });
    await auth.refresh();

    const suggestion = await AgentSuggestionFactory.createScope(auth, agent, {
      suggestion: { scope: "visible" },
    });

    const response = await patchSuggestions(workspace, agent.sId, {
      suggestionIds: [suggestion.sId],
      state: "approved",
      applyToAgent: true,
    });

    expect(response.status).toBe(200);
    expect((await response.json()).suggestions[0].state).toBe("approved");

    const updated = await getAgentConfiguration(auth, {
      agentId: agent.sId,
      variant: "full",
    });
    expect(updated).toMatchObject({
      sId: agent.sId,
      status: "active",
      name: agent.name,
      description: agent.description,
      scope: "visible",
      instructions: agent.instructions,
      version: agent.version + 1,
    });
  });

  it("returns 400 when the caller lacks the publish capability, leaving the agent's scope unchanged", async () => {
    const { workspace, auth, agent } = await setupTest();
    // The caller holds `write` on the agent (created it) but not the workspace `publish`
    // capability that a scope change also requires (see `scope-change-requires-edit-and-publish`).
    const suggestion = await AgentSuggestionFactory.createScope(auth, agent, {
      suggestion: { scope: "hidden" },
    });

    const response = await patchSuggestions(workspace, agent.sId, {
      suggestionIds: [suggestion.sId],
      state: "approved",
      applyToAgent: true,
    });

    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toContain("publish");

    const untouched = await getAgentConfiguration(auth, {
      agentId: agent.sId,
      variant: "light",
    });
    expect(untouched?.scope).toBe(agent.scope);
    expect(untouched?.version).toBe(agent.version);
  });

  it("applies a name and a publish state suggestion from the same batch as a single version", async () => {
    const { workspace, auth, user, agent } = await setupTest();
    await grantWorkspacePermission(workspace, user, {
      grantType: "publish",
      resourceType: "agent",
    });
    await auth.refresh();

    const nameSuggestion = await AgentSuggestionFactory.createName(
      auth,
      agent,
      { suggestion: { name: "IncidentHelper" } }
    );
    const scopeSuggestion = await AgentSuggestionFactory.createScope(
      auth,
      agent,
      { suggestion: { scope: "hidden" } }
    );

    const response = await patchSuggestions(workspace, agent.sId, {
      suggestionIds: [nameSuggestion.sId, scopeSuggestion.sId],
      state: "approved",
      applyToAgent: true,
    });

    expect(response.status).toBe(200);

    const updated = await getAgentConfiguration(auth, {
      agentId: agent.sId,
      variant: "full",
    });
    expect(updated).toMatchObject({
      sId: agent.sId,
      status: "active",
      name: "IncidentHelper",
      description: agent.description,
      scope: "hidden",
      instructions: agent.instructions,
      // One batch, one version: both edits land in the same upgrade, not two.
      version: agent.version + 1,
    });
  });

  it("returns 400 for kinds that cannot be applied server-side", async () => {
    const { workspace, auth, agent } = await setupTest();
    const suggestion = await AgentSuggestionFactory.createTools(auth, agent);

    const response = await patchSuggestions(workspace, agent.sId, {
      suggestionIds: [suggestion.sId],
      state: "approved",
      applyToAgent: true,
    });

    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toContain(
      "cannot be applied server-side"
    );
  });

  it("returns 400 when applying with a non-approved state", async () => {
    const { workspace, auth, agent } = await setupTest();
    const suggestion = await AgentSuggestionFactory.createCreate(auth, agent);

    const response = await patchSuggestions(workspace, agent.sId, {
      suggestionIds: [suggestion.sId],
      state: "rejected",
      applyToAgent: true,
    });

    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toContain(
      "Only an approved suggestion"
    );
  });

  it("returns 400 when the suggestion was already reviewed", async () => {
    const { workspace, auth, agent } = await setupPendingAgent();
    const suggestion = await AgentSuggestionFactory.createCreate(auth, agent, {
      state: "rejected",
    });

    const response = await patchSuggestions(workspace, agent.sId, {
      suggestionIds: [suggestion.sId],
      state: "approved",
      applyToAgent: true,
    });

    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toContain(
      "already been reviewed"
    );
  });
});
