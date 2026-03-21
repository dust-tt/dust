import { isAuthenticatedInboundSender } from "@app/lib/api/assistant/email/inbound_auth";
import { describe, expect, it } from "vitest";

describe("isAuthenticatedInboundSender", () => {
  it("accepts aligned sender and envelope domains when SPF and DKIM pass", () => {
    expect(
      isAuthenticatedInboundSender({
        auth: {
          SPF: "pass",
          dkim: "{@company.com : pass}",
        },
        sender: {
          email: "alice@company.com",
          full: "Alice <alice@company.com>",
        },
        envelope: {
          from: "bounce@company.com",
          to: [],
          cc: [],
          bcc: [],
        },
      })
    ).toBe(true);
  });

  it("rejects a sender whose domain does not align with the authenticated envelope", () => {
    expect(
      isAuthenticatedInboundSender({
        auth: {
          SPF: "pass",
          dkim: "{@company.com : pass}",
        },
        sender: {
          email: "alice@other-company.com",
          full: "Alice <alice@other-company.com>",
        },
        envelope: {
          from: "bounce@company.com",
          to: [],
          cc: [],
          bcc: [],
        },
      })
    ).toBe(false);
  });
});
