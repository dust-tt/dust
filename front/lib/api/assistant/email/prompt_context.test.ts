import { buildEmailResponseAudienceContext } from "@app/lib/api/assistant/email/prompt_context";
import { describe, expect, it } from "vitest";

describe("buildEmailResponseAudienceContext", () => {
  it("renders sender-only audience context", () => {
    const context = buildEmailResponseAudienceContext({
      replyTo: ["sender@example.com"],
      replyCc: [],
    });

    expect(context).toContain("The user sent you this message by email.");
    expect(context).toContain(
      "Your response will be sent as an email reply only to:"
    );
    expect(context).toContain("To: sender@example.com");
    expect(context).not.toContain("\nCc: ");
  });

  it("renders to and cc recipients", () => {
    const context = buildEmailResponseAudienceContext({
      replyTo: ["sender@example.com", "teammate@example.com"],
      replyCc: ["observer@example.com"],
    });

    expect(context).toContain(
      "Your response will be sent as an email reply to these recipients:"
    );
    expect(context).toContain("To: sender@example.com, teammate@example.com");
    expect(context).toContain("Cc: observer@example.com");
    expect(context).toContain(
      "Assume all listed recipients will read your response."
    );
  });

  it("renders a generic fallback when reply context is unavailable", () => {
    const context = buildEmailResponseAudienceContext(null);

    expect(context).toContain(
      "Your response will be sent as an email reply to the sender and possibly other recipients on the thread."
    );
    expect(context).not.toContain("\nTo: ");
    expect(context).not.toContain("\nCc: ");
  });
});
