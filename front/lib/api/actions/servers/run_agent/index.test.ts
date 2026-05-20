import { TOOL_DEPLOY_INTERRUPTION_ERROR_TYPE } from "@app/lib/actions/tool_interruptions";
import { DUST_WORKER_SHUTDOWN_ABORT_REASON } from "@app/lib/shutdown_signal";
import { Ok } from "@app/types/shared/result";
import { CancelledFailure } from "@temporalio/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cancelAgentLoop: vi.fn(),
  getAgentConfiguration: vi.fn(),
  getConversation: vi.fn(),
  getOrCreateConversation: vi.fn(),
  prodAPICredentialsForOwner: vi.fn(),
  streamAgentAnswerEvents: vi.fn(),
}));

vi.mock("@app/lib/api/actions/servers/run_agent/conversation", () => ({
  getOrCreateConversation: mocks.getOrCreateConversation,
}));

vi.mock("@app/lib/api/assistant/configuration/agent", () => ({
  getAgentConfiguration: mocks.getAgentConfiguration,
}));

vi.mock("@app/lib/api/assistant/pubsub", () => ({
  cancelAgentLoop: mocks.cancelAgentLoop,
}));

vi.mock("@app/lib/api/assistant/citations", () => ({
  getCitationsFromActions: vi.fn(() => ({})),
  getRefs: vi.fn(() => []),
}));

vi.mock("@app/lib/api/config", () => ({
  default: {
    getAppUrl: vi.fn(() => "https://dust.tt"),
    getDustAPIConfig: vi.fn(() => ({})),
  },
}));

vi.mock("@app/lib/auth", () => ({
  getApiKeyNameHeader: vi.fn(() => ({})),
  prodAPICredentialsForOwner: mocks.prodAPICredentialsForOwner,
}));

vi.mock("@app/lib/utils/router", () => ({
  getConversationRoute: vi.fn(() => "https://dust.tt/w/w1/conversation/c1"),
}));

vi.mock("@dust-tt/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@dust-tt/client")>();

  return {
    ...actual,
    DustAPI: vi.fn(function DustAPI() {
      return {
        getConversation: mocks.getConversation,
        streamAgentAnswerEvents: mocks.streamAgentAnswerEvents,
      };
    }),
    isAgentMessage: (message: { type?: string }) =>
      message.type === "agent_message",
  };
});

import { runAgent } from "@app/lib/api/actions/servers/run_agent";

const workspace = {
  id: 1,
  sId: "w1",
};

const auth = {
  getNonNullableWorkspace: () => workspace,
  user: () => ({ email: "user@dust.tt" }),
};

const mainAgent = {
  instructions: "Main instructions",
  name: "Main",
  sId: "agent-main",
  version: 1,
};

const mainConversation = {
  owner: workspace,
  sId: "conv-main",
};

const mainAgentMessage = {
  actions: [],
  sId: "agent-message-main",
};

const childAgentMessage = {
  actions: [],
  chainOfThought: null,
  content: null,
  parentMessageId: "user-message-child",
  sId: "agent-message-child",
  status: "running",
  type: "agent_message",
  version: 0,
};

const childConversation = {
  content: [
    [{ sId: "user-message-child", type: "user_message" }],
    [childAgentMessage],
  ],
  sId: "conv-child",
};

const agentLoopContext = {
  runContext: {
    agentConfiguration: mainAgent,
    agentMessage: mainAgentMessage,
    conversation: mainConversation,
    stepContext: {
      citationsOffset: 0,
    },
  },
};

async function* abortingStream(controller: AbortController, reason: unknown) {
  controller.abort(reason);
  throw new Error("stream aborted");
}

function runAgentWithSignal(signal: AbortSignal) {
  return runAgent(
    {
      childAgent: { uri: "agent://dust/w/w1/agents/agent-child" },
      executionMode: { value: "run-agent" },
      query: "Run the child",
    },
    {
      auth: auth as never,
      agentLoopContext: agentLoopContext as never,
      childAgentBlob: {
        description: "Child description",
        name: "Child",
      },
      signal,
      toolName: "run_Child",
    }
  );
}

describe("runAgent interruption handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.cancelAgentLoop.mockResolvedValue({ failedMessageIds: [] });
    mocks.getAgentConfiguration.mockResolvedValue({
      canRead: true,
      status: "active",
    });
    mocks.getOrCreateConversation.mockResolvedValue(
      new Ok({
        conversation: childConversation,
        isNewConversation: false,
        userMessageId: "user-message-child",
      })
    );
    mocks.getConversation.mockResolvedValue(new Ok(childConversation));
    mocks.prodAPICredentialsForOwner.mockResolvedValue({});
  });

  it("requests child cancellation on user cancellation", async () => {
    const controller = new AbortController();
    mocks.streamAgentAnswerEvents.mockResolvedValue(
      new Ok({
        eventStream: abortingStream(
          controller,
          new CancelledFailure("CANCELLED")
        ),
      })
    );

    const result = await runAgentWithSignal(controller.signal);

    expect(result.isErr()).toBe(true);
    expect(mocks.cancelAgentLoop).toHaveBeenCalledWith(auth, {
      conversationId: "conv-child",
      messageIds: ["agent-message-child"],
    });
  });

  it("propagates deploy interruption without cancelling the child", async () => {
    const controller = new AbortController();
    mocks.streamAgentAnswerEvents.mockResolvedValue(
      new Ok({
        eventStream: abortingStream(
          controller,
          DUST_WORKER_SHUTDOWN_ABORT_REASON
        ),
      })
    );

    await expect(runAgentWithSignal(controller.signal)).rejects.toMatchObject({
      type: TOOL_DEPLOY_INTERRUPTION_ERROR_TYPE,
    });
    expect(mocks.cancelAgentLoop).not.toHaveBeenCalled();
    expect(mocks.getConversation).toHaveBeenCalledWith({
      conversationId: "conv-child",
    });
  });
});
