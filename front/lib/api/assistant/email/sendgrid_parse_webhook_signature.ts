import { createPublicKey, verify } from "node:crypto";
import type { IncomingHttpHeaders, IncomingMessage } from "node:http";
import { Readable } from "node:stream";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

type SignatureValidationError = {
  statusCode: 401 | 403 | 500;
  apiError: {
    type: "invalid_request_error" | "internal_server_error";
    message: string;
  };
};

const SENDGRID_PARSE_WEBHOOK_SIGNATURE_HEADER =
  "x-twilio-email-event-webhook-signature";
const SENDGRID_PARSE_WEBHOOK_TIMESTAMP_HEADER =
  "x-twilio-email-event-webhook-timestamp";
const SENDGRID_PARSE_WEBHOOK_MAX_AGE_MS = 5 * 60 * 1000;
const SENDGRID_PARSE_WEBHOOK_MAX_FUTURE_SKEW_MS = 60 * 1000;

function getHeaderValue(
  headers: IncomingHttpHeaders,
  name: string
): string | undefined {
  const value = headers[name];

  if (Array.isArray(value)) {
    return value[0];
  }

  return typeof value === "string" ? value : undefined;
}

function hasFreshTimestamp(timestamp: string, nowMs: number): boolean {
  if (!/^\d+$/.test(timestamp)) {
    return false;
  }

  const timestampMs = Number(timestamp) * 1000;

  return (
    timestampMs <= nowMs + SENDGRID_PARSE_WEBHOOK_MAX_FUTURE_SKEW_MS &&
    nowMs - timestampMs <= SENDGRID_PARSE_WEBHOOK_MAX_AGE_MS
  );
}

function createSendgridParseWebhookPublicKey(publicKey: string) {
  const normalizedPublicKey = publicKey.replace(/\\n/g, "\n").trim();

  if (/-----BEGIN [A-Z0-9 ]+-----/.test(normalizedPublicKey)) {
    return createPublicKey(normalizedPublicKey);
  }

  return createPublicKey({
    key: Buffer.from(normalizedPublicKey.replace(/\s+/g, ""), "base64"),
    format: "der",
    type: "spki",
  });
}

export function verifySendgridParseWebhookSignature({
  publicKey,
  rawBody,
  signature,
  timestamp,
}: {
  publicKey: string;
  rawBody: Buffer;
  signature: string;
  timestamp: string;
}): boolean {
  const signatureBytes = Buffer.from(signature, "base64");
  const signedContent = Buffer.concat([
    Buffer.from(timestamp, "utf8"),
    rawBody,
  ]);

  return verify(
    "sha256",
    signedContent,
    createSendgridParseWebhookPublicKey(publicKey),
    signatureBytes
  );
}

export function validateSendgridParseWebhookSignature({
  publicKey,
  headers,
  rawBody,
  nowMs = Date.now(),
}: {
  publicKey: string | undefined;
  headers: IncomingHttpHeaders;
  rawBody: Buffer;
  nowMs?: number;
}): Result<void, SignatureValidationError> {
  if (!publicKey) {
    return new Err({
      statusCode: 500,
      apiError: {
        type: "internal_server_error",
        message: "SendGrid Parse webhook public key is not configured.",
      },
    });
  }

  const signature = getHeaderValue(
    headers,
    SENDGRID_PARSE_WEBHOOK_SIGNATURE_HEADER
  );
  const timestamp = getHeaderValue(
    headers,
    SENDGRID_PARSE_WEBHOOK_TIMESTAMP_HEADER
  );

  if (!signature || !timestamp) {
    return new Err({
      statusCode: 401,
      apiError: {
        type: "invalid_request_error",
        message: "Missing SendGrid Parse webhook signature headers.",
      },
    });
  }

  if (!hasFreshTimestamp(timestamp, nowMs)) {
    return new Err({
      statusCode: 403,
      apiError: {
        type: "invalid_request_error",
        message:
          "Invalid SendGrid Parse webhook timestamp: signature is stale or malformed.",
      },
    });
  }

  try {
    if (
      !verifySendgridParseWebhookSignature({
        publicKey,
        rawBody,
        signature,
        timestamp,
      })
    ) {
      return new Err({
        statusCode: 403,
        apiError: {
          type: "invalid_request_error",
          message: "Invalid SendGrid Parse webhook signature.",
        },
      });
    }
  } catch {
    return new Err({
      statusCode: 403,
      apiError: {
        type: "invalid_request_error",
        message: "Invalid SendGrid Parse webhook signature.",
      },
    });
  }

  return new Ok(undefined);
}

export function createBufferedRequestFromRawBody(
  rawBody: Buffer,
  headers: IncomingHttpHeaders
): Readable & { headers: IncomingHttpHeaders } {
  return Object.assign(Readable.from([rawBody]), {
    headers,
  });
}

export function isSendgridParseFormRequest(
  req: Readable & { headers: IncomingHttpHeaders }
): req is IncomingMessage {
  return (
    typeof req.pause === "function" &&
    typeof req.resume === "function" &&
    typeof req.on === "function"
  );
}
