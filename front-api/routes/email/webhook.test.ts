import { randomUUID } from "node:crypto";
import { makeEmailAgentsDisabledEmailTriggerError } from "@app/lib/api/assistant/email/email_trigger";
import {
  EMAIL_WEBHOOK_RELAY_HEADER,
  EMAIL_WEBHOOK_RELAY_HEADER_VALUE,
  EMAIL_WEBHOOK_RELAY_LOOKUP,
  EMAIL_WEBHOOK_RELAY_SOURCE_ERROR_HEADER,
} from "@app/lib/api/assistant/email/webhook_helpers";
import { config as cellsConfig } from "@app/lib/api/cells/config";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/cells/config", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@app/lib/api/cells/config")>();
  return {
    ...actual,
    config: {
      ...actual.config,
      getLookupApiSecret: () => "test-lookup-secret",
      getOtherCells: () => [
        {
          name: "cell-00001",
          region: "europe-west1",
          url: "http://other-region.test",
        } satisfies CellInfo,
        {
          name: "cell-00002",
          region: "europe-west1",
          url: "http://last-cell.test",
        } satisfies CellInfo,
      ],
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
import type { CellInfo } from "@app/types/cell";

process.env.EMAIL_WEBHOOK_SECRET ||= "test-email-webhook-secret";
const SENDGRID_AUTH_HEADER = `Basic ${Buffer.from(
  `sendgrid:${process.env.EMAIL_WEBHOOK_SECRET}`
).toString("base64")}`;

const RELAY_AUTH_HEADERS = {
  Authorization: "Bearer test-lookup-secret",
  [EMAIL_WEBHOOK_RELAY_HEADER]: EMAIL_WEBHOOK_RELAY_HEADER_VALUE,
};

function buildSendgridForm(senderEmail: string, messageId: string): FormData {
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
  form.set("headers", `Message-ID: ${messageId}`);
  return form;
}

// Pre-encode the multipart body: real requests carry content-type and
// content-length headers, which formidable requires, but honoApp.request does
// not derive them from a FormData body.
const postWebhook = async (
  senderEmail: string,
  headers: Record<string, string>,
  messageId = `<${randomUUID()}@example.com>`
): Promise<Response> => {
  const encoded = new Request("http://localhost/", {
    method: "POST",
    body: buildSendgridForm(senderEmail, messageId),
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
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ success: true }));
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
      expect(relayInit.headers[EMAIL_WEBHOOK_RELAY_HEADER]).toBe(
        EMAIL_WEBHOOK_RELAY_LOOKUP
      );
      // No bounce from the source region once the relay succeeded.
      expect(sendEmailToRecipients).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("US tries the next cell on a lookup miss", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          success: true,
          lookupError: makeEmailAgentsDisabledEmailTriggerError(),
        })
      )
      .mockResolvedValueOnce(Response.json({ success: true }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      await postWebhook("unknown-sender@example.com", {
        Authorization: SENDGRID_AUTH_HEADER,
      });
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
      expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
        "http://other-region.test/api/email/webhook",
        "http://last-cell.test/api/email/webhook",
      ]);
      expect(
        fetchMock.mock.calls[1][1].headers[
          EMAIL_WEBHOOK_RELAY_SOURCE_ERROR_HEADER
        ]
      ).toBe("email_agents_disabled");
      expect(sendEmailToRecipients).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("US sends one error reply after all cells miss", async () => {
    const fetchMock = vi.fn().mockImplementation(async () =>
      Response.json({
        success: true,
        lookupError: makeEmailAgentsDisabledEmailTriggerError(),
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    try {
      await postWebhook("unknown-sender@example.com", {
        Authorization: SENDGRID_AUTH_HEADER,
      });
      await vi.waitFor(() =>
        expect(sendEmailToRecipients).toHaveBeenCalledOnce()
      );
      expect(fetchMock).toHaveBeenCalledTimes(2);
      const [{ message }] = vi.mocked(sendEmailToRecipients).mock.calls[0];
      expect(message.html).toContain("Email agents are disabled");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("stops on an HTTP rejection", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      await postWebhook("unknown-sender@example.com", {
        Authorization: SENDGRID_AUTH_HEADER,
      });
      await vi.waitFor(() =>
        expect(sendEmailToRecipients).toHaveBeenCalledOnce()
      );
      expect(fetchMock).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("returns a lookup miss again on retry, without replying or forwarding", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const messageId = `<${randomUUID()}@example.com>`;
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        const response = await postWebhook(
          "unknown-sender@example.com",
          {
            ...RELAY_AUTH_HEADERS,
            [EMAIL_WEBHOOK_RELAY_HEADER]: EMAIL_WEBHOOK_RELAY_LOOKUP,
            [EMAIL_WEBHOOK_RELAY_SOURCE_ERROR_HEADER]: "email_agents_disabled",
          },
          messageId
        );
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
          success: true,
          lookupError: makeEmailAgentsDisabledEmailTriggerError(),
        });
      }
      expect(fetchMock).not.toHaveBeenCalled();
      expect(sendEmailToRecipients).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("keeps an accepted email deduplicated after workspace eligibility changes", async () => {
    const { user, workspace } = await createResourceTest({ role: "admin" });
    await WorkspaceResource.updateMetadata(workspace.id, {
      allowEmailAgents: true,
      emailBlacklistedAgentIds: "invalid",
    });
    const messageId = `<${randomUUID()}@example.com>`;
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await postWebhook(
        user.email,
        {
          ...RELAY_AUTH_HEADERS,
          [EMAIL_WEBHOOK_RELAY_HEADER]: EMAIL_WEBHOOK_RELAY_LOOKUP,
        },
        messageId
      );
      expect(await response.json()).toEqual({ success: true });
      await vi.waitFor(() =>
        expect(sendEmailToRecipients).toHaveBeenCalledOnce()
      );
      await WorkspaceResource.updateMetadata(workspace.id, {
        allowEmailAgents: false,
      });
    }
    const [{ message }] = vi.mocked(sendEmailToRecipients).mock.calls[0];
    expect(message.html).toContain("temporarily unavailable");
  });

  it.each([
    "cell-00001",
    "cell-00002",
  ] as const)("never relays from %s", async (cell) => {
    const cellMock = vi
      .spyOn(cellsConfig, "getCurrentCell")
      .mockReturnValue(cellsConfig.getCellInfo(cell));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    try {
      await postWebhook("unknown-sender@example.com", {
        Authorization: SENDGRID_AUTH_HEADER,
      });
      await vi.waitFor(() =>
        expect(sendEmailToRecipients).toHaveBeenCalledOnce()
      );
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      cellMock.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it("does not try another cell when receipt is uncertain", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("Response lost"));
    vi.stubGlobal("fetch", fetchMock);

    try {
      await postWebhook("unknown-sender@example.com", {
        Authorization: SENDGRID_AUTH_HEADER,
      });

      await vi.waitFor(() =>
        expect(sendEmailToRecipients).toHaveBeenCalledOnce()
      );
      expect(new Set(fetchMock.mock.calls.map(([url]) => url))).toEqual(
        new Set(["http://other-region.test/api/email/webhook"])
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("ignores a relayed email with the same Message-ID", async () => {
    const messageId = `<${randomUUID()}@example.com>`;

    const firstResponse = await postWebhook(
      "unknown-sender@example.com",
      RELAY_AUTH_HEADERS,
      messageId
    );
    expect(firstResponse.status).toBe(200);
    await vi.waitFor(() =>
      expect(sendEmailToRecipients).toHaveBeenCalledOnce()
    );

    const secondResponse = await postWebhook(
      "unknown-sender@example.com",
      RELAY_AUTH_HEADERS,
      messageId
    );
    expect(secondResponse.status).toBe(200);
    expect(sendEmailToRecipients).toHaveBeenCalledOnce();
  });

  it("retries transient relay failures", async () => {
    const { user } = await createResourceTest({ role: "admin" });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 502 }))
      .mockResolvedValueOnce(new Response(null, { status: 502 }))
      .mockResolvedValueOnce(Response.json({ success: true }));
    vi.stubGlobal("fetch", fetchMock);

    try {
      const response = await postWebhook(user.email, {
        Authorization: SENDGRID_AUTH_HEADER,
      });
      expect(response.status).toBe(200);

      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
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

  it("never forwards a legacy relay", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    try {
      await postWebhook("unknown-sender@example.com", RELAY_AUTH_HEADERS);
      await vi.waitFor(() =>
        expect(sendEmailToRecipients).toHaveBeenCalledOnce()
      );
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
