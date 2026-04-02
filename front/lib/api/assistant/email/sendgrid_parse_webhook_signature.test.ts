import { generateKeyPairSync, type KeyObject, sign } from "node:crypto";
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
const { privateKey: rsaPrivateKey, publicKey: rsaPublicKey } =
  generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
const rsaPublicKeyPem = rsaPublicKey
  .export({ format: "pem", type: "pkcs1" })
  .toString();

function signWebhook({
  privateKey: signingKey = privateKey,
  rawBody,
  timestamp,
}: {
  privateKey?: KeyObject;
  rawBody: Buffer;
  timestamp: string;
}): string {
  return sign(
    "sha256",
    Buffer.concat([Buffer.from(timestamp, "utf8"), rawBody]),
    signingKey
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

  it("accepts PEM public keys with non-SPKI headers", () => {
    const signature = signWebhook({
      privateKey: rsaPrivateKey,
      rawBody: multipartPayload,
      timestamp,
    });

    expect(
      verifySendgridParseWebhookSignature({
        publicKey: rsaPublicKeyPem,
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
      throw new Error(
        "Expected replayed raw body to be parseable by formidable"
      );
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
  const slightlyFutureTimestamp = `${Math.floor((nowMs + 30 * 1000) / 1000)}`;
  const tooFutureTimestamp = `${Math.floor((nowMs + 2 * 60 * 1000) / 1000)}`;
  const signature = signWebhook({
    rawBody,
    timestamp: freshTimestamp,
  });

  it("rejects a missing public key", () => {
    const result = validateSendgridParseWebhookSignature({
      publicKey: undefined,
      headers: {},
      rawBody,
      nowMs,
    });

    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      throw new Error("Expected missing public key to be rejected");
    }

    expect(result.error.statusCode).toBe(500);
    expect(result.error.apiError.type).toBe("internal_server_error");
  });

  it("rejects missing headers", () => {
    const result = validateSendgridParseWebhookSignature({
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

  it("rejects timestamps that are too far in the future", () => {
    const result = validateSendgridParseWebhookSignature({
      publicKey: publicKeyPem,
      headers: {
        "x-twilio-email-event-webhook-signature": signWebhook({
          rawBody,
          timestamp: tooFutureTimestamp,
        }),
        "x-twilio-email-event-webhook-timestamp": tooFutureTimestamp,
      },
      rawBody,
      nowMs,
    });

    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      throw new Error("Expected too-far-future timestamp to be rejected");
    }

    expect(result.error.statusCode).toBe(403);
    expect(result.error.apiError.type).toBe("invalid_request_error");
  });

  it("accepts a valid signature", () => {
    const result = validateSendgridParseWebhookSignature({
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

  it("accepts a small amount of clock skew", () => {
    const result = validateSendgridParseWebhookSignature({
      publicKey: publicKeyPem,
      headers: {
        "x-twilio-email-event-webhook-signature": signWebhook({
          rawBody,
          timestamp: slightlyFutureTimestamp,
        }),
        "x-twilio-email-event-webhook-timestamp": slightlyFutureTimestamp,
      },
      rawBody,
      nowMs,
    });

    expect(result.isOk()).toBe(true);
  });
});
