import {
  ASSISTANT_EMAIL_SUBDOMAIN,
  buildReplyThreadingHeaders,
  buildSuccessReplyRecipients,
  MAX_REPLY_RECIPIENTS,
} from "@app/lib/api/assistant/email/email_trigger";
import { describe, expect, it } from "vitest";

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

  it("caps total recipients at MAX_REPLY_RECIPIENTS, dropping cc first", () => {
    const manyCC = Array.from(
      { length: MAX_REPLY_RECIPIENTS },
      (_, i) => `cc${i}@dust.tt`
    );
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
        to: ["teammate@dust.tt"],
        cc: manyCC,
        bcc: [],
      },
      attachments: [],
    });

    expect(recipients.to).toEqual(["sender@dust.tt", "teammate@dust.tt"]);
    expect(recipients.to.length + recipients.cc.length).toBe(
      MAX_REPLY_RECIPIENTS
    );
    expect(recipients.cc).toEqual(manyCC.slice(0, MAX_REPLY_RECIPIENTS - 2));
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
