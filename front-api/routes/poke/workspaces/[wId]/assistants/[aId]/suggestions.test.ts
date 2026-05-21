import { AgentSuggestionResource } from "@app/lib/resources/agent_suggestion_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { AgentSuggestionFactory } from "@app/tests/utils/AgentSuggestionFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function listSuggestions(workspace: { sId: string }, aId: string) {
  return honoApp.request(
    `/api/poke/workspaces/${workspace.sId}/assistants/${aId}/suggestions`
  );
}

function deleteSuggestion(
  workspace: { sId: string },
  aId: string,
  query: Record<string, string> = {}
) {
  const search = new URLSearchParams(query).toString();
  return honoApp.request(
    `/api/poke/workspaces/${workspace.sId}/assistants/${aId}/suggestions${
      search ? `?${search}` : ""
    }`,
    { method: "DELETE" }
  );
}

describe("GET /api/poke/workspaces/:wId/assistants/:aId/suggestions", () => {
  it("returns 401 for non super users", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "GET",
      isSuperUser: false,
      role: "admin",
    });

    const response = await listSuggestions(workspace, "some-agent-id");

    expect(response.status).toBe(401);
  });

  it("returns suggestions for a given agent", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      method: "GET",
      isSuperUser: true,
      role: "admin",
    });

    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    await AgentSuggestionFactory.createInstructions(auth, agent);

    const response = await listSuggestions(workspace, agent.sId);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.suggestions).toHaveLength(1);
    expect(data.suggestions[0].kind).toBe("instructions");
  });
});

describe("DELETE /api/poke/workspaces/:wId/assistants/:aId/suggestions", () => {
  it("returns 400 when sId query param is missing", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "DELETE",
      isSuperUser: true,
      role: "admin",
    });

    const response = await deleteSuggestion(workspace, "some-agent-id");

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

    const response = await deleteSuggestion(workspace, "some-agent-id", {
      sId: "non-existent-suggestion-id",
    });

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error.type).toBe("agent_configuration_not_found");
  });

  it("deletes the suggestion and returns 204", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      method: "DELETE",
      isSuperUser: true,
      role: "admin",
    });

    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const suggestion = await AgentSuggestionFactory.createInstructions(
      auth,
      agent
    );

    const response = await deleteSuggestion(workspace, agent.sId, {
      sId: suggestion.sId,
    });

    expect(response.status).toBe(204);

    // Verify the suggestion is actually deleted.
    const deleted = await AgentSuggestionResource.fetchById(
      auth,
      suggestion.sId
    );
    expect(deleted).toBeNull();
  });
});
