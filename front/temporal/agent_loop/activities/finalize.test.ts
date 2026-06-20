import { finalizeCreditStoppedAgentLoopActivity } from "@app/temporal/agent_loop/activities/finalize";
import { Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockFromJson,
  mockGetAgentLoopDataWithAuth,
  mockUpdateResourceAndPublishEvent,
} = vi.hoisted(() => ({
  mockFromJson: vi.fn(),
  mockGetAgentLoopDataWithAuth: vi.fn(),
  mockUpdateResourceAndPublishEvent: vi.fn(),
}));

vi.mock("@app/lib/auth", () => ({
  Authenticator: { fromJsonWithRefrehedGroups: mockFromJson },
}));

vi.mock("@app/types/assistant/agent_run", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@app/types/assistant/agent_run")>();
  return { ...actual, getAgentLoopDataWithAuth: mockGetAgentLoopDataWithAuth };
});

vi.mock("@app/temporal/agent_loop/activities/common", () => ({
  updateResourceAndPublishEvent: mockUpdateResourceAndPublishEvent,
}));

// All post-publish side effects are no-ops for this test — we only assert the terminal event.
vi.mock("@app/temporal/agent_loop/activities/snapshot_skills", () => ({
  snapshotAgentMessageSkills: vi.fn(),
}));
vi.mock("@app/temporal/agent_loop/activities/analytics", () => ({
  launchAgentMessageAnalytics: vi.fn(),
}));
vi.mock("@app/temporal/agent_loop/activities/usage_tracking", () => ({
  launchTrackProgrammaticUsage: vi.fn(),
  launchEmitMetronomeUsageEvents: vi.fn(),
}));
vi.mock("@app/temporal/agent_loop/activities/notification", () => ({
  conversationUnreadNotification: vi.fn(),
}));
vi.mock("@app/temporal/agent_loop/activities/mentions", () => ({
  handleMentions: vi.fn(),
}));
vi.mock("@app/lib/api/assistant/credit_cost", () => ({
  computeAndStoreAgentMessageCredits: vi.fn(),
}));
vi.mock("@app/lib/api/assistant/email/email_reply", () => ({
  sendEmailReplyOnCompletion: vi.fn(),
  sendEmailReplyOnError: vi.fn(),
}));

const FAKE_AGENT_MESSAGE = { sId: "msg_test" } as never;
const FAKE_CONVERSATION = { sId: "conv_test" } as never;

function setupAuth({ isAdmin }: { isAdmin: boolean }) {
  mockFromJson.mockResolvedValue({ isAdmin: () => isAdmin } as never);
  mockGetAgentLoopDataWithAuth.mockResolvedValue(
    new Ok({
      auth: {} as never,
      agentConfiguration: { sId: "agent_test" } as never,
      agentMessage: FAKE_AGENT_MESSAGE,
      conversation: FAKE_CONVERSATION,
      userMessage: {} as never,
    })
  );
}

describe("finalizeCreditStoppedAgentLoopActivity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("publishes a retryable credits_exhausted agent_error with admin wording", async () => {
    setupAuth({ isAdmin: true });

    await finalizeCreditStoppedAgentLoopActivity(
      {} as never,
      { agentMessageId: "msg_test", dustRunIds: ["run1", "run2"] } as never,
      { reason: "credits_exhausted", step: 3 }
    );

    expect(mockUpdateResourceAndPublishEvent).toHaveBeenCalledTimes(1);
    const [, callArgs] = mockUpdateResourceAndPublishEvent.mock.calls[0];
    expect(callArgs.agentMessage).toBe(FAKE_AGENT_MESSAGE);
    expect(callArgs.conversation).toBe(FAKE_CONVERSATION);
    expect(callArgs.step).toBe(3);
    expect(callArgs.event).toMatchObject({
      type: "agent_error",
      configurationId: "agent_test",
      messageId: "msg_test",
      runIds: ["run1", "run2"],
      error: {
        code: "credits_exhausted",
        message:
          "Your workspace has run out of credits. Please purchase more credits to continue using Dust.",
        metadata: expect.objectContaining({ category: "credits_exhausted" }),
      },
    });
  });

  it("uses member wording when the actor is not an admin", async () => {
    setupAuth({ isAdmin: false });

    await finalizeCreditStoppedAgentLoopActivity(
      {} as never,
      { agentMessageId: "msg_test", dustRunIds: [] } as never,
      { reason: "credits_exhausted", step: 1 }
    );

    const [, callArgs] = mockUpdateResourceAndPublishEvent.mock.calls[0];
    expect(callArgs.event.error.message).toBe(
      "Your workspace has run out of credits. Please contact your administrator to purchase more credits."
    );
  });

  it("does not publish when the agent loop data is unavailable (e.g. deleted)", async () => {
    mockFromJson.mockResolvedValue({ isAdmin: () => true } as never);
    const { Err } = await import("@app/types/shared/result");
    const { AgentLoopDataError } = await import(
      "@app/types/assistant/agent_run"
    );
    mockGetAgentLoopDataWithAuth.mockResolvedValue(
      new Err(new AgentLoopDataError("agent_message_deleted"))
    );

    await finalizeCreditStoppedAgentLoopActivity(
      {} as never,
      { agentMessageId: "msg_test", dustRunIds: [] } as never,
      { reason: "credits_exhausted", step: 1 }
    );

    expect(mockUpdateResourceAndPublishEvent).not.toHaveBeenCalled();
  });
});
