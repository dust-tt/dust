import { verifySignature } from "@app/lib/webhook_source_server";
import { createHmac } from "crypto";
import { describe, expect, it } from "vitest";

const SECRET = "webhook-secret";
const BODY = JSON.stringify({ events: [{ id: "EV123" }] });

function sign(encoding: "hex" | "base64"): string {
  return createHmac("sha256", SECRET).update(BODY, "utf8").digest(encoding);
}

describe("verifySignature", () => {
  it.each([
    ["prefixed hex (GitHub)", `sha256=${sign("hex")}`],
    ["raw base64 (HelpScout)", sign("base64")],
    ["raw hex (GoCardless)", sign("hex")],
  ])("accepts %s", (_, signature) => {
    expect(
      verifySignature({
        signedContent: BODY,
        secret: SECRET,
        signature,
        algorithm: "sha256",
      })
    ).toBe(true);
  });

  it("rejects a raw hex digest computed from another secret", () => {
    const signature = createHmac("sha256", "other-secret")
      .update(BODY, "utf8")
      .digest("hex");

    expect(
      verifySignature({
        signedContent: BODY,
        secret: SECRET,
        signature,
        algorithm: "sha256",
      })
    ).toBe(false);
  });
});
