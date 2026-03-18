import { buildEmailResponseAudienceContext } from "@app/lib/api/assistant/email/prompt_context";
import { describe, expect, it } from "vitest";

describe("buildEmailResponseAudienceContext", () => {
  it("renders a generic email audience context", () => {
    const context = buildEmailResponseAudienceContext();

    expect(context).toContain("The user sent you this message by email.");
    expect(context).toContain(
      "You have access to the email thread content and any attachments available in this conversation."
    );
    expect(context).toContain(
      "Your response will be sent back by email and may be read by other people on the thread."
    );
    expect(context).toContain(
      "Write your response with that audience in mind."
    );
  });
});
