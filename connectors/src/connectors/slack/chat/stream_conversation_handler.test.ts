import type { SlackStreamHandler } from "@connectors/connectors/slack/chat/slack_stream_handler";
import type { SlackUserInfo } from "@connectors/connectors/slack/lib/slack_client";
import type { SlackChatBotMessageModel } from "@connectors/lib/models/slack";
import type { ConnectorResource } from "@connectors/resources/connector_resource";
import type {
  AgentEvent,
  ConversationPublicType,
  DustAPI,
  UserMessageType,
} from "@dust-tt/client";
import { Ok } from "@dust-tt/client";
import type { WebClient } from "@slack/web-api";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockMakeConversationUrl = vi.hoisted(() =>
  vi.fn(
    (workspaceId: string, conversationId: string | null | undefined) =>
      conversationId
        ? `https://dust.test/w/${workspaceId}/conversation/${conversationId}`
        : null
  )
);

vi.mock("@connectors/lib/bot/conversation_utils", () => ({
  makeConversationUrl: mockMakeConversationUrl,
}));

import { streamConversationToSlack } from "./stream_conversation_handler";

describe("streamConversationToSlack", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("cancels the blocked agent message when Slack user-action controls fail", async () => {
    const invalidBlocksError = Object.assign(new Error("invalid_blocks"), {
      data: { error: "invalid_blocks" },
    });
    const toolAskUserQuestionEvent = {
      type: "tool_ask_user_question",
      actionId: "action_1",
      configurationId: "agent_1",
      conversationId: "conv_1",
      created: Date.now(),
      inputs: {},
      messageId: "agent_msg_1",
      metadata: {
        agentName: "Support",
        mcpServerName: "server",
        mcpServerDisplayName: "Server",
        toolName: "ask",
      },
      question: {
        question: "Which option?",
        options: [{ label: "One" }],
        multiSelect: false,
      },
      stake: "low",
    } as AgentEvent;

    async function* eventStream() {
      yield toolAskUserQuestionEvent;
    }

    const dustAPI = {
      streamAgentAnswerEvents: vi.fn(async () => {
        return new Ok({ eventStream: eventStream() });
      }),
      cancelMessageGeneration: vi.fn(async () => {
        return new Ok({ success: true });
      }),
    };
    const slackClient = {
      chat: {
        postEphemeral: vi.fn(async () => {
          throw invalidBlocksError;
        }),
        postMessage: vi.fn(async () => ({ ts: "fallback_ts" })),
        delete: vi.fn(async () => ({ ok: true })),
      },
    } as unknown as WebClient;
    const streamHandler = {
      messageTs: "stream_ts",
      stop: vi.fn(async () => undefined),
      setThinking: vi.fn(async () => undefined),
      appendText: vi.fn(async () => undefined),
      isStopped: false,
    } as unknown as SlackStreamHandler;

    const res = await streamConversationToSlack(dustAPI as unknown as DustAPI, {
      assistantName: "Support",
      agentConfigurations: [],
      connector: {
        id: 123,
        workspaceId: "w_test",
      } as ConnectorResource,
      conversation: {
        sId: "conv_1",
        content: [],
      } as unknown as ConversationPublicType,
      feedbackVisibleToAuthorOnly: true,
      slack: {
        slackChannelId: "C123",
        slackClient,
        slackMessageTs: "1700000000.000001",
        slackTeamId: "T123",
        slackUserId: "U123",
        slackUserInfo: {
          is_bot: false,
        } as unknown as SlackUserInfo,
      },
      slackChatBotMessage: {
        id: 42,
      } as SlackChatBotMessageModel,
      streamHandler,
      userMessage: {
        sId: "user_msg_1",
      } as UserMessageType,
    });

    expect(res.isOk()).toBe(true);
    if (res.isErr()) {
      throw res.error;
    }
    expect(dustAPI.cancelMessageGeneration).toHaveBeenCalledWith({
      conversationId: "conv_1",
      messageIds: ["agent_msg_1"],
    });
    expect(streamHandler.stop).toHaveBeenCalled();
    expect(slackClient.chat.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "C123",
        text: expect.stringContaining("could not display"),
        thread_ts: "1700000000.000001",
      })
    );
  });
});
