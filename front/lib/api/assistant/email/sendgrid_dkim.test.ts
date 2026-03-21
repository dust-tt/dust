import { parseSendgridDkimResults } from "@app/lib/api/assistant/email/sendgrid_dkim";
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
