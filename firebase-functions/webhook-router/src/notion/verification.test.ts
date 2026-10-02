import assert from "node:assert/strict";
import crypto from "node:crypto";
import { describe, it } from "node:test";

import type express from "express";

import type { SecretManager } from "../secrets.js";
import type { WebhookRouterConfigManager } from "../webhook-router-config.js";
import { createNotionVerificationMiddleware } from "./verification.js";

const PROVIDER_WORKSPACE_ID = "notion-workspace-1";
const SIGNING_SECRET = "notion-signing-secret";

function makeConfigManager(
  entry: { signingSecret: string } | null
): WebhookRouterConfigManager {
  return {
    hasEntry: async () => entry !== null,
    getEntry: async () => {
      if (!entry) {
        throw new Error("No entry");
      }
      return { ...entry, cells: { "cell-00000": [1] } };
    },
  } as unknown as WebhookRouterConfigManager;
}

async function runMiddleware({
  payload,
  entry,
  signingSecret = SIGNING_SECRET,
}: {
  payload: unknown;
  entry: { signingSecret: string } | null;
  signingSecret?: string;
}): Promise<{ nextCalled: boolean; status: number | null }> {
  const body = JSON.stringify(payload);
  const signature = crypto
    .createHmac("sha256", signingSecret)
    .update(body)
    .digest("hex");

  const req = {
    rawBody: Buffer.from(body),
    params: { providerWorkspaceId: PROVIDER_WORKSPACE_ID },
    headers: { "x-notion-signature": `sha256=${signature}` },
  } as unknown as express.Request;

  let status: number | null = null;
  const res = {
    status: (code: number) => {
      status = code;
      return { send: () => undefined };
    },
  } as unknown as express.Response;

  let nextCalled = false;
  const middleware = createNotionVerificationMiddleware(
    {} as SecretManager,
    makeConfigManager(entry),
    { useClientCredentials: true }
  );
  await middleware(req, res, () => {
    nextCalled = true;
  });

  return { nextCalled, status };
}

describe("createNotionVerificationMiddleware (client credentials)", () => {
  it("accepts the verification token when no signing secret is set", async () => {
    const result = await runMiddleware({
      payload: { verification_token: "notion-token" },
      entry: null,
    });
    assert.deepEqual(result, { nextCalled: true, status: null });
  });

  it("rejects the verification token when a signing secret is already set", async () => {
    const result = await runMiddleware({
      payload: { verification_token: "attacker-token" },
      entry: { signingSecret: SIGNING_SECRET },
    });
    assert.deepEqual(result, { nextCalled: false, status: 401 });
  });

  it("accepts a signed event for the matching workspace", async () => {
    const result = await runMiddleware({
      payload: { type: "page.deleted", workspace_id: PROVIDER_WORKSPACE_ID },
      entry: { signingSecret: SIGNING_SECRET },
    });
    assert.deepEqual(result, { nextCalled: true, status: null });
  });

  it("rejects a signed event targeting another workspace", async () => {
    const result = await runMiddleware({
      payload: { type: "page.deleted", workspace_id: "other-workspace" },
      entry: { signingSecret: SIGNING_SECRET },
    });
    assert.deepEqual(result, { nextCalled: false, status: 401 });
  });

  it("rejects an event signed with the wrong secret", async () => {
    const result = await runMiddleware({
      payload: { type: "page.deleted", workspace_id: PROVIDER_WORKSPACE_ID },
      entry: { signingSecret: SIGNING_SECRET },
      signingSecret: "attacker-secret",
    });
    assert.deepEqual(result, { nextCalled: false, status: 401 });
  });
});
