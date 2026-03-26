import type { InboundEmail } from "@app/lib/api/assistant/email/email_trigger";
import {
  domainsAlign,
  evaluateInboundAuth,
  parseSendgridDkimResults,
} from "@app/lib/api/assistant/email/inbound_auth";
import logger from "@app/logger/logger";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/logger/logger", () => ({
  default: {
    warn: vi.fn(),
  },
}));

function makeEmail(
  overrides: Partial<{
    senderEmail: string;
    envelopeFrom: string;
    SPF: string;
    dkim: { domain: string; result: string }[];
  }> = {}
): Pick<InboundEmail, "auth" | "sender" | "envelope"> {
  return {
    auth: {
      SPF: overrides.SPF ?? "pass",
      dkim: overrides.dkim ?? [{ domain: "company.com", result: "pass" }],
      dkimRaw: "",
    },
    sender: {
      email: overrides.senderEmail ?? "alice@company.com",
      full: `Alice <${overrides.senderEmail ?? "alice@company.com"}>`,
    },
    envelope: {
      from: overrides.envelopeFrom ?? "bounce@company.com",
      to: [],
      cc: [],
      bcc: [],
    },
  };
}

describe("parseSendgridDkimResults", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("parses a single passing signature", () => {
    expect(parseSendgridDkimResults("{@company.com : pass}")).toEqual([
      { domain: "company.com", result: "pass" },
    ]);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("parses multiple signatures in a single SendGrid hash", () => {
    expect(
      parseSendgridDkimResults(
        "{@company.com : pass, @sendgrid.com : temperror}"
      )
    ).toEqual([
      { domain: "company.com", result: "pass" },
      { domain: "sendgrid.com", result: "temperror" },
    ]);
  });

  it("parses repeated brace entries with extra whitespace", () => {
    expect(
      parseSendgridDkimResults(
        " {  @company.com : pass } , { @sendgrid.com : fail } "
      )
    ).toEqual([
      { domain: "company.com", result: "pass" },
      { domain: "sendgrid.com", result: "fail" },
    ]);
  });

  it("returns an empty list for malformed input", () => {
    expect(parseSendgridDkimResults("{@company.com : pass, broken}")).toEqual(
      []
    );
    expect(logger.warn).toHaveBeenCalledWith(
      {
        rawDkim: "{@company.com : pass, broken}",
        reason: "malformed_dkim_entry",
        entry: "broken",
        parsedEntryCount: 1,
      },
      "[email] Failed to parse SendGrid DKIM results"
    );
  });

  it("returns an empty list for non-SendGrid input", () => {
    expect(parseSendgridDkimResults("pass")).toEqual([]);
    expect(logger.warn).toHaveBeenCalledWith(
      {
        rawDkim: "pass",
        reason: "missing_enclosing_braces",
        entry: undefined,
        parsedEntryCount: undefined,
      },
      "[email] Failed to parse SendGrid DKIM results"
    );
  });

  it("returns an empty list and logs when the DKIM payload is empty", () => {
    expect(parseSendgridDkimResults("{}")).toEqual([]);
    expect(logger.warn).toHaveBeenCalledWith(
      {
        rawDkim: "{}",
        reason: "empty_dkim_results",
        entry: undefined,
        parsedEntryCount: undefined,
      },
      "[email] Failed to parse SendGrid DKIM results"
    );
  });
});

describe("domainsAlign", () => {
  it("returns true for identical domains", () => {
    expect(domainsAlign("company.com", "company.com")).toBe(true);
  });

  it("returns true when one is a subdomain of the other", () => {
    expect(domainsAlign("mail.company.com", "company.com")).toBe(true);
    expect(domainsAlign("company.com", "mail.company.com")).toBe(true);
  });

  it("returns false for unrelated domains", () => {
    expect(domainsAlign("company.com", "other.com")).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(domainsAlign("Company.COM", "company.com")).toBe(true);
  });

  it("does not align on partial suffix matches", () => {
    // "evilcompany.com" should not align with "company.com".
    expect(domainsAlign("evilcompany.com", "company.com")).toBe(false);
  });
});

describe("evaluateInboundAuth", () => {
  it("accepts when aligned DKIM passes, even if SPF fails", () => {
    const decision = evaluateInboundAuth(
      makeEmail({
        senderEmail: "alice@company.com",
        dkim: [{ domain: "company.com", result: "pass" }],
        SPF: "fail",
      })
    );

    expect(decision.authenticated).toBe(true);
    expect(decision.reason).toBe("aligned_dkim");
  });

  it("accepts when SPF passes with aligned envelope domain and no passing DKIM", () => {
    const decision = evaluateInboundAuth(
      makeEmail({
        senderEmail: "alice@company.com",
        envelopeFrom: "bounce@company.com",
        SPF: "pass",
        dkim: [{ domain: "company.com", result: "fail" }],
      })
    );

    expect(decision.authenticated).toBe(true);
    expect(decision.reason).toBe("aligned_spf");
  });

  it("rejects when DKIM passes for a non-aligned domain", () => {
    const decision = evaluateInboundAuth(
      makeEmail({
        senderEmail: "alice@company.com",
        dkim: [{ domain: "other.com", result: "pass" }],
        SPF: "fail",
        envelopeFrom: "bounce@other.com",
      })
    );

    expect(decision.authenticated).toBe(false);
    expect(decision.reason).toBeUndefined();
  });

  it("rejects when SPF passes for a non-aligned envelope domain", () => {
    const decision = evaluateInboundAuth(
      makeEmail({
        senderEmail: "alice@company.com",
        envelopeFrom: "bounce@other.com",
        SPF: "pass",
        dkim: [],
      })
    );

    expect(decision.authenticated).toBe(false);
  });

  it("accepts forwarded mail where SPF fails but aligned DKIM survives", () => {
    const decision = evaluateInboundAuth(
      makeEmail({
        senderEmail: "alice@company.com",
        envelopeFrom: "forwarder@relay.net",
        SPF: "fail",
        dkim: [
          { domain: "relay.net", result: "pass" },
          { domain: "company.com", result: "pass" },
        ],
      })
    );

    expect(decision.authenticated).toBe(true);
    expect(decision.reason).toBe("aligned_dkim");
  });

  it("accepts when DKIM passes on a subdomain of the From: domain (relaxed alignment)", () => {
    const decision = evaluateInboundAuth(
      makeEmail({
        senderEmail: "alice@company.com",
        dkim: [{ domain: "mail.company.com", result: "pass" }],
        SPF: "fail",
      })
    );

    expect(decision.authenticated).toBe(true);
    expect(decision.reason).toBe("aligned_dkim");
  });

  it("accepts when envelope-from is a subdomain of the From: domain (relaxed SPF alignment)", () => {
    const decision = evaluateInboundAuth(
      makeEmail({
        senderEmail: "alice@company.com",
        envelopeFrom: "bounce@mail.company.com",
        SPF: "pass",
        dkim: [],
      })
    );

    expect(decision.authenticated).toBe(true);
    expect(decision.reason).toBe("aligned_spf");
  });

  it("accepts an aligned passing DKIM signature when other signatures fail", () => {
    const decision = evaluateInboundAuth(
      makeEmail({
        senderEmail: "alice@company.com",
        envelopeFrom: "bounce@company.com",
        SPF: "pass",
        dkim: [
          { domain: "sendgrid.com", result: "pass" },
          { domain: "company.com", result: "fail" },
          { domain: "company.com", result: "pass" },
        ],
      })
    );

    expect(decision.authenticated).toBe(true);
    expect(decision.reason).toBe("aligned_dkim");
  });

  it("populates the decision with raw signals for debugging", () => {
    const dkim = [{ domain: "company.com", result: "pass" }];
    const decision = evaluateInboundAuth(
      makeEmail({
        senderEmail: "alice@company.com",
        envelopeFrom: "bounce@company.com",
        SPF: "pass",
        dkim,
      })
    );

    expect(decision.headerFromDomain).toBe("company.com");
    expect(decision.spfResult).toBe("pass");
    expect(decision.spfEnvelopeDomain).toBe("company.com");
    expect(decision.dkimEntries).toEqual(dkim);
  });
});
