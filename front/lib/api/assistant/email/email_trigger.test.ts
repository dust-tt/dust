import {
  ASSISTANT_EMAIL_SUBDOMAIN,
  buildSuccessReplyRecipients,
} from "@app/lib/api/assistant/email/email_trigger";
import { describe, expect, it } from "vitest";

describe("buildSuccessReplyRecipients", () => {
  it("returns sender-only recipients when no human to/cc recipients exist", () => {
    const recipients = buildSuccessReplyRecipients({
      subject: "Test",
      text: "Hello",
      auth: { SPF: "pass", dkim: "pass" },
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
