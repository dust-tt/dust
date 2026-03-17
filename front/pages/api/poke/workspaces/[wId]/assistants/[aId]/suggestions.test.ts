import { AgentSuggestionResource } from "@app/lib/resources/agent_suggestion_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { AgentSuggestionFactory } from "@app/tests/utils/AgentSuggestionFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { describe, expect, it } from "vitest";

import handler from "./suggestions";

describe("GET /api/poke/workspaces/[wId]/assistants/[aId]/suggestions", () => {
  it("returns 404 for non super users", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "GET",
      isSuperUser: false,
      role: "admin",
    });

    req.query = { wId: workspace.sId, aId: "some-agent-id" };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
  });

  it("returns suggestions for a given agent", async () => {
    const { req, res, workspace, authenticator } =
      await createPrivateApiMockRequest({
        method: "GET",
        isSuperUser: true,
        role: "admin",
      });

    const agent =
      await AgentConfigurationFactory.createTestAgent(authenticator);
    await AgentSuggestionFactory.createInstructions(authenticator, agent);

    req.query = { wId: workspace.sId, aId: agent.sId };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.suggestions).toHaveLength(1);
    expect(data.suggestions[0].kind).toBe("instructions");
  });
});

describe("DELETE /api/poke/workspaces/[wId]/assistants/[aId]/suggestions", () => {
  it("returns 400 when sId query param is missing", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "DELETE",
      isSuperUser: true,
      role: "admin",
    });

    req.query = { wId: workspace.sId, aId: "some-agent-id" };

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
      aId: "some-agent-id",
      sId: "non-existent-suggestion-id",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData().error.type).toBe("agent_configuration_not_found");
  });

  it("deletes the suggestion and returns 204", async () => {
    const { req, res, workspace, authenticator } =
      await createPrivateApiMockRequest({
        method: "DELETE",
        isSuperUser: true,
        role: "admin",
      });

    const agent =
      await AgentConfigurationFactory.createTestAgent(authenticator);
    const suggestion = await AgentSuggestionFactory.createInstructions(
      authenticator,
      agent
    );

    req.query = {
      wId: workspace.sId,
      aId: agent.sId,
      sId: suggestion.sId,
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(204);

    // Verify the suggestion is actually deleted.
    const deleted = await AgentSuggestionResource.fetchById(
      authenticator,
      suggestion.sId
    );
    expect(deleted).toBeNull();
  });
});
