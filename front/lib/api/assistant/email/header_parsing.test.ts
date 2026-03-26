import {
  extractEmailAddressesFromHeader,
  extractSingleEmailAddressFromHeader,
  parseHeaderValue,
} from "@app/lib/api/assistant/email/header_parsing";
import { describe, expect, it } from "vitest";

describe("extractEmailAddressesFromHeader", () => {
  it("ignores malformed angle-bracket content that only partially looks like an email", () => {
    expect(
      extractEmailAddressesFromHeader(
        "Sender <mailto:sender@dust.tt>, sender@dust.tt"
      )
    ).toEqual(["sender@dust.tt"]);
  });
});

describe("extractSingleEmailAddressFromHeader", () => {
  it("extracts the single mailbox from a From header", () => {
    const result = extractSingleEmailAddressFromHeader(
      "From",
      "Sender Name <Sender@dust.tt>"
    );

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw result.error;
    }

    expect(result.value).toBe("sender@dust.tt");
  });

  it("rejects a From header with multiple mailboxes", () => {
    const result = extractSingleEmailAddressFromHeader(
      "From",
      "Sender <sender@dust.tt>, Other <other@dust.tt>"
    );

    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      throw new Error("Expected multiple From mailboxes to be rejected");
    }

    expect(result.error.message).toBe(
      "Expected exactly one mailbox in From header"
    );
  });
});

describe("parseHeaderValue", () => {
  it("unfolds folded header values", () => {
    const rawHeaders = [
      "From: Sender Name",
      " <sender@dust.tt>",
      "To: agent@dust.team",
    ].join("\r\n");

    expect(parseHeaderValue(rawHeaders, "From")).toBe(
      "Sender Name <sender@dust.tt>"
    );
  });
});
