import {
  isAuthenticatedInboundSender,
  parseSendgridDkimResults,
} from "@app/lib/api/assistant/email/inbound_auth";
import { describe, expect, it } from "vitest";

describe("parseSendgridDkimResults", () => {
  it("parses a single passing signature", () => {
    expect(parseSendgridDkimResults("{@company.com : pass}")).toEqual([
      { domain: "company.com", result: "pass" },
    ]);
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
  });

  it("returns an empty list for non-SendGrid input", () => {
    expect(parseSendgridDkimResults("pass")).toEqual([]);
  });
});

describe("isAuthenticatedInboundSender", () => {
  it("accepts aligned sender and envelope domains when SPF and DKIM pass", () => {
    expect(
      isAuthenticatedInboundSender({
        auth: {
          SPF: "pass",
          dkim: [{ domain: "company.com", result: "pass" }],
          dkimRaw: "{@company.com : pass}",
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
          dkim: [{ domain: "company.com", result: "pass" }],
          dkimRaw: "{@company.com : pass}",
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

  it("accepts an aligned passing DKIM signature when other signatures fail", () => {
    expect(
      isAuthenticatedInboundSender({
        auth: {
          SPF: "pass",
          dkim: [
            { domain: "sendgrid.com", result: "pass" },
            { domain: "company.com", result: "fail" },
            { domain: "company.com", result: "pass" },
          ],
          dkimRaw:
            "{@sendgrid.com : pass, @company.com : fail, @company.com : pass}",
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
});
