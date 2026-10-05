import { Authenticator } from "@app/lib/auth";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/assistant/tag_manager", () => ({
  getWorkspaceTagSuggestions: vi.fn(),
}));

import { getWorkspaceTagSuggestions } from "@app/lib/api/assistant/tag_manager";

import { honoApp } from "@front-api/app";

describe("GET /api/w/:wId/tags/suggest_from_agents", () => {
  beforeEach(() => {
    vi.mocked(getWorkspaceTagSuggestions).mockReset();
  });

  it("describes the agents to the model and returns the suggested agents' id and name", async () => {
    const { workspace, user } = await createPrivateApiMockRequest({
      role: "admin",
    });
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    const agent = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Sales Helper",
      instructions: "Qualify inbound leads.",
    });
    vi.mocked(getWorkspaceTagSuggestions).mockResolvedValue(
      new Ok({ suggestions: [{ name: "Sales", agentIds: [agent.sId] }] })
    );

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/tags/suggest_from_agents`
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      suggestions: [
        { name: "Sales", agents: [{ sId: agent.sId, name: "Sales Helper" }] },
      ],
    });
    const [, { formattedAgents }] = vi.mocked(getWorkspaceTagSuggestions).mock
      .calls[0];
    expect(formattedAgents).toContain(`Identifier: ${agent.sId}`);
    expect(formattedAgents).toContain("Instructions: Qualify inbound leads.");
  });
});
