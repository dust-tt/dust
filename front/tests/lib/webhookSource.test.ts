import { verifySignature } from "@app/lib/webhookSource";
import { createHmac } from "crypto";
import { describe, expect, test } from "vitest";

describe("verifySignature", function () {
  const secret = "my-webhook-secret";
  const body = JSON.stringify({ action: "created", id: 42 });

  // A raw body with formatting that differs from JSON.stringify output,
  // simulating what a real provider like HelpScout would send.
  const rawBodyWithWhitespace = '{ "action": "created",  "id": 42 }';

  test("accepts prefixed hex signature (GitHub-style)", function () {
    const sig = `sha256=${createHmac("sha256", secret).update(body, "utf8").digest("hex")}`;

    expect(
      verifySignature({
        signedContent: body,
        secret,
        signature: sig,
        algorithm: "sha256",
      })
    ).toBe(true);
  });

  test("accepts raw base64 signature (HelpScout-style, sha1)", function () {
    const sig = createHmac("sha1", secret)
      .update(body, "utf8")
      .digest("base64");

    expect(
      verifySignature({
        signedContent: body,
        secret,
        signature: sig,
        algorithm: "sha1",
      })
    ).toBe(true);
  });

  test("accepts raw base64 signature (sha256)", function () {
    const sig = createHmac("sha256", secret)
      .update(body, "utf8")
      .digest("base64");

    expect(
      verifySignature({
        signedContent: body,
        secret,
        signature: sig,
        algorithm: "sha256",
      })
    ).toBe(true);
  });

  test("verifies against raw body, not re-serialized JSON", function () {
    const sig = createHmac("sha1", secret)
      .update(rawBodyWithWhitespace, "utf8")
      .digest("base64");

    // Passes when signedContent is the raw body.
    expect(
      verifySignature({
        signedContent: rawBodyWithWhitespace,
        secret,
        signature: sig,
        algorithm: "sha1",
      })
    ).toBe(true);

    // Fails when signedContent is the re-serialized body (whitespace differs).
    expect(
      verifySignature({
        signedContent: JSON.stringify(JSON.parse(rawBodyWithWhitespace)),
        secret,
        signature: sig,
        algorithm: "sha1",
      })
    ).toBe(false);
  });

  test("rejects wrong secret", function () {
    const sig = createHmac("sha256", "wrong-secret")
      .update(body, "utf8")
      .digest("base64");

    expect(
      verifySignature({
        signedContent: body,
        secret,
        signature: sig,
        algorithm: "sha256",
      })
    ).toBe(false);
  });

  test("rejects empty signature", function () {
    expect(
      verifySignature({
        signedContent: body,
        secret,
        signature: "",
        algorithm: "sha256",
      })
    ).toBe(false);
  });

  test("rejects empty secret", function () {
    expect(
      verifySignature({
        signedContent: body,
        secret: "",
        signature: "sha256=abc",
        algorithm: "sha256",
      })
    ).toBe(false);
  });

  test("rejects garbage signature", function () {
    expect(
      verifySignature({
        signedContent: body,
        secret,
        signature: "not-a-valid-signature",
        algorithm: "sha256",
      })
    ).toBe(false);
  });
});
