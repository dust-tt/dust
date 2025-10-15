import { createHmac } from "crypto";
import { describe, expect, it, vi } from "vitest";

import { Authenticator } from "@app/lib/auth";
import { createPublicApiMockRequest } from "@app/tests/utils/generic_public_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { WebhookSourceFactory } from "@app/tests/utils/WebhookSourceFactory";

// Shallowly mock file content fragment creation to avoid touching storage.
vi.mock("@app/lib/api/assistant/conversation/content_fragment", () => ({
  toFileContentFragment: vi.fn(async () => ({
    isOk: () => true,
    isErr: () => false,
    value: { title: "mock", url: null, fileId: "file_mock" },
  })),
}));

// Avoid UDP socket usage from StatsD in tests
vi.mock("@app/logger/statsDClient", () => ({
  statsDClient: {
    increment: vi.fn(),
    distribution: vi.fn(),
  },
}));

// Mock temporal client to avoid workflow execution
vi.mock("@app/lib/triggers/temporal/common/client", () => ({
  launchAgentTriggerWorkflow: vi.fn(async () => ({
    isOk: () => true,
    isErr: () => false,
    value: undefined,
  })),
}));

vi.mock("@app/lib/file_storage", () => ({
  getWebhookRequestsBucket: vi.fn(() => ({})),
}));

import handler from ".";

describe("POST /api/v1/w/[wId]/triggers/hooks/[webhookSourceId]/[webhookSourceUrlSecret]", () => {
  it("returns 200 when workspace and webhook source exist", async () => {
    const { req, res, workspace } = await createPublicApiMockRequest({
      method: "POST",
    });

    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    await SpaceFactory.defaults(auth);

    // Create a webhook source
    const webhookSourceFactory = new WebhookSourceFactory(workspace);
    const webhookSourceResult = await webhookSourceFactory.create({
      name: "Test Webhook Source",
    });

    if (webhookSourceResult.isErr()) {
      throw new Error(
        `Failed to create webhook source: ${webhookSourceResult.error.message}`
      );
    }

    const webhookSource = webhookSourceResult.value;

    req.query = {
      wId: workspace.sId,
      webhookSourceId: webhookSource.sId(),
      webhookSourceUrlSecret: webhookSource.urlSecret,
    };
    req.body = { any: "payload" };
    req.headers = {
      "content-type": "application/json",
    };

    await handler(req, res);

    if (res._getStatusCode() !== 200) {
      // Help debugging in CI-like environments
      // eslint-disable-next-line no-console
      console.error("Handler error response:", res._getJSONData());
    }

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({ success: true });
  });

  it("returns 404 when webhook source does not exist", async () => {
    const { req, res, workspace } = await createPublicApiMockRequest({
      method: "POST",
    });

    req.query = {
      wId: workspace.sId,
      webhookSourceId: "webhook_source/nonexistent",
      webhookSourceUrlSecret: "any-secret",
    };
    req.body = { any: "payload" };
    req.headers = {
      "content-type": "application/json",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
    const data = res._getJSONData();
    expect(data).toHaveProperty("error");
    expect(data.error.type).toBe("webhook_source_not_found");
  });

  it("returns 405 on non-POST methods", async () => {
    const { req, res, workspace } = await createPublicApiMockRequest({
      method: "GET",
    });

    req.query = {
      wId: workspace.sId,
      webhookSourceId: "webhook_source/whatever",
      webhookSourceUrlSecret: "any-secret",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(405);
  });

  it("returns 400 when content-type is not application/json", async () => {
    const { req, res, workspace } = await createPublicApiMockRequest({
      method: "POST",
    });

    req.query = {
      wId: workspace.sId,
      webhookSourceId: "webhook_source/whatever",
      webhookSourceUrlSecret: "any-secret",
    };
    req.body = { any: "payload" };
    req.headers = {
      "content-type": "text/plain",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    const data = res._getJSONData();
    expect(data).toHaveProperty("error");
    expect(data.error.type).toBe("invalid_request_error");
    expect(data.error.message).toBe("Content-Type must be application/json.");
  });

  it("returns 200 when webhook source has valid signature", async () => {
    const { req, res, workspace } = await createPublicApiMockRequest({
      method: "POST",
    });

    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    await SpaceFactory.defaults(auth);

    // Create a webhook source with signature configuration
    const secret = "my-secret-key";
    const signatureHeader = "x-signature";
    const algorithm = "sha256";

    const webhookSourceFactory = new WebhookSourceFactory(workspace);
    const webhookSourceResult = await webhookSourceFactory.create({
      name: "Test Webhook Source with Signature",
      secret,
      signatureHeader,
      signatureAlgorithm: algorithm,
    });

    if (webhookSourceResult.isErr()) {
      throw new Error(
        `Failed to create webhook source: ${webhookSourceResult.error.message}`
      );
    }

    const webhookSource = webhookSourceResult.value;
    const payload = { test: "data", timestamp: Date.now() };
    const payloadString = JSON.stringify(payload);

    // Generate valid signature
    const validSignature = `${algorithm}=${createHmac(algorithm, secret)
      .update(payloadString, "utf8")
      .digest("hex")}`;

    req.query = {
      wId: workspace.sId,
      webhookSourceId: webhookSource.sId(),
      webhookSourceUrlSecret: webhookSource.urlSecret,
    };
    req.body = payload;
    req.headers = {
      "content-type": "application/json",
      [signatureHeader.toLowerCase()]: validSignature,
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({ success: true });
  });

  it("returns 401 when webhook source has invalid signature", async () => {
    const { req, res, workspace } = await createPublicApiMockRequest({
      method: "POST",
    });

    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    await SpaceFactory.defaults(auth);

    // Create a webhook source with signature configuration
    const secret = "my-secret-key";
    const signatureHeader = "x-signature";
    const algorithm = "sha256";

    const webhookSourceFactory = new WebhookSourceFactory(workspace);
    const webhookSourceResult = await webhookSourceFactory.create({
      name: "Test Webhook Source with Invalid Signature",
      secret,
      signatureHeader,
      signatureAlgorithm: algorithm,
    });

    if (webhookSourceResult.isErr()) {
      throw new Error(
        `Failed to create webhook source: ${webhookSourceResult.error.message}`
      );
    }

    const webhookSource = webhookSourceResult.value;
    const payload = { test: "data", timestamp: Date.now() };

    // Use an invalid signature
    const invalidSignature = `${algorithm}=invalid_signature_hash`;

    req.query = {
      wId: workspace.sId,
      webhookSourceId: webhookSource.sId(),
      webhookSourceUrlSecret: webhookSource.urlSecret,
    };
    req.body = payload;
    req.headers = {
      "content-type": "application/json",
      [signatureHeader.toLowerCase()]: invalidSignature,
    };

    await handler(req, res);

    if (res._getStatusCode() !== 401) {
      // Help debugging in CI-like environments
      // eslint-disable-next-line no-console
      console.error("Handler error response:", res._getJSONData());
    }

    expect(res._getStatusCode()).toBe(401);
    const data = res._getJSONData();
    expect(data).toHaveProperty("error");
    expect(data.error.type).toBe("not_authenticated");
    expect(data.error.message).toBe("Invalid webhook signature.");
  });

  it("returns 401 when webhook URL secret is invalid", async () => {
    const { req, res, workspace } = await createPublicApiMockRequest({
      method: "POST",
    });

    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    await SpaceFactory.defaults(auth);

    // Create a webhook source
    const webhookSourceFactory = new WebhookSourceFactory(workspace);
    const webhookSourceResult = await webhookSourceFactory.create({
      name: "Test Webhook Source",
    });

    if (webhookSourceResult.isErr()) {
      throw new Error(
        `Failed to create webhook source: ${webhookSourceResult.error.message}`
      );
    }

    const webhookSource = webhookSourceResult.value;

    req.query = {
      wId: workspace.sId,
      webhookSourceId: webhookSource.sId(),
      webhookSourceUrlSecret: "invalid-secret", // Using wrong secret
    };
    req.body = { any: "payload" };
    req.headers = {
      "content-type": "application/json",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(401);
    const data = res._getJSONData();
    expect(data).toHaveProperty("error");
    expect(data.error.type).toBe("webhook_source_auth_error");
    expect(data.error.message).toBe("Invalid webhook path.");
  });

  it("returns 400 when webhook URL secret is missing", async () => {
    const { req, res, workspace } = await createPublicApiMockRequest({
      method: "POST",
    });

    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    await SpaceFactory.defaults(auth);

    // Create a webhook source
    const webhookSourceFactory = new WebhookSourceFactory(workspace);
    const webhookSourceResult = await webhookSourceFactory.create({
      name: "Test Webhook Source",
    });

    if (webhookSourceResult.isErr()) {
      throw new Error(
        `Failed to create webhook source: ${webhookSourceResult.error.message}`
      );
    }

    const webhookSource = webhookSourceResult.value;

    req.query = {
      wId: workspace.sId,
      webhookSourceId: webhookSource.sId(),
      // Missing webhookSourceUrlSecret parameter (it will be undefined)
    };
    req.body = { any: "payload" };
    req.headers = {
      "content-type": "application/json",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    const data = res._getJSONData();
    expect(data).toHaveProperty("error");
    expect(data.error.type).toBe("invalid_request_error");
    expect(data.error.message).toBe(
      "Invalid route parameters: expected string wId, webhookSourceId and webhookSourceUrlSecret."
    );
  });

  it("returns 200 when webhook URL secret is valid", async () => {
    const { req, res, workspace } = await createPublicApiMockRequest({
      method: "POST",
    });

    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    await SpaceFactory.defaults(auth);

    // Create a webhook source with a custom URL secret
    const customUrlSecret = "my-custom-url-secret-123";
    const webhookSourceFactory = new WebhookSourceFactory(workspace);
    const webhookSourceResult = await webhookSourceFactory.create({
      name: "Test Webhook Source with URL Secret",
      urlSecret: customUrlSecret,
    });

    if (webhookSourceResult.isErr()) {
      throw new Error(
        `Failed to create webhook source: ${webhookSourceResult.error.message}`
      );
    }

    const webhookSource = webhookSourceResult.value;

    req.query = {
      wId: workspace.sId,
      webhookSourceId: webhookSource.sId(),
      webhookSourceUrlSecret: customUrlSecret, // Using the correct secret
    };
    req.body = { any: "payload" };
    req.headers = {
      "content-type": "application/json",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({ success: true });
  });

  it("returns 400 when webhookSourceUrlSecret is undefined", async () => {
    const { req, res, workspace } = await createPublicApiMockRequest({
      method: "POST",
    });

    req.query = {
      wId: workspace.sId,
      webhookSourceId: "webhook_source/whatever",
      webhookSourceUrlSecret: undefined,
    };
    req.body = { any: "payload" };
    req.headers = {
      "content-type": "application/json",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    const data = res._getJSONData();
    expect(data).toHaveProperty("error");
    expect(data.error.type).toBe("invalid_request_error");
    expect(data.error.message).toBe(
      "Invalid route parameters: expected string wId, webhookSourceId and webhookSourceUrlSecret."
    );
  });

  it("returns 200 when GitHub webhook source does not subscribe to pull_request event", async () => {
    const { req, res, workspace } = await createPublicApiMockRequest({
      method: "POST",
    });

    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    await SpaceFactory.defaults(auth);

    // Create a GitHub webhook source that doesn't subscribe to pull_request events
    const webhookSourceFactory = new WebhookSourceFactory(workspace);
    const webhookSourceResult = await webhookSourceFactory.create({
      name: "Test GitHub Webhook Source",
      kind: "github",
      subscribedEvents: ["issues"], // Subscribe to issues but not pull_request
    });

    if (webhookSourceResult.isErr()) {
      throw new Error(
        `Failed to create webhook source: ${webhookSourceResult.error.message}`
      );
    }

    const webhookSource = webhookSourceResult.value;

    req.query = {
      wId: workspace.sId,
      webhookSourceId: webhookSource.sId(),
      webhookSourceUrlSecret: webhookSource.urlSecret,
    };
    req.body = {
      action: "opened",
      issue: {
        url: "https://api.github.com/repos/example/repo/issues/1",
        id: 1001,
        number: 1,
      },
      assignee: {
        login: "octocat",
      },
      label: {
        id: 208045946,
      },
      sender: {
        login: "octocat",
      },
    };
    req.headers = {
      "content-type": "application/json",
      "x-github-event": "pull_request", // This is the GitHub event header
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({ success: true });
  });
});
