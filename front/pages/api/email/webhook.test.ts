import { generateKeyPairSync, sign } from "node:crypto";
import type { NextApiRequestWithContext } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiResponse } from "next";
import { createMocks } from "node-mocks-http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  rawBodyMock,
  formParseMock,
  incomingFormMock,
  evaluateInboundAuthMock,
  parseSendgridDkimResultsMock,
  getAgentConfigurationsForViewMock,
  authenticatorFromUserIdAndWorkspaceIdMock,
  buildAuditLogTargetMock,
  emitAuditLogEventMock,
  getAuditLogContextMock,
} = vi.hoisted(() => {
  const formParseMock = vi.fn();

  return {
    rawBodyMock: vi.fn(),
    formParseMock,
    incomingFormMock: vi.fn(function IncomingForm() {
      return {
        parse: formParseMock,
      };
    }),
    evaluateInboundAuthMock: vi.fn(),
    parseSendgridDkimResultsMock: vi.fn(),
    getAgentConfigurationsForViewMock: vi.fn(),
    authenticatorFromUserIdAndWorkspaceIdMock: vi.fn(),
    buildAuditLogTargetMock: vi.fn(),
    emitAuditLogEventMock: vi.fn(),
    getAuditLogContextMock: vi.fn(),
  };
});

vi.mock("raw-body", () => ({
  default: rawBodyMock,
}));

vi.mock("formidable", () => ({
  IncomingForm: incomingFormMock,
}));

vi.mock("@app/lib/api/assistant/email/inbound_auth", () => ({
  evaluateInboundAuth: evaluateInboundAuthMock,
  parseSendgridDkimResults: parseSendgridDkimResultsMock,
}));

vi.mock("@app/lib/api/assistant/configuration/views", () => ({
  getAgentConfigurationsForView: getAgentConfigurationsForViewMock,
}));

vi.mock("@app/lib/api/audit/workos_audit", () => ({
  buildAuditLogTarget: buildAuditLogTargetMock,
  emitAuditLogEvent: emitAuditLogEventMock,
  getAuditLogContext: getAuditLogContextMock,
}));

vi.mock("@app/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@app/lib/auth")>();

  return {
    ...actual,
    Authenticator: {
      ...actual.Authenticator,
      fromUserIdAndWorkspaceId: authenticatorFromUserIdAndWorkspaceIdMock,
    },
  };
});

vi.mock("@app/lib/api/regions/config", () => ({
  config: {
    getCurrentRegion: vi.fn(() => "us-central1"),
    getLookupApiSecret: vi.fn(() => "test-relay-secret"),
    getOtherRegionInfo: vi.fn(() => ({
      name: "europe-west1",
      url: "https://dust-eu.example.com",
    })),
  },
}));

vi.mock("@app/lib/api/assistant/email/email_trigger", () => ({
  ASSISTANT_EMAIL_SUBDOMAIN: "dust.team",
  emailAssistantMatcher: vi.fn(),
  getEmailBlacklistedAgentIds: vi.fn(),
  replyToEmail: vi.fn(),
  triggerFromEmail: vi.fn(),
  userAndWorkspaceFromEmail: vi.fn(),
}));

import { getAgentConfigurationsForView } from "@app/lib/api/assistant/configuration/views";
import {
  emailAssistantMatcher,
  getEmailBlacklistedAgentIds,
  replyToEmail,
  triggerFromEmail,
  userAndWorkspaceFromEmail,
} from "@app/lib/api/assistant/email/email_trigger";
import { Authenticator } from "@app/lib/auth";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import handler, {
  type PostResponseBody,
  shouldRelayToOtherRegion,
} from "./webhook";

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

function relayAuthHeader(secret: string): string {
  return `Bearer ${secret}`;
}

function makeOk<T>(value: T) {
  return {
    isErr: () => false,
    isOk: () => true,
    value,
  };
}

function makeErr(error: unknown) {
  return {
    error,
    isErr: () => true,
    isOk: () => false,
  };
}

function makeAgentConfiguration({
  name,
  sId,
}: {
  name: string;
  sId: string;
}): LightAgentConfigurationType {
  return {
    name,
    sId,
  } as LightAgentConfigurationType;
}

const PARSED_EMAIL_FIELDS = {
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
};

describe("shouldRelayToOtherRegion", () => {
  it("relays first-hop user and workspace misses", () => {
    expect(
      shouldRelayToOtherRegion({
        headers: {},
        error: {
          type: "user_not_found",
          message: "user missing",
        },
      })
    ).toBe(true);

    expect(
      shouldRelayToOtherRegion({
        headers: {},
        error: {
          type: "workspace_not_found",
          message: "workspace missing",
        },
      })
    ).toBe(true);
  });

  it("does not relay requests that were already forwarded", () => {
    expect(
      shouldRelayToOtherRegion({
        headers: {
          "x-dust-email-webhook-relayed": "1",
        },
        error: {
          type: "user_not_found",
          message: "user missing",
        },
      })
    ).toBe(false);
  });

  it("does not relay unrelated email errors", () => {
    expect(
      shouldRelayToOtherRegion({
        headers: {},
        error: {
          type: "invalid_email_error",
          message: "bad recipient",
        },
      })
    ).toBe(false);

    expect(
      shouldRelayToOtherRegion({
        headers: {},
        error: {
          type: "email_agents_disabled",
          message: "email agents disabled",
        },
      })
    ).toBe(false);
  });
});

describe("POST /api/email/webhook", () => {
  const rawBody = Buffer.from("multipart body", "utf8");
  const timestamp = `${Math.floor(Date.now() / 1000)}`;
  const signature = signWebhook({
    rawBody,
    timestamp,
  });

  beforeEach(() => {
    vi.clearAllMocks();

    delete process.env.IS_DEVELOPMENT;
    process.env.EMAIL_WEBHOOK_SECRET = "test-email-webhook-secret";
    process.env.SENDGRID_PARSE_WEBHOOK_PUBLIC_KEY = publicKeyPem;

    rawBodyMock.mockResolvedValue(rawBody);
    parseSendgridDkimResultsMock.mockReturnValue([]);
    getAgentConfigurationsForViewMock.mockResolvedValue([]);
    authenticatorFromUserIdAndWorkspaceIdMock.mockResolvedValue({
      getNonNullableWorkspace: vi.fn(() => ({
        sId: "workspace-1",
      })),
      user: vi.fn(() => ({
        email: "sender@company.com",
        sId: "user-1",
      })),
    });
    buildAuditLogTargetMock.mockReturnValue({});
    emitAuditLogEventMock.mockResolvedValue(undefined);
    getAuditLogContextMock.mockReturnValue({});
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

  it("skips signature verification in development", async () => {
    process.env.IS_DEVELOPMENT = "true";
    formParseMock.mockResolvedValue([PARSED_EMAIL_FIELDS, {}]);

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

    expect(formParseMock).toHaveBeenCalledTimes(1);
    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({ success: true });
  });

  it("ignores zero-byte attachments after parsing", async () => {
    process.env.IS_DEVELOPMENT = "true";
    formParseMock.mockResolvedValue([
      PARSED_EMAIL_FIELDS,
      {
        attachment1: [
          {
            filepath: "/tmp/empty.txt",
            originalFilename: "empty.txt",
            mimetype: "text/plain",
            size: 0,
          },
          {
            filepath: "/tmp/body.txt",
            originalFilename: "body.txt",
            mimetype: "text/plain",
            size: 12,
          },
        ],
      },
    ]);

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

    expect(evaluateInboundAuthMock).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: [
          {
            filepath: "/tmp/body.txt",
            filename: "body.txt",
            contentType: "text/plain",
            size: 12,
          },
        ],
      })
    );
    expect(res._getStatusCode()).toBe(200);
  });

  it("accepts relayed requests without SendGrid signatures", async () => {
    formParseMock.mockResolvedValue([PARSED_EMAIL_FIELDS, {}]);

    const { req, res } = createMocks<
      NextApiRequestWithContext,
      NextApiResponse<WithAPIErrorResponse<PostResponseBody>>
    >({
      method: "POST",
      headers: {
        authorization: relayAuthHeader("test-relay-secret"),
        "content-type": "multipart/form-data; boundary=boundary",
        "x-dust-email-webhook-relayed": "1",
      },
    });

    await handler(req, res);

    expect(formParseMock).toHaveBeenCalledTimes(1);
    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({ success: true });
  });

  it("accepts a valid SendGrid signature and parses the multipart body", async () => {
    formParseMock.mockResolvedValue([PARSED_EMAIL_FIELDS, {}]);

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

  it("replies to blacklisted recipients but still triggers allowed agents", async () => {
    process.env.IS_DEVELOPMENT = "true";

    const blockedAgent = makeAgentConfiguration({
      name: "Blocked",
      sId: "agent-blocked",
    });
    const allowedAgent = makeAgentConfiguration({
      name: "Allowed",
      sId: "agent-allowed",
    });
    const workspace = {
      id: 1,
      metadata: {
        allowEmailAgents: true,
      },
      sId: "workspace-1",
    };
    const auth = {
      getNonNullableWorkspace: vi.fn(() => workspace),
      user: vi.fn(() => ({
        email: "sender@company.com",
        sId: "user-1",
      })),
    };

    formParseMock.mockResolvedValue([
      {
        ...PARSED_EMAIL_FIELDS,
        headers: [
          [
            "From: Sender <sender@company.com>",
            "To: blocked@dust.team, allowed@dust.team",
            "Message-ID: <msg-1@example.com>",
          ].join("\r\n"),
        ],
        envelope: [
          JSON.stringify({
            from: "bounce@company.com",
            to: ["blocked@dust.team", "allowed@dust.team"],
            cc: [],
            bcc: [],
          }),
        ],
      },
      {},
    ]);
    evaluateInboundAuthMock.mockReturnValue({
      authenticated: true,
      reason: "test",
      headerFromDomain: "company.com",
      spfResult: "pass",
      spfEnvelopeDomain: "company.com",
      dkimEntries: [],
    });
    vi.mocked(userAndWorkspaceFromEmail).mockResolvedValue(
      makeOk({
        user: { sId: "user-1" },
        workspace,
      }) as never
    );
    vi.mocked(Authenticator.fromUserIdAndWorkspaceId).mockResolvedValue(
      auth as never
    );
    vi.mocked(getEmailBlacklistedAgentIds).mockReturnValue(
      makeOk(new Set(["agent-blocked"])) as never
    );
    vi.mocked(getAgentConfigurationsForView).mockResolvedValue([
      blockedAgent,
      allowedAgent,
    ]);
    vi.mocked(emailAssistantMatcher).mockImplementation(({ targetEmail }) => {
      if (targetEmail === "blocked@dust.team") {
        return makeErr({
          type: "assistant_email_blacklisted",
          message: "The agent 'Blocked' cannot be reached over email.",
        }) as never;
      }

      return makeOk({
        agentConfiguration: allowedAgent,
      }) as never;
    });
    vi.mocked(triggerFromEmail).mockResolvedValue(
      makeOk({
        conversation: {
          sId: "conversation-1",
        },
      }) as never
    );

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

    expect(res._getStatusCode()).toBe(200);
    expect(replyToEmail).toHaveBeenCalledTimes(1);
    expect(triggerFromEmail).toHaveBeenCalledWith(auth, {
      agentConfigurations: [allowedAgent],
      email: expect.objectContaining({
        sender: expect.objectContaining({
          email: "sender@company.com",
        }),
      }),
    });
  });
});
