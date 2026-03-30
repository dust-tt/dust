import { generateKeyPairSync, sign } from "node:crypto";
import {
  createBufferedRequestFromRawBody,
  isSendgridParseFormRequest,
  validateSendgridParseWebhookSignature,
  verifySendgridParseWebhookSignature,
} from "@app/lib/api/assistant/email/sendgrid_parse_webhook_signature";
import { IncomingForm } from "formidable";
import { describe, expect, it } from "vitest";

const { privateKey, publicKey } = generateKeyPairSync("ec", {
  namedCurve: "prime256v1",
});
const publicKeyPem = publicKey
  .export({ format: "pem", type: "spki" })
  .toString();
const publicKeyBase64 = publicKey
  .export({ format: "der", type: "spki" })
  .toString("base64");

function signWebhook({
  rawBody,
  timestamp,
}: {
  rawBody: Buffer;
  timestamp: string;
}): string {
  return sign(
    "sha256",
    Buffer.concat([Buffer.from(timestamp, "utf8"), rawBody]),
    privateKey
  ).toString("base64");
}

describe("verifySendgridParseWebhookSignature", () => {
  const multipartPayload = Buffer.from(
    [
      "--boundary",
      'Content-Disposition: form-data; name="text"',
      "",
      "hello world",
      "--boundary--",
      "",
    ].join("\r\n"),
    "utf8"
  );
  const timestamp = `${Math.floor(Date.now() / 1000)}`;

  it("accepts a valid signature for the exact raw multipart body", () => {
    const signature = signWebhook({
      rawBody: multipartPayload,
      timestamp,
    });

    expect(
      verifySendgridParseWebhookSignature({
        publicKey: publicKeyPem,
        rawBody: multipartPayload,
        signature,
        timestamp,
      })
    ).toBe(true);
  });

  it("accepts the SendGrid base64 public-key format", () => {
    const signature = signWebhook({
      rawBody: multipartPayload,
      timestamp,
    });

    expect(
      verifySendgridParseWebhookSignature({
        publicKey: publicKeyBase64,
        rawBody: multipartPayload,
        signature,
        timestamp,
      })
    ).toBe(true);
  });

  it("rejects the same payload when the raw bytes change", () => {
    const signature = signWebhook({
      rawBody: multipartPayload,
      timestamp,
    });
    const normalizedPayload = Buffer.from(
      multipartPayload.toString("utf8").replaceAll("\r\n", "\n"),
      "utf8"
    );

    expect(
      verifySendgridParseWebhookSignature({
        publicKey: publicKeyPem,
        rawBody: normalizedPayload,
        signature,
        timestamp,
      })
    ).toBe(false);
  });

  it("replays the raw multipart body into formidable without rewriting it first", async () => {
    const req = createBufferedRequestFromRawBody(multipartPayload, {
      "content-length": `${multipartPayload.length}`,
      "content-type": "multipart/form-data; boundary=boundary",
    });
    if (!isSendgridParseFormRequest(req)) {
      throw new Error("Expected replayed raw body to be parseable by formidable");
    }
    const form = new IncomingForm();
    const [fields, files] = await form.parse(req);

    expect(fields.text?.[0]).toBe("hello world");
    expect(Object.keys(files)).toHaveLength(0);
  });
});

describe("validateSendgridParseWebhookSignature", () => {
  const rawBody = Buffer.from("multipart body", "utf8");
  const nowMs = Date.now();
  const freshTimestamp = `${Math.floor(nowMs / 1000)}`;
  const staleTimestamp = `${Math.floor((nowMs - 10 * 60 * 1000) / 1000)}`;
  const signature = signWebhook({
    rawBody,
    timestamp: freshTimestamp,
  });

  it("accepts missing headers in optional mode", () => {
    const result = validateSendgridParseWebhookSignature({
      mode: "optional",
      publicKey: publicKeyPem,
      headers: {},
      rawBody,
      nowMs,
    });

    expect(result.isOk()).toBe(true);
  });

  it("rejects missing headers in required mode", () => {
    const result = validateSendgridParseWebhookSignature({
      mode: "required",
      publicKey: publicKeyPem,
      headers: {},
      rawBody,
      nowMs,
    });

    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      throw new Error("Expected missing signature headers to be rejected");
    }

    expect(result.error.statusCode).toBe(401);
    expect(result.error.apiError.type).toBe("invalid_request_error");
  });

  it("rejects an invalid signature", () => {
    const result = validateSendgridParseWebhookSignature({
      mode: "required",
      publicKey: publicKeyPem,
      headers: {
        "x-twilio-email-event-webhook-signature": "invalid-signature",
        "x-twilio-email-event-webhook-timestamp": freshTimestamp,
      },
      rawBody,
      nowMs,
    });

    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      throw new Error("Expected invalid signature to be rejected");
    }

    expect(result.error.statusCode).toBe(403);
    expect(result.error.apiError.type).toBe("invalid_request_error");
  });

  it("rejects stale timestamps", () => {
    const result = validateSendgridParseWebhookSignature({
      mode: "required",
      publicKey: publicKeyPem,
      headers: {
        "x-twilio-email-event-webhook-signature": signWebhook({
          rawBody,
          timestamp: staleTimestamp,
        }),
        "x-twilio-email-event-webhook-timestamp": staleTimestamp,
      },
      rawBody,
      nowMs,
    });

    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      throw new Error("Expected stale timestamp to be rejected");
    }

    expect(result.error.statusCode).toBe(403);
    expect(result.error.apiError.type).toBe("invalid_request_error");
  });

  it("accepts a valid signature in required mode", () => {
    const result = validateSendgridParseWebhookSignature({
      mode: "required",
      publicKey: publicKeyPem,
      headers: {
        "x-twilio-email-event-webhook-signature": signature,
        "x-twilio-email-event-webhook-timestamp": freshTimestamp,
      },
      rawBody,
      nowMs,
    });

    expect(result.isOk()).toBe(true);
  });
});
