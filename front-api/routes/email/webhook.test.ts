import { randomUUID } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import {
  EMAIL_WEBHOOK_RELAY_HEADER,
  EMAIL_WEBHOOK_RELAY_HEADER_VALUE,
  EMAIL_WEBHOOK_RELAY_SOURCE_ERROR_HEADER,
  INBOUND_EMAIL_UPLOAD_DIR_PREFIX,
} from "@app/lib/api/assistant/email/webhook_helpers";
import { config as cellsConfig } from "@app/lib/api/cells/config";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
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
      getCurrentCell: vi.fn(),
      getLookupApiSecret: () => "test-lookup-secret",
      getAllCells: () => [
        {
          name: "cell-00002",
          region: "europe-west1",
          url: "http://last-cell.test",
        } satisfies CellInfo,
        actual.config.getCellInfo("cell-00000"),
        {
          name: "cell-00001",
          region: "europe-west1",
          url: "http://other-region.test",
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

vi.mock(
  "@app/lib/api/assistant/email/email_trigger",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("@app/lib/api/assistant/email/email_trigger")
      >();
    const { Err } = await import("@app/types/shared/result");
    return {
      ...actual,
      triggerFromEmail: vi
        .fn()
        .mockResolvedValue(
          new Err({ type: "unexpected_error", message: "Trigger not run." })
        ),
    };
  }
);

import { triggerFromEmail } from "@app/lib/api/assistant/email/email_trigger";
import { sendEmailToRecipients } from "@app/lib/api/email";
import type { CellInfo } from "@app/types/cell";
import { Err } from "@app/types/shared/result";

process.env.EMAIL_WEBHOOK_SECRET ||= "test-email-webhook-secret";
const SENDGRID_AUTH_HEADER = `Basic ${Buffer.from(
  `sendgrid:${process.env.EMAIL_WEBHOOK_SECRET}`
).toString("base64")}`;

const RELAY_AUTH_HEADERS = {
  Authorization: "Bearer test-lookup-secret",
  [EMAIL_WEBHOOK_RELAY_HEADER]: EMAIL_WEBHOOK_RELAY_HEADER_VALUE,
};

type WebhookAttachment = {
  filename: string;
  contentType: string;
  content: string;
};

function inboundEmailUploadDirs(): string[] {
  return readdirSync(tmpdir()).filter((name) =>
    name.startsWith(INBOUND_EMAIL_UPLOAD_DIR_PREFIX)
  );
}

function buildSendgridForm(
  senderEmail: string,
  messageId: string,
  targetEmail: string,
  attachment?: WebhookAttachment
): FormData {
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
    JSON.stringify({ from: senderEmail, to: [targetEmail] })
  );
  form.set("headers", `Message-ID: ${messageId}`);
  if (attachment) {
    form.append(
      "attachment1",
      new File([attachment.content], attachment.filename, {
        type: attachment.contentType,
      })
    );
  }
  return form;
}

// Pre-encode the multipart body: real requests carry content-type and
// content-length headers, which formidable requires, but honoApp.request does
// not derive them from a FormData body.
const postWebhook = async (
  senderEmail: string,
  headers: Record<string, string>,
  messageId = `<${randomUUID()}@example.com>`,
  targetEmail = "some-agent@dust.team",
  attachment?: WebhookAttachment
): Promise<Response> => {
  const encoded = new Request("http://localhost/", {
    method: "POST",
    body: buildSendgridForm(senderEmail, messageId, targetEmail, attachment),
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

const getCurrentCellMock = vi.mocked(cellsConfig.getCurrentCell);

describe("POST /api/email/webhook", () => {
  beforeEach(() => {
    vi.mocked(sendEmailToRecipients).mockClear();
    vi.mocked(triggerFromEmail).mockClear();
    getCurrentCellMock.mockReturnValue(cellsConfig.getCellInfo("cell-00002"));
  });

  it("rejects requests without valid authorization", async () => {
    const response = await postWebhook("someone@example.com", {
      Authorization: "Basic invalid",
    });
    expect(response.status).toBe(403);
  });

  it("relays with the source error type when no local workspace has email agents enabled", async () => {
    getCurrentCellMock.mockReturnValue(cellsConfig.getCellInfo("cell-00000"));
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

  it("forwards lookup misses without sending an error reply", async () => {
    getCurrentCellMock.mockReturnValue(cellsConfig.getCellInfo("cell-00001"));
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);

    try {
      const response = await postWebhook("unknown-sender@example.com", {
        ...RELAY_AUTH_HEADERS,
        [EMAIL_WEBHOOK_RELAY_SOURCE_ERROR_HEADER]: "email_agents_disabled",
      });
      expect(response.status).toBe(200);

      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
      const [relayUrl, relayInit] = fetchMock.mock.calls[0];
      expect(relayUrl).toBe("http://last-cell.test/api/email/webhook");
      expect(relayInit.headers[EMAIL_WEBHOOK_RELAY_SOURCE_ERROR_HEADER]).toBe(
        "email_agents_disabled"
      );
      expect(sendEmailToRecipients).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("tries the next cell after an HTTP error", async () => {
    getCurrentCellMock.mockReturnValue(cellsConfig.getCellInfo("cell-00000"));
    const { user } = await createResourceTest({ role: "admin" });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 403 }))
      .mockResolvedValueOnce(new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);

    try {
      await postWebhook(user.email, { Authorization: SENDGRID_AUTH_HEADER });

      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
      expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
        "http://other-region.test/api/email/webhook",
        "http://last-cell.test/api/email/webhook",
      ]);
      expect(sendEmailToRecipients).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("does not try another cell when receipt is uncertain", async () => {
    getCurrentCellMock.mockReturnValue(cellsConfig.getCellInfo("cell-00000"));
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

  it("deletes formidable temp files when a duplicate relay is ignored", async () => {
    const messageId = `<${randomUUID()}@example.com>`;
    const attachment = {
      filename: "note.txt",
      contentType: "text/plain",
      content: "hello from attachment",
    };

    const firstResponse = await postWebhook(
      "unknown-sender@example.com",
      RELAY_AUTH_HEADERS,
      messageId,
      "some-agent@dust.team",
      attachment
    );
    expect(firstResponse.status).toBe(200);
    await vi.waitFor(() =>
      expect(sendEmailToRecipients).toHaveBeenCalledOnce()
    );

    const before = new Set(inboundEmailUploadDirs());
    const secondResponse = await postWebhook(
      "unknown-sender@example.com",
      RELAY_AUTH_HEADERS,
      messageId,
      "some-agent@dust.team",
      attachment
    );
    expect(secondResponse.status).toBe(200);
    expect(sendEmailToRecipients).toHaveBeenCalledOnce();
    const leaked = inboundEmailUploadDirs().filter((name) => !before.has(name));
    expect(leaked).toEqual([]);
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
    getCurrentCellMock.mockReturnValue(cellsConfig.getCellInfo("cell-00000"));
    const { user } = await createResourceTest({ role: "admin" });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 502 }))
      .mockResolvedValueOnce(new Response(null, { status: 502 }))
      .mockResolvedValueOnce(new Response("{}"));
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

  it("replies once in the last cell without relaying back", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    try {
      const response = await postWebhook("unknown-sender@example.com", {
        ...RELAY_AUTH_HEADERS,
        [EMAIL_WEBHOOK_RELAY_SOURCE_ERROR_HEADER]: "email_agents_disabled",
      });
      expect(response.status).toBe(200);

      await vi.waitFor(() =>
        expect(sendEmailToRecipients).toHaveBeenCalledOnce()
      );
      expect(fetchMock).not.toHaveBeenCalled();
      const [{ message }] = vi.mocked(sendEmailToRecipients).mock.calls[0];
      expect(message.html).toContain("Email agents are disabled");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("triggers the readable agent matching the target email", async () => {
    const { workspace, user, authenticator } = await createResourceTest({
      role: "admin",
    });
    await WorkspaceResource.updateMetadata(workspace.id, {
      allowEmailAgents: true,
    });
    const agent = await AgentConfigurationFactory.createTestAgent(
      authenticator,
      { name: "SalesHelper" }
    );

    const response = await postWebhook(
      user.email,
      { Authorization: SENDGRID_AUTH_HEADER },
      undefined,
      "saleshelper@dust.team"
    );
    expect(response.status).toBe(200);

    await vi.waitFor(() => expect(triggerFromEmail).toHaveBeenCalledOnce());
    const [, { agentConfigurations }] =
      vi.mocked(triggerFromEmail).mock.calls[0];
    expect(agentConfigurations.map((a) => a.sId)).toEqual([agent.sId]);
  });

  it("deletes formidable temp files after relaying an email with attachments", async () => {
    getCurrentCellMock.mockReturnValue(cellsConfig.getCellInfo("cell-00000"));
    const { user } = await createResourceTest({ role: "admin" });
    const before = new Set(inboundEmailUploadDirs());
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);

    try {
      const response = await postWebhook(
        user.email,
        { Authorization: SENDGRID_AUTH_HEADER },
        undefined,
        "some-agent@dust.team",
        {
          filename: "note.txt",
          contentType: "text/plain",
          content: "hello from attachment",
        }
      );
      expect(response.status).toBe(200);

      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
      expect(sendEmailToRecipients).not.toHaveBeenCalled();
      await vi.waitFor(() => {
        const leaked = inboundEmailUploadDirs().filter(
          (name) => !before.has(name)
        );
        expect(leaked).toEqual([]);
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("deletes formidable temp files after the email is handled", async () => {
    const { workspace, user, authenticator } = await createResourceTest({
      role: "admin",
    });
    await WorkspaceResource.updateMetadata(workspace.id, {
      allowEmailAgents: true,
    });
    await AgentConfigurationFactory.createTestAgent(authenticator, {
      name: "SalesHelper",
    });
    const before = new Set(inboundEmailUploadDirs());
    let attachmentPath: string | undefined;
    vi.mocked(triggerFromEmail).mockImplementationOnce(async (_auth, args) => {
      expect(args.email.attachments).toHaveLength(1);
      attachmentPath = args.email.attachments[0]?.filepath;
      expect(attachmentPath && existsSync(attachmentPath)).toBe(true);
      return new Err({ type: "unexpected_error", message: "Trigger not run." });
    });

    const response = await postWebhook(
      user.email,
      { Authorization: SENDGRID_AUTH_HEADER },
      undefined,
      "saleshelper@dust.team",
      {
        filename: "note.txt",
        contentType: "text/plain",
        content: "hello from attachment",
      }
    );
    expect(response.status).toBe(200);

    await vi.waitFor(() => expect(triggerFromEmail).toHaveBeenCalledOnce());
    await vi.waitFor(() => {
      expect(attachmentPath && existsSync(attachmentPath)).toBe(false);
      const leaked = inboundEmailUploadDirs().filter(
        (name) => !before.has(name)
      );
      expect(leaked).toEqual([]);
    });
  });

  it("replies with an error when no agent matches the target email", async () => {
    const { workspace, user } = await createResourceTest({ role: "admin" });
    await WorkspaceResource.updateMetadata(workspace.id, {
      allowEmailAgents: true,
    });

    const response = await postWebhook(
      user.email,
      { Authorization: SENDGRID_AUTH_HEADER },
      undefined,
      "nosuchagent@dust.team"
    );
    expect(response.status).toBe(200);

    await vi.waitFor(() =>
      expect(sendEmailToRecipients).toHaveBeenCalledOnce()
    );
    const [{ message }] = vi.mocked(sendEmailToRecipients).mock.calls[0];
    expect(message.html).toContain("nosuchagent");
    expect(triggerFromEmail).not.toHaveBeenCalled();
  });
});
