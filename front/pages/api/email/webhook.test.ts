import { generateKeyPairSync, sign } from "node:crypto";
import type { NextApiRequestWithContext } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiResponse } from "next";
import { createMocks } from "node-mocks-http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  rawBodyMock,
  formParseMock,
  evaluateInboundAuthMock,
  parseSendgridDkimResultsMock,
} = vi.hoisted(() => ({
  rawBodyMock: vi.fn(),
  formParseMock: vi.fn(),
  evaluateInboundAuthMock: vi.fn(),
  parseSendgridDkimResultsMock: vi.fn(),
}));

vi.mock("raw-body", () => ({
  default: rawBodyMock,
}));

vi.mock("formidable", () => ({
  IncomingForm: function IncomingForm() {
    return {
      parse: formParseMock,
    };
  },
}));

vi.mock("@app/lib/api/assistant/email/inbound_auth", () => ({
  evaluateInboundAuth: evaluateInboundAuthMock,
  parseSendgridDkimResults: parseSendgridDkimResultsMock,
}));

vi.mock("@app/lib/api/assistant/email/email_trigger", () => ({
  ASSISTANT_EMAIL_SUBDOMAIN: "dust.team",
  emailAssistantMatcher: vi.fn(),
  replyToEmail: vi.fn(),
  triggerFromEmail: vi.fn(),
  userAndWorkspaceFromEmail: vi.fn(),
}));

import handler, { type PostResponseBody } from "./webhook";

const { privateKey, publicKey } = generateKeyPairSync("ec", {
  namedCurve: "prime256v1",
});
const publicKeyPem = publicKey
  .export({ format: "pem", type: "spki" })
  .toString();

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

function basicAuthHeader(secret: string): string {
  return `Basic ${Buffer.from(`sendgrid:${secret}`).toString("base64")}`;
}

describe("POST /api/email/webhook", () => {
  const rawBody = Buffer.from("multipart body", "utf8");
  const timestamp = `${Math.floor(Date.now() / 1000)}`;
  const signature = signWebhook({
    rawBody,
    timestamp,
  });

  beforeEach(() => {
    vi.clearAllMocks();

    process.env.EMAIL_WEBHOOK_SECRET = "test-email-webhook-secret";
    process.env.SENDGRID_PARSE_WEBHOOK_PUBLIC_KEY = publicKeyPem;
    process.env.SENDGRID_PARSE_WEBHOOK_SIGNATURE_MODE = "required";

    rawBodyMock.mockResolvedValue(rawBody);
    parseSendgridDkimResultsMock.mockReturnValue([]);
    evaluateInboundAuthMock.mockReturnValue({
      authenticated: false,
      reason: "test",
      headerFromDomain: "company.com",
      spfResult: "pass",
      spfEnvelopeDomain: "company.com",
      dkimEntries: [],
    });
  });

  it("rejects missing signature headers before multipart parsing", async () => {
    const { req, res } = createMocks<
      NextApiRequestWithContext,
      NextApiResponse<WithAPIErrorResponse<PostResponseBody>>
    >({
      method: "POST",
      headers: {
        authorization: basicAuthHeader(process.env.EMAIL_WEBHOOK_SECRET ?? ""),
        "content-type": "multipart/form-data; boundary=boundary",
      },
    });

    await handler(req, res);

    expect(formParseMock).not.toHaveBeenCalled();
    expect(res._getStatusCode()).toBe(401);
    expect(res._getJSONData().error.type).toBe("invalid_request_error");
    expect(res._getJSONData().error.message).toBe(
      "Missing SendGrid Parse webhook signature headers."
    );
  });

  it("rejects an invalid signature before multipart parsing", async () => {
    const { req, res } = createMocks<
      NextApiRequestWithContext,
      NextApiResponse<WithAPIErrorResponse<PostResponseBody>>
    >({
      method: "POST",
      headers: {
        authorization: basicAuthHeader(process.env.EMAIL_WEBHOOK_SECRET ?? ""),
        "content-type": "multipart/form-data; boundary=boundary",
        "x-twilio-email-event-webhook-signature": "invalid-signature",
        "x-twilio-email-event-webhook-timestamp": timestamp,
      },
    });

    await handler(req, res);

    expect(formParseMock).not.toHaveBeenCalled();
    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData().error.type).toBe("invalid_request_error");
    expect(res._getJSONData().error.message).toBe(
      "Invalid SendGrid Parse webhook signature."
    );
  });

  it("accepts a valid signature and parses the multipart body", async () => {
    formParseMock.mockResolvedValue([
      {
        subject: ["hello"],
        text: ["body"],
        from: ["Sender <sender@company.com>"],
        SPF: ["pass"],
        dkim: ["{@company.com : pass}"],
        headers: [
          [
            "From: Sender <sender@company.com>",
            "To: agent@dust.team",
            "Message-ID: <msg-1@example.com>",
          ].join("\r\n"),
        ],
        envelope: [
          JSON.stringify({
            from: "bounce@company.com",
            to: ["agent@dust.team"],
            cc: [],
            bcc: [],
          }),
        ],
      },
      {},
    ]);

    const { req, res } = createMocks<
      NextApiRequestWithContext,
      NextApiResponse<WithAPIErrorResponse<PostResponseBody>>
    >({
      method: "POST",
      headers: {
        authorization: basicAuthHeader(process.env.EMAIL_WEBHOOK_SECRET ?? ""),
        "content-type": "multipart/form-data; boundary=boundary",
        "x-twilio-email-event-webhook-signature": signature,
        "x-twilio-email-event-webhook-timestamp": timestamp,
      },
    });

    await handler(req, res);

    expect(formParseMock).toHaveBeenCalledTimes(1);
    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({ success: true });
  });
});
