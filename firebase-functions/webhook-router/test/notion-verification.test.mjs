import assert from "node:assert/strict";
import crypto from "node:crypto";
import { describe, it } from "node:test";

import { createNotionVerificationMiddleware } from "../dist/notion/verification.js";

const signingSecret = "notion-signing-secret";
const secretManager = {
  async getSecrets() {
    return {
      euSecret: "eu-secret",
      slackSigningSecret: "slack-signing-secret",
      usSecret: "us-secret",
      webhookSecret: "webhook-secret",
      notionSigningSecret: signingSecret,
    };
  },
};
const webhookRouterConfigManager = {
  async getEntry() {
    return {
      signingSecret,
      regions: {
        "europe-west1": [],
        "us-central1": [],
      },
    };
  },
};

async function runMiddleware({ body, registrationToken, signature }) {
  const req = {
    body: undefined,
    headers: signature ? { "x-notion-signature": signature } : {},
    params: {
      providerWorkspaceId: "workspace-id",
      ...(registrationToken ? { registrationToken } : {}),
    },
    rawBody: Buffer.from(body),
  };
  const result = {
    nextCalled: false,
    status: 200,
  };
  const res = {
    send() {
      return res;
    },
    status(status) {
      result.status = status;
      return res;
    },
  };
  const middleware = createNotionVerificationMiddleware(
    secretManager,
    webhookRouterConfigManager,
    {
      useClientCredentials: true,
    }
  );

  await middleware(req, res, () => {
    result.nextCalled = true;
  });

  return result;
}

describe("Notion signing secret registration", () => {
  it("rejects registration on the unauthenticated legacy route", async () => {
    const result = await runMiddleware({
      body: JSON.stringify({ verification_token: "attacker-secret" }),
    });

    assert.equal(result.status, 401);
    assert.equal(result.nextCalled, false);
  });

  it("allows registration when the URL contains a one-time code", async () => {
    const result = await runMiddleware({
      body: JSON.stringify({ verification_token: "notion-secret" }),
      registrationToken: "registration-token",
    });

    assert.equal(result.nextCalled, true);
  });

  it("continues to accept valid signed events on the legacy route", async () => {
    const body = JSON.stringify({ type: "page.content_updated" });
    const digest = crypto
      .createHmac("sha256", signingSecret)
      .update(body)
      .digest("hex");
    const result = await runMiddleware({
      body,
      signature: `sha256=${digest}`,
    });

    assert.equal(result.nextCalled, true);
  });
});
