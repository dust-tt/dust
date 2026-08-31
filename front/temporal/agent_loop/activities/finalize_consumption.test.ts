import type { AuthenticatorType } from "@app/lib/auth";
import { finalizeSuccessfulAgentLoopActivity } from "@app/temporal/agent_loop/activities/finalize";
import type { AgentMessageConsumptionExecutionContext } from "@app/types/assistant/agent_message_consumption";
import type { AgentLoopArgs } from "@app/types/assistant/agent_run";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  analytics: vi.fn(),
  attribution: vi.fn(),
  auth: {},
  computeCredits: vi.fn(),
  emailCompletion: vi.fn(),
  emailError: vi.fn(),
  finalized: vi.fn(),
  fromJson: vi.fn(),
  mention: vi.fn(),
  metronome: vi.fn(),
  notification: vi.fn(),
  programmaticUsage: vi.fn(),
  snapshotSkills: vi.fn(),
  unreadNotification: vi.fn(),
}));

vi.mock("@app/lib/api/assistant/credit_cost", () => ({
  computeAndStoreAgentMessageCredits: mocks.computeCredits,
}));

vi.mock("@app/lib/api/assistant/email/email_reply", () => ({
  sendEmailReplyOnCompletion: mocks.emailCompletion,
  sendEmailReplyOnError: mocks.emailError,
}));

vi.mock("@app/lib/auth", () => ({
  Authenticator: {
    fromJsonWithRefrehedGroups: mocks.fromJson,
  },
}));

vi.mock("@app/lib/resources/agent_mcp_action_resource", () => ({
  AgentMCPActionResource: {},
}));

vi.mock("@app/logger/logger", () => ({
  default: { error: vi.fn(), warn: vi.fn() },
}));

vi.mock("@app/temporal/agent_loop/activities/analytics", () => ({
  launchAgentMessageAnalytics: mocks.analytics,
  launchAgentMessageConsumptionAttribution: mocks.attribution,
}));

vi.mock("@app/temporal/agent_loop/activities/common", () => ({
  creditsExhaustedMessage: vi.fn(),
  finalizeCancellation: vi.fn(),
  finalizeCreditStop: vi.fn(),
  finalizeGracefulStop: vi.fn(),
  finalizeInterruption: vi.fn(),
  notifyWorkflowError: vi.fn(),
}));

vi.mock("@app/temporal/agent_loop/activities/consumption", () => ({
  recordExecutionFinalized: mocks.finalized,
}));

vi.mock("@app/temporal/agent_loop/activities/mentions", () => ({
  handleMentions: mocks.mention,
}));

vi.mock("@app/temporal/agent_loop/activities/notification", () => ({
  activationNewConversationNotification: mocks.notification,
  conversationUnreadNotification: mocks.unreadNotification,
}));

vi.mock("@app/temporal/agent_loop/activities/snapshot_skills", () => ({
  snapshotAgentMessageSkills: mocks.snapshotSkills,
}));

vi.mock("@app/temporal/agent_loop/activities/usage_tracking", () => ({
  launchEmitMetronomeUsageEvents: mocks.metronome,
  launchTrackProgrammaticUsage: mocks.programmaticUsage,
}));

const authType: AuthenticatorType = {
  authMethod: "internal",
  groupIds: [],
  isByok: false,
  role: "admin",
  subscriptionId: null,
  userId: null,
  workspaceId: "workspace",
};

const agentLoopArgs: AgentLoopArgs = {
  agentMessageId: "agent-message",
  agentMessageVersion: 0,
  conversationId: "conversation",
  conversationTitle: null,
  userMessageId: "user-message",
  userMessageOrigin: "web",
  userMessageVersion: 0,
};

const consumptionContext: AgentMessageConsumptionExecutionContext = {
  mode: "live",
  rootAgentMessageId: "agent-message",
  runKey: "execution",
};

describe("finalize consumption prerequisites", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fromJson.mockResolvedValue(mocks.auth);
    mocks.snapshotSkills.mockResolvedValue(undefined);
    mocks.finalized.mockResolvedValue("live");
  });

  it("snapshots skills before publishing the finalized event", async () => {
    await finalizeSuccessfulAgentLoopActivity(
      authType,
      agentLoopArgs,
      consumptionContext
    );

    expect(mocks.snapshotSkills).toHaveBeenCalledWith(
      mocks.auth,
      agentLoopArgs
    );
    expect(mocks.snapshotSkills.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.finalized.mock.invocationCallOrder[0]
    );
    expect(mocks.finalized).toHaveBeenCalledWith(
      mocks.auth,
      agentLoopArgs,
      consumptionContext
    );
    expect(mocks.finalized.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.analytics.mock.invocationCallOrder[0]
    );
  });

  it("does not publish finalization when the skill snapshot fails", async () => {
    const error = new Error("skill snapshot failed");
    mocks.snapshotSkills.mockRejectedValue(error);

    await expect(
      finalizeSuccessfulAgentLoopActivity(
        authType,
        agentLoopArgs,
        consumptionContext
      )
    ).rejects.toBe(error);

    expect(mocks.finalized).not.toHaveBeenCalled();
    expect(mocks.analytics).not.toHaveBeenCalled();
    expect(mocks.metronome).not.toHaveBeenCalled();
  });
});
