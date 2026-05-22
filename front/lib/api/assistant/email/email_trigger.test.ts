import type { BlockedToolExecution } from "@app/lib/actions/mcp";
import type { InboundEmail } from "@app/lib/api/assistant/email/email_trigger";
import {
  ASSISTANT_EMAIL_SUBDOMAIN,
  buildEmailUserMessage,
  buildReplyThreadingHeaders,
  parseEmailReplyContext,
  sendToolValidationEmail,
  userAndWorkspaceFromEmail,
} from "@app/lib/api/assistant/email/email_trigger";
import { sendEmail } from "@app/lib/api/email";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { LightWorkspaceType } from "@app/types/user";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetAppUrl,
  mockGetCurrentRegion,
  mockGetEmailValidationSecret,
  mockSendEmail,
  mockSendEmailToRecipients,
} = vi.hoisted(() => ({
  mockGetAppUrl: vi.fn(),
  mockGetCurrentRegion: vi.fn(),
  mockGetEmailValidationSecret: vi.fn(),
  mockSendEmail: vi.fn(),
  mockSendEmailToRecipients: vi.fn(),
}));

vi.mock("@app/lib/api/config", () => ({
  default: {
    getAppUrl: mockGetAppUrl,
    getEmailValidationSecret: mockGetEmailValidationSecret,
  },
}));

vi.mock("@app/lib/api/email", () => ({
  sendEmail: mockSendEmail,
  sendEmailToRecipients: mockSendEmailToRecipients,
}));

vi.mock("@app/lib/api/regions/config", () => ({
  config: {
    getCurrentRegion: mockGetCurrentRegion,
  },
}));

const TEST_EMAIL_AUTH = { SPF: "pass", dkim: [], dkimRaw: "" };

beforeEach(() => {
  vi.clearAllMocks();

  mockGetAppUrl.mockReturnValue("https://dust.tt");
  mockGetCurrentRegion.mockReturnValue("europe-west1");
  mockGetEmailValidationSecret.mockReturnValue("test-email-validation-secret");
  mockSendEmail.mockResolvedValue(undefined);
});

describe("buildEmailUserMessage", () => {
  it("keeps thread context but replies only to the sender", () => {
    const message = buildEmailUserMessage({
      email: {
        subject: "Test",
        text: "Hello",
        auth: TEST_EMAIL_AUTH,
        threadingHeaders: {
          messageId: null,
          inReplyTo: null,
          references: null,
        },
        sender: {
          email: "sender@dust.tt",
          full: "Sender <sender@dust.tt>",
        },
        envelope: {
          from: "bounce@mailer.dust.tt",
          to: [`agent@${ASSISTANT_EMAIL_SUBDOMAIN}`, "teammate@dust.tt"],
          cc: [`other-agent@${ASSISTANT_EMAIL_SUBDOMAIN}`, "observer@dust.tt"],
          bcc: ["hidden@dust.tt"],
        },
        attachments: [],
      },
      userMessage: "Can you summarize this thread?",
      hasThreadHistory: false,
      attachmentCount: 0,
    });

    expect(message).toContain(
      `<email_to>agent@${ASSISTANT_EMAIL_SUBDOMAIN}, teammate@dust.tt</email_to>`
    );
    expect(message).toContain(
      `<email_cc>other-agent@${ASSISTANT_EMAIL_SUBDOMAIN}, observer@dust.tt</email_cc>`
    );
    expect(message).toContain(
      `<dust_agent_recipients>agent@${ASSISTANT_EMAIL_SUBDOMAIN}, other-agent@${ASSISTANT_EMAIL_SUBDOMAIN}</dust_agent_recipients>`
    );
    expect(message).toContain(
      "<email_response_to>sender@dust.tt</email_response_to>"
    );
    expect(message).not.toContain("<email_response_cc>");
    expect(message).toContain("only to me, the sender above.");
  });
});

describe("parseEmailReplyContext", () => {
  it("accepts legacy Redis payloads that still contain reply-all fields", () => {
    const parsed = parseEmailReplyContext(
      JSON.stringify({
        subject: "Test",
        originalText: "Hello",
        fromEmail: "sender@dust.tt",
        fromFull: "Sender <sender@dust.tt>",
        replyTo: ["sender@dust.tt", "observer@dust.tt"],
        replyCc: ["security@dust.tt"],
        threadingMessageId: "<incoming-message-id@dust.tt>",
        threadingInReplyTo: null,
        threadingReferences: null,
        agentConfigurationId: "agent-config-1",
        workspaceId: "workspace-1",
        conversationId: "conversation-1",
      }),
      "agent-message-1",
      "email-reply-context:workspace-1:agent-message-1"
    );

    expect(parsed).toMatchObject({
      fromEmail: "sender@dust.tt",
      agentConfigurationId: "agent-config-1",
      workspaceId: "workspace-1",
      conversationId: "conversation-1",
    });
    expect(parsed).not.toHaveProperty("replyTo");
    expect(parsed).not.toHaveProperty("replyCc");
  });
});

describe("userAndWorkspaceFromEmail", () => {
  it("does not classify disabled email agents as a missing workspace", async () => {
    const workspace = await WorkspaceFactory.basic();
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "admin" });

    const result = await userAndWorkspaceFromEmail({ email: user.email });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe("invalid_email_error");
      expect(result.error.message).toBe(
        "Email interactions with agents are not enabled for any of your workspaces."
      );
    }
  });
});

describe("buildReplyThreadingHeaders", () => {
  it("uses the inbound message-id for in-reply-to and references", () => {
    const threadingHeaders = buildReplyThreadingHeaders({
      subject: "Test",
      text: "Hello",
      auth: TEST_EMAIL_AUTH,
      threadingHeaders: {
        messageId: "<incoming-message-id@dust.tt>",
        inReplyTo: null,
        references: null,
      },
      sender: {
        email: "sender@dust.tt",
        full: "Sender <sender@dust.tt>",
      },
      envelope: {
        from: "bounce@mailer.dust.tt",
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
      auth: TEST_EMAIL_AUTH,
      threadingHeaders: {
        messageId: "<incoming-message-id@dust.tt>",
        inReplyTo: null,
        references: "<older-message-id@dust.tt>",
      },
      sender: {
        email: "sender@dust.tt",
        full: "Sender <sender@dust.tt>",
      },
      envelope: {
        from: "bounce@mailer.dust.tt",
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
      auth: TEST_EMAIL_AUTH,
      threadingHeaders: {
        messageId: "<incoming-message-id@dust.tt>",
        inReplyTo: null,
        references: "<older-message-id@dust.tt> <incoming-message-id@dust.tt>",
      },
      sender: {
        email: "sender@dust.tt",
        full: "Sender <sender@dust.tt>",
      },
      envelope: {
        from: "bounce@mailer.dust.tt",
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

describe("sendToolValidationEmail", () => {
  it("adds region metadata to approval links", async () => {
    await sendToolValidationEmail({
      email: makeInboundEmail(),
      agentConfiguration: {
        name: "approvals",
      } as LightAgentConfigurationType,
      blockedActions: [makeBlockedAction()],
      conversation: { sId: "conversation-1" },
      workspace: { sId: "workspace-1" } as LightWorkspaceType,
    });

    expect(sendEmail).toHaveBeenCalledOnce();

    const [[recipient, message]] = mockSendEmail.mock.calls;
    expect(recipient).toBe("sender@dust.tt");
    expect(message).toMatchObject({ html: expect.any(String) });

    const validationUrls = [...message.html.matchAll(/href="([^"]+)"/g)]
      .map((match) => match[1])
      .filter((href) => href.includes("/email/validation"));

    expect(validationUrls).toHaveLength(2);
    const approvalStates = validationUrls.map((href) => {
      const url = new URL(href);
      expect(url.origin + url.pathname).toBe(
        "https://dust.tt/email/validation"
      );
      expect(url.searchParams.get("region")).toBe("europe-west1");
      expect(url.searchParams.has("regionUrl")).toBe(false);

      const token = url.searchParams.get("token");
      if (!token) {
        throw new Error("Expected validation token");
      }
      const [payload] = token.split(".");
      return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))
        .approvalState;
    });

    expect(approvalStates).toEqual(["approved", "rejected"]);
  });
});

function makeInboundEmail(): InboundEmail {
  return {
    subject: "Approve this tool",
    text: "Please approve the pending tool.",
    auth: TEST_EMAIL_AUTH,
    threadingHeaders: {
      messageId: "<incoming-message-id@dust.tt>",
      inReplyTo: null,
      references: null,
    },
    sender: {
      email: "sender@dust.tt",
      full: "Sender <sender@dust.tt>",
    },
    envelope: {
      from: "bounce@mailer.dust.tt",
      to: [`approvals@${ASSISTANT_EMAIL_SUBDOMAIN}`],
      cc: [],
      bcc: [],
    },
    attachments: [],
  };
}

function makeBlockedAction(): BlockedToolExecution {
  const blockedAction: BlockedToolExecution = {
    conversationId: "conversation-1",
    messageId: "message-1",
    actionId: "action-1",
    configurationId: "agent-config-1",
    created: Date.now(),
    metadata: {
      toolName: "write_report",
      mcpServerName: "project_tools",
      agentName: "approvals",
    },
    inputs: {
      title: "Q2 report",
    },
    status: "blocked_validation_required",
    authorizationInfo: null,
  };

  return blockedAction;
}
