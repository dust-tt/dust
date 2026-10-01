import { computeAndStoreAgentMessageCredits } from "@app/lib/api/assistant/credit_cost";
import { recordGroupLimitUsage } from "@app/lib/api/groups/group_limit_usage";
import { recordFreeSeatLifetimeUsage } from "@app/lib/api/users/spend_limit";
import { Authenticator } from "@app/lib/auth";
import { RunResource } from "@app/lib/resources/run_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import type { MembershipSeatType } from "@app/types/memberships";
import { describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/groups/group_limit_usage", () => ({
  recordGroupLimitUsage: vi.fn(),
}));

vi.mock("@app/lib/api/credits/auto_seat_upgrade", () => ({
  maybeProactivelyAutoUpgradeSeatOnCapReached: vi.fn(),
}));

vi.mock("@app/lib/api/users/spend_limit", async () => {
  const actual = await vi.importActual<
    typeof import("@app/lib/api/users/spend_limit")
  >("@app/lib/api/users/spend_limit");
  return {
    ...actual,
    recordFreeSeatLifetimeUsage: vi.fn(),
    recordUserSpendLimitUsage: vi.fn(),
  };
});

async function finalizeMessageOfMember(seatType: MembershipSeatType) {
  const { authenticator: adminAuth, workspace } = await createResourceTest({
    role: "admin",
    plan: "creditPriced",
  });
  const member = await UserFactory.basic();
  await MembershipFactory.associate(workspace, member, {
    role: "user",
    seatType,
  });
  const auth = await Authenticator.fromUserIdAndWorkspaceId(
    member.sId,
    workspace.sId
  );

  const agentConfig = await AgentConfigurationFactory.createTestAgent(
    adminAuth,
    { name: "Test Agent", description: "Test Agent" }
  );
  const conversation = await ConversationFactory.create(auth, {
    agentConfigurationId: agentConfig.sId,
    messagesCreatedAt: [],
  });
  const { agentMessage } = await ConversationFactory.createAgentMessage(auth, {
    workspace,
    conversation,
    agentConfig,
  });

  vi.spyOn(RunResource, "listRunUsagesForRuns").mockResolvedValue([
    {
      completionTokens: 0,
      reasoningTokens: null,
      promptTokens: 0,
      cachedTokens: 0,
      cacheCreationTokens: 0,
      costMicroUsd: 8500,
      modelId: "gpt-4o",
      providerId: "openai",
      isBatch: false,
      inferenceProvider: null,
      region: null,
      runKey: null,
      runUsageModelId: 1,
      runModelId: 1,
      usageType: null,
    },
  ]);

  const costCredits = await computeAndStoreAgentMessageCredits(auth, {
    agentMessageId: agentMessage.sId,
  });
  return { member, agentMessageId: agentMessage.sId, costCredits };
}

describe("computeAndStoreAgentMessageCredits group limit recording", () => {
  it("records a paid seat's usage to its limit group", async () => {
    const { member, agentMessageId, costCredits } =
      await finalizeMessageOfMember("workspace");

    expect(costCredits).toBeGreaterThan(0);
    expect(recordGroupLimitUsage).toHaveBeenCalledWith(expect.anything(), {
      user: expect.objectContaining({ sId: member.sId }),
      agentMessageId,
      incrementBy: costCredits,
    });
  });

  it("does not record a free seat's usage to any group", async () => {
    const { costCredits } = await finalizeMessageOfMember("free");

    expect(costCredits).toBeGreaterThan(0);
    expect(recordFreeSeatLifetimeUsage).toHaveBeenCalled();
    expect(recordGroupLimitUsage).not.toHaveBeenCalled();
  });
});
