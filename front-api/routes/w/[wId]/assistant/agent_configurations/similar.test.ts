import { AGENTS_PER_LLM_CALL } from "@app/lib/api/assistant/existing_agent_checker";
import { Authenticator } from "@app/lib/auth";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import type { MembershipRoleType } from "@app/types/memberships";
import { Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/assistant/call_llm", () => ({
  runMultiActionsAgent: vi.fn(),
}));

import { runMultiActionsAgent } from "@app/lib/api/assistant/call_llm";

import { honoApp } from "@front-api/app";

async function setup(role: MembershipRoleType = "user") {
  const { workspace, user } = await createPrivateApiMockRequest({ role });
  const auth = await Authenticator.fromUserIdAndWorkspaceId(
    user.sId,
    workspace.sId
  );
  await FeatureFlagFactory.basic(auth, "similar_agents_check");
  return { workspace, auth };
}

async function createAgents(auth: Authenticator, count: number) {
  for (let i = 0; i < count; i++) {
    await AgentConfigurationFactory.createTestAgent(auth, {
      name: `Test Agent ${i}`,
      description: `Test agent description ${i}`,
    });
  }
}

function post(workspace: { sId: string }, body: unknown) {
  return honoApp.request(
    `/api/w/${workspace.sId}/assistant/agent_configurations/similar`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

function mockSimilarAgentsResponse(similarAgentIds: string[]) {
  return new Ok({
    actions: [
      {
        name: "set_similar_agents",
        arguments: { similar_agents_array: similarAgentIds },
      },
    ],
    generation: "",
  });
}

describe("POST /api/w/:wId/assistant/agent_configurations/similar", () => {
  beforeEach(() => {
    vi.mocked(runMultiActionsAgent).mockClear();
  });

  it("returns similar agents when runMultiActionsAgent succeeds", async () => {
    const { workspace, auth } = await setup();
    await createAgents(auth, 3);

    vi.mocked(runMultiActionsAgent).mockResolvedValue(
      mockSimilarAgentsResponse(["abc12", "20zer", "35xyz"])
    );

    const response = await post(workspace, {
      naturalDescription: "Answer questions about our HR policies",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      similar_agents: ["abc12", "20zer", "35xyz"],
    });
    expect(runMultiActionsAgent).toHaveBeenCalledTimes(1);
  });

  it("returns empty similar agents when runMultiActionsAgent succeeds with empty array", async () => {
    const { workspace, auth } = await setup();
    await createAgents(auth, 1);

    vi.mocked(runMultiActionsAgent).mockResolvedValue(
      mockSimilarAgentsResponse([])
    );

    const response = await post(workspace, {
      naturalDescription: "Answer questions about our HR policies",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ similar_agents: [] });
  });

  it("returns empty similar agents when the workspace has no custom agents", async () => {
    const { workspace } = await setup();

    // The workspace still has global agents (e.g. "Dust"), so the LLM is
    // called against those; it's mocked here to report no duplicates.
    vi.mocked(runMultiActionsAgent).mockResolvedValue(
      mockSimilarAgentsResponse([])
    );

    const response = await post(workspace, {
      naturalDescription: "Answer questions about our HR policies",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ similar_agents: [] });
  });

  it("batches agents into multiple LLM calls and merges deduplicated results", async () => {
    const { workspace, auth } = await setup();
    await createAgents(auth, AGENTS_PER_LLM_CALL + 1);

    vi.mocked(runMultiActionsAgent)
      .mockResolvedValueOnce(mockSimilarAgentsResponse(["abc12", "20zer"]))
      .mockResolvedValueOnce(mockSimilarAgentsResponse(["20zer", "35xyz"]));

    const response = await post(workspace, {
      naturalDescription: "Answer questions about our HR policies",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      similar_agents: ["abc12", "20zer", "35xyz"],
    });
    expect(runMultiActionsAgent).toHaveBeenCalledTimes(2);
  });

  it("returns 400 when naturalDescription is missing", async () => {
    const { workspace } = await setup();

    const response = await post(workspace, {});

    expect(response.status).toBe(400);
    const data = (await response.json()) as { error: { type: string } };
    expect(data.error.type).toBe("invalid_request_error");
  });
});
