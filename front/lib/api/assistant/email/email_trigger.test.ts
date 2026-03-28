import {
  ASSISTANT_EMAIL_SUBDOMAIN,
  buildEmailUserMessage,
  buildReplyThreadingHeaders,
  parseEmailReplyContext,
} from "@app/lib/api/assistant/email/email_trigger";
import { describe, expect, it } from "vitest";

const TEST_EMAIL_AUTH = { SPF: "pass", dkim: [], dkimRaw: "" };

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
