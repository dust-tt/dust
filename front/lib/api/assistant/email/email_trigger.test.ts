import { Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createConversationMock,
  postNewContentFragmentMock,
  postUserMessageMock,
  runAgentLoopWorkflowMock,
  redisSetMock,
  getRedisStreamClientMock,
  serializeMentionMock,
  loggerMock,
} = vi.hoisted(() => {
  const logger = {
    child: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  logger.child.mockReturnValue(logger);

  return {
    createConversationMock: vi.fn(),
    postNewContentFragmentMock: vi.fn(),
    postUserMessageMock: vi.fn(),
    runAgentLoopWorkflowMock: vi.fn(),
    redisSetMock: vi.fn(),
    getRedisStreamClientMock: vi.fn(),
    serializeMentionMock: vi.fn(),
    loggerMock: logger,
  };
});

vi.mock("@app/lib/api/assistant/conversation", async (importActual) => {
  const actual =
    await importActual<typeof import("@app/lib/api/assistant/conversation")>();

  return {
    ...actual,
    createConversation: createConversationMock,
    postNewContentFragment: postNewContentFragmentMock,
    postUserMessage: postUserMessageMock,
  };
});

vi.mock("@app/lib/api/assistant/conversation/agent_loop", () => ({
  runAgentLoopWorkflow: runAgentLoopWorkflowMock,
}));

vi.mock("@app/lib/api/redis", () => ({
  getRedisStreamClient: getRedisStreamClientMock,
}));

vi.mock("@app/lib/mentions/format", async (importActual) => {
  const actual =
    await importActual<typeof import("@app/lib/mentions/format")>();

  return {
    ...actual,
    serializeMention: serializeMentionMock,
  };
});

vi.mock("@app/logger/logger", () => ({
  default: loggerMock,
}));

import {
  ASSISTANT_EMAIL_SUBDOMAIN,
  buildReplyThreadingHeaders,
  buildSuccessReplyRecipients,
  triggerFromEmail,
} from "@app/lib/api/assistant/email/email_trigger";

beforeEach(() => {
  vi.clearAllMocks();
  loggerMock.child.mockReturnValue(loggerMock);
  getRedisStreamClientMock.mockResolvedValue({
    set: redisSetMock,
  });
  serializeMentionMock.mockImplementation((agent: { name: string }) => {
    return `@${agent.name}`;
  });
});

describe("buildSuccessReplyRecipients", () => {
  it("returns sender-only recipients when no human to/cc recipients exist", () => {
    const recipients = buildSuccessReplyRecipients({
      subject: "Test",
      text: "Hello",
      auth: { SPF: "pass", dkim: "pass" },
      threadingHeaders: {
        messageId: null,
        inReplyTo: null,
        references: null,
      },
      envelope: {
        from: "sender@dust.tt",
        full: "Sender <sender@dust.tt>",
        to: [`agent@${ASSISTANT_EMAIL_SUBDOMAIN}`],
        cc: [],
        bcc: ["hidden@dust.tt"],
      },
      attachments: [],
    });

    expect(recipients).toEqual({
      to: ["sender@dust.tt"],
      cc: [],
    });
  });

  it("includes original human to/cc recipients and excludes assistant recipients", () => {
    const recipients = buildSuccessReplyRecipients({
      subject: "Test",
      text: "Hello",
      auth: { SPF: "pass", dkim: "pass" },
      threadingHeaders: {
        messageId: null,
        inReplyTo: null,
        references: null,
      },
      envelope: {
        from: "sender@dust.tt",
        full: "Sender <sender@dust.tt>",
        to: [`agent@${ASSISTANT_EMAIL_SUBDOMAIN}`, "teammate@dust.tt"],
        cc: [`other-agent@${ASSISTANT_EMAIL_SUBDOMAIN}`, "observer@dust.tt"],
        bcc: ["hidden@dust.tt"],
      },
      attachments: [],
    });

    expect(recipients).toEqual({
      to: ["sender@dust.tt", "teammate@dust.tt"],
      cc: ["observer@dust.tt"],
    });
  });

  it("deduplicates recipients across to and cc", () => {
    const recipients = buildSuccessReplyRecipients({
      subject: "Test",
      text: "Hello",
      auth: { SPF: "pass", dkim: "pass" },
      threadingHeaders: {
        messageId: null,
        inReplyTo: null,
        references: null,
      },
      envelope: {
        from: "sender@dust.tt",
        full: "Sender <sender@dust.tt>",
        to: ["Sender@dust.tt", "teammate@dust.tt", "teammate@dust.tt"],
        cc: ["teammate@dust.tt", "observer@dust.tt", "observer@dust.tt"],
        bcc: [],
      },
      attachments: [],
    });

    expect(recipients).toEqual({
      to: ["sender@dust.tt", "teammate@dust.tt"],
      cc: ["observer@dust.tt"],
    });
  });
});

describe("buildReplyThreadingHeaders", () => {
  it("uses the inbound message-id for in-reply-to and references", () => {
    const threadingHeaders = buildReplyThreadingHeaders({
      subject: "Test",
      text: "Hello",
      auth: { SPF: "pass", dkim: "pass" },
      threadingHeaders: {
        messageId: "<incoming-message-id@dust.tt>",
        inReplyTo: null,
        references: null,
      },
      envelope: {
        from: "sender@dust.tt",
        full: "Sender <sender@dust.tt>",
        to: [],
        cc: [],
        bcc: [],
      },
      attachments: [],
    });

    expect(threadingHeaders).toEqual({
      inReplyTo: "<incoming-message-id@dust.tt>",
      references: "<incoming-message-id@dust.tt>",
    });
  });

  it("appends in-reply-to to references when missing", () => {
    const threadingHeaders = buildReplyThreadingHeaders({
      subject: "Test",
      text: "Hello",
      auth: { SPF: "pass", dkim: "pass" },
      threadingHeaders: {
        messageId: "<incoming-message-id@dust.tt>",
        inReplyTo: null,
        references: "<older-message-id@dust.tt>",
      },
      envelope: {
        from: "sender@dust.tt",
        full: "Sender <sender@dust.tt>",
        to: [],
        cc: [],
        bcc: [],
      },
      attachments: [],
    });

    expect(threadingHeaders).toEqual({
      inReplyTo: "<incoming-message-id@dust.tt>",
      references: "<older-message-id@dust.tt> <incoming-message-id@dust.tt>",
    });
  });

  it("does not duplicate in-reply-to in references", () => {
    const threadingHeaders = buildReplyThreadingHeaders({
      subject: "Test",
      text: "Hello",
      auth: { SPF: "pass", dkim: "pass" },
      threadingHeaders: {
        messageId: "<incoming-message-id@dust.tt>",
        inReplyTo: null,
        references: "<older-message-id@dust.tt> <incoming-message-id@dust.tt>",
      },
      envelope: {
        from: "sender@dust.tt",
        full: "Sender <sender@dust.tt>",
        to: [],
        cc: [],
        bcc: [],
      },
      attachments: [],
    });

    expect(threadingHeaders).toEqual({
      inReplyTo: "<incoming-message-id@dust.tt>",
      references: "<older-message-id@dust.tt> <incoming-message-id@dust.tt>",
    });
  });
});

describe("triggerFromEmail", () => {
  it("stores email reply context before launching the agent loop", async () => {
    const conversation = { sId: "conv_123" };
    const userMessage = { sId: "msg_123", version: 0 };
    const agentMessages = [
      {
        sId: "agent_msg_123",
        configuration: { sId: "agent_config_123" },
      },
    ];
    const auth = {
      user: () => ({
        id: 1,
        username: "sender",
        email: "sender@dust.tt",
        imageUrl: null,
        fullName: () => "Sender",
      }),
      workspace: () => ({
        sId: "ws_123",
      }),
      getNonNullableWorkspace: () => ({
        sId: "ws_123",
      }),
    };

    createConversationMock.mockResolvedValue(conversation);
    postUserMessageMock.mockResolvedValue(
      new Ok({
        userMessage,
        agentMessages,
      })
    );

    const result = await triggerFromEmail({
      auth: auth as never,
      agentConfigurations: [
        {
          sId: "agent_config_123",
          name: "Support",
        } as never,
      ],
      email: {
        subject: "Need help",
        text: "Can you help?",
        auth: { SPF: "pass", dkim: "pass" },
        threadingHeaders: {
          messageId: "<message-id@dust.tt>",
          inReplyTo: null,
          references: null,
        },
        envelope: {
          from: "sender@dust.tt",
          full: "Sender <sender@dust.tt>",
          to: [`support@${ASSISTANT_EMAIL_SUBDOMAIN}`, "teammate@dust.tt"],
          cc: ["observer@dust.tt"],
          bcc: [],
        },
        attachments: [],
      },
    });

    expect(result.isOk()).toBe(true);
    expect(postUserMessageMock).toHaveBeenCalledWith(
      auth,
      expect.objectContaining({
        triggerAgentLoop: false,
      })
    );
    expect(redisSetMock).toHaveBeenCalledTimes(1);
    expect(runAgentLoopWorkflowMock).toHaveBeenCalledWith({
      auth,
      agentMessages,
      conversation,
      userMessage,
    });
    expect(redisSetMock.mock.invocationCallOrder[0]).toBeLessThan(
      runAgentLoopWorkflowMock.mock.invocationCallOrder[0]
    );
  });
});
