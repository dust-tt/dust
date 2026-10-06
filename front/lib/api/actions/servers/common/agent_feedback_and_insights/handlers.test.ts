import { getAgentInsightsToolResult } from "@app/lib/api/actions/servers/common/agent_feedback_and_insights/handlers";
import { fetchAgentOverview } from "@app/lib/api/assistant/observability/overview";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { setupAgentOwner } from "@app/tests/utils/AgentOwnerFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import type { MembershipRoleType } from "@app/types/memberships";
import { Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(import("@app/lib/api/assistant/observability/overview"), () => ({
  fetchAgentOverview: vi.fn(),
}));

async function setupHiddenAgent(role: MembershipRoleType) {
  const { workspace, authenticator } = await createResourceTest({ role });
  const { agentOwnerAuth } = await setupAgentOwner(workspace, "user");
  const agent = await AgentConfigurationFactory.createTestAgent(
    agentOwnerAuth,
    { scope: "hidden" }
  );
  return { auth: authenticator, agent };
}

describe("getAgentInsightsToolResult", () => {
  beforeEach(() => {
    vi.mocked(fetchAgentOverview).mockReset();
    vi.mocked(fetchAgentOverview).mockResolvedValue(
      new Ok({ activeUsers: 0, conversationCount: 0, messageCount: 0 })
    );
  });

  it("returns the insights to a manager for a hidden agent they cannot read", async () => {
    const { auth, agent } = await setupHiddenAgent("manager");

    const result = await getAgentInsightsToolResult(auth, {
      agentConfigurationId: agent.sId,
    });

    expect(result.isOk()).toBe(true);
    expect(vi.mocked(fetchAgentOverview)).toHaveBeenCalledWith(
      auth,
      expect.objectContaining({ agentId: agent.sId })
    );
  });

  it("fails for a member on a hidden agent they cannot fetch", async () => {
    const { auth, agent } = await setupHiddenAgent("user");

    const result = await getAgentInsightsToolResult(auth, {
      agentConfigurationId: agent.sId,
    });

    expect(result.isErr()).toBe(true);
    expect(vi.mocked(fetchAgentOverview)).not.toHaveBeenCalled();
  });
});
