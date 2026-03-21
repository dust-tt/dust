import { describe, expect, it, vi } from "vitest";

const WEBHOOK_SECRET = "test-secret";

// Mock formidable to return controlled form fields without actual multipart parsing.
vi.mock("formidable", () => {
  return {
    IncomingForm: class {
      parse() {
        return Promise.resolve([
          {
            subject: ["Test subject"],
            text: ["Hello"],
            from: ["Alice <alice@spoofed.com>"],
            SPF: ["softfail"],
            dkim: ["{@other.com : fail}"],
            headers: [null],
            envelope: [
              JSON.stringify({
                from: "alice@spoofed.com",
                to: ["agent@dust.help"],
              }),
            ],
          },
          {}, // files
        ]);
      }
    },
  };
});

vi.mock("@app/lib/api/config", () => ({
  default: {
    getEmailWebhookSecret: () => WEBHOOK_SECRET,
  },
}));

// Mock replyToEmail so we can assert it is never called on auth failure.
vi.mock(
  "@app/lib/api/assistant/email/email_trigger",
  async (importOriginal) => {
    const mod =
      await importOriginal<
        typeof import("@app/lib/api/assistant/email/email_trigger")
      >();
    return {
      ...mod,
      replyToEmail: vi.fn(),
    };
  }
);

// Force auth check to fail.
vi.mock("@app/lib/api/assistant/email/inbound_auth", () => ({
  isAuthenticatedInboundSender: () => false,
}));

import { replyToEmail } from "@app/lib/api/assistant/email/email_trigger";
import type { NextApiRequest, NextApiResponse } from "next";
import { createMocks } from "node-mocks-http";

import handler from "./webhook";

function basicAuthHeader(user: string, pass: string): string {
  return "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");
}

describe("POST /api/email/webhook", () => {
  it("does not send a reply email on authentication failure", async () => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "POST",
      headers: {
        authorization: basicAuthHeader("sendgrid", WEBHOOK_SECRET),
      },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(replyToEmail).not.toHaveBeenCalled();
  });
});
