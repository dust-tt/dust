import {
  EMAIL_WEBHOOK_RELAY_HEADER,
  EMAIL_WEBHOOK_RELAY_HEADER_VALUE,
  EMAIL_WEBHOOK_RELAY_SOURCE_ERROR_HEADER,
} from "@app/lib/api/assistant/email/webhook_helpers";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/regions/config", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@app/lib/api/regions/config")>();
  return {
    ...actual,
    config: {
      ...actual.config,
      getCurrentRegion: () => "europe-west1",
      getLookupApiSecret: () => "test-lookup-secret",
      getOtherRegionInfo: () => ({
        name: "us-central1",
        url: "http://other-region.test",
      }),
    },
  };
});

vi.mock("@app/lib/api/email", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@app/lib/api/email")>();
  return {
    ...actual,
    sendEmailToRecipients: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock(
  "@app/lib/api/assistant/email/sendgrid_parse_webhook_signature",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("@app/lib/api/assistant/email/sendgrid_parse_webhook_signature")
      >();
    const { Ok } = await import("@app/types/shared/result");
    return {
      ...actual,
      validateSendgridParseWebhookSignature: vi.fn(() => new Ok(undefined)),
    };
  }
);

import { sendEmailToRecipients } from "@app/lib/api/email";

process.env.EMAIL_WEBHOOK_SECRET ||= "test-email-webhook-secret";
const SENDGRID_AUTH_HEADER = `Basic ${Buffer.from(
  `sendgrid:${process.env.EMAIL_WEBHOOK_SECRET}`
).toString("base64")}`;

const RELAY_AUTH_HEADERS = {
  Authorization: "Bearer test-lookup-secret",
  [EMAIL_WEBHOOK_RELAY_HEADER]: EMAIL_WEBHOOK_RELAY_HEADER_VALUE,
};

function buildSendgridForm(senderEmail: string): FormData {
  const senderDomain = senderEmail.split("@")[1];
  const form = new FormData();
  form.set("subject", "Hello agent");
  form.set("text", "Hello");
  form.set("from", senderEmail);
  form.set("SPF", "pass");
  // Aligned passing DKIM so evaluateInboundAuth authenticates the sender.
  form.set("dkim", `{@${senderDomain} : pass}`);
  form.set(
    "envelope",
    JSON.stringify({ from: senderEmail, to: ["some-agent@dust.team"] })
  );
  return form;
}

// Pre-encode the multipart body: real requests carry content-type and
// content-length headers, which formidable requires, but honoApp.request does
// not derive them from a FormData body.
const postWebhook = async (
  senderEmail: string,
  headers: Record<string, string>
): Promise<Response> => {
  const encoded = new Request("http://localhost/", {
    method: "POST",
    body: buildSendgridForm(senderEmail),
  });
  const rawBody = Buffer.from(await encoded.arrayBuffer());

  return honoApp.request("/api/email/webhook", {
    method: "POST",
    headers: {
      ...headers,
      "content-type": encoded.headers.get("content-type") ?? "",
      "content-length": String(rawBody.length),
    },
    body: rawBody,
  });
};

describe("POST /api/email/webhook", () => {
  beforeEach(() => {
    vi.mocked(sendEmailToRecipients).mockClear();
  });

  it("rejects requests without valid authorization", async () => {
    const response = await postWebhook("someone@example.com", {
      Authorization: "Basic invalid",
    });
    expect(response.status).toBe(403);
  });

  it("relays with the source error type when no local workspace has email agents enabled", async () => {
    const { user } = await createResourceTest({ role: "admin" });
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);

    try {
      const response = await postWebhook(user.email, {
        Authorization: SENDGRID_AUTH_HEADER,
      });
      expect(response.status).toBe(200);

      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
      const [relayUrl, relayInit] = fetchMock.mock.calls[0];
      expect(relayUrl).toBe("http://other-region.test/api/email/webhook");
      expect(relayInit.headers[EMAIL_WEBHOOK_RELAY_SOURCE_ERROR_HEADER]).toBe(
        "email_agents_disabled"
      );
      // No bounce from the source region once the relay succeeded.
      expect(sendEmailToRecipients).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("replies with the source region error on a relayed request when it is more informative", async () => {
    const response = await postWebhook("unknown-sender@example.com", {
      ...RELAY_AUTH_HEADERS,
      [EMAIL_WEBHOOK_RELAY_SOURCE_ERROR_HEADER]: "email_agents_disabled",
    });
    expect(response.status).toBe(200);

    await vi.waitFor(() =>
      expect(sendEmailToRecipients).toHaveBeenCalledOnce()
    );
    const [{ to, message }] = vi.mocked(sendEmailToRecipients).mock.calls[0];
    expect(to).toEqual(["unknown-sender@example.com"]);
    expect(message.html).toContain("Email agents are disabled");
  });

  it("replies with the local error on a relayed request without a source error header", async () => {
    const response = await postWebhook(
      "unknown-sender@example.com",
      RELAY_AUTH_HEADERS
    );
    expect(response.status).toBe(200);

    await vi.waitFor(() =>
      expect(sendEmailToRecipients).toHaveBeenCalledOnce()
    );
    const [{ message }] = vi.mocked(sendEmailToRecipients).mock.calls[0];
    expect(message.html).toContain("Failed to match a valid Dust user");
  });

  it("ignores an invalid source error header on a relayed request", async () => {
    const response = await postWebhook("unknown-sender@example.com", {
      ...RELAY_AUTH_HEADERS,
      [EMAIL_WEBHOOK_RELAY_SOURCE_ERROR_HEADER]: "not_a_real_error_type",
    });
    expect(response.status).toBe(200);

    await vi.waitFor(() =>
      expect(sendEmailToRecipients).toHaveBeenCalledOnce()
    );
    const [{ message }] = vi.mocked(sendEmailToRecipients).mock.calls[0];
    expect(message.html).toContain("Failed to match a valid Dust user");
  });

  it("keeps the local error on a relayed request when it is at least as informative", async () => {
    const { user } = await createResourceTest({ role: "admin" });

    const response = await postWebhook(user.email, {
      ...RELAY_AUTH_HEADERS,
      [EMAIL_WEBHOOK_RELAY_SOURCE_ERROR_HEADER]: "user_not_found",
    });
    expect(response.status).toBe(200);

    await vi.waitFor(() =>
      expect(sendEmailToRecipients).toHaveBeenCalledOnce()
    );
    const [{ message }] = vi.mocked(sendEmailToRecipients).mock.calls[0];
    expect(message.html).toContain("Email agents are disabled");
  });

  it("does not relay again from a relayed request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    try {
      const response = await postWebhook("unknown-sender@example.com", {
        ...RELAY_AUTH_HEADERS,
        [EMAIL_WEBHOOK_RELAY_SOURCE_ERROR_HEADER]: "user_not_found",
      });
      expect(response.status).toBe(200);

      await vi.waitFor(() =>
        expect(sendEmailToRecipients).toHaveBeenCalledOnce()
      );
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
