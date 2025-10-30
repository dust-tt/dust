import type { RequestMethod } from "node-mocks-http";
import { describe, expect, it } from "vitest";

import { WebhookSourcesViewResource } from "@app/lib/resources/webhook_sources_view_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { WebhookSourceFactory } from "@app/tests/utils/WebhookSourceFactory";

import handler from "./index";

async function setupTest(
  role: "builder" | "user" | "admin" = "admin",
  method: RequestMethod = "GET"
) {
  const { req, res, workspace, authenticator } =
    await createPrivateApiMockRequest({
      role,
      method,
    });

  // Create a system space to hold the Webhook sources
  await SpaceFactory.defaults(authenticator);

  // Set up common query parameters
  req.query.wId = workspace.sId;

  return { req, res, workspace, authenticator };
}

describe("GET /api/w/[wId]/webhook_sources/", () => {
  it("should return a list of webhook sources", async () => {
    const { req, res, workspace } = await setupTest();
    const webhookSourceFactory = new WebhookSourceFactory(workspace);

    // Create two test servers
    await webhookSourceFactory.create({
      name: "Test Webhook Source 1",
    });

    await webhookSourceFactory.create({
      name: "Test Webhook Source 2",
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);

    const responseData = res._getJSONData();

    expect(responseData).toHaveProperty("webhookSourcesWithViews");
    expect(responseData.webhookSourcesWithViews).toHaveLength(2);
  });

  it("should return empty array when no webhook sources exist", async () => {
    const { req, res } = await setupTest();

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);

    const responseData = res._getJSONData();
    expect(responseData).toHaveProperty("webhookSourcesWithViews");
    expect(responseData.webhookSourcesWithViews).toBeInstanceOf(Array);
    expect(responseData.webhookSourcesWithViews).toHaveLength(0);
  });
});

describe("POST /api/w/[wId]/webhook_sources/", () => {
  it("uses provided non-empty secret as-is", async () => {
    const { req, res } = await setupTest("admin", "POST");

    const providedSecret = "my-provided-secret-123";

    req.body = {
      name: "Webhook With Provided Secret",
      secret: providedSecret,
      signatureHeader: "X-Signature",
      signatureAlgorithm: "sha256",
      includeGlobal: true,
      provider: null,
      subscribedEvents: [],
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(201);

    const data = res._getJSONData();
    expect(data.success).toBe(true);
    expect(data.webhookSource).toBeDefined();
    expect(data.webhookSource.secret).toBe(providedSecret);
  });

  it.each([
    { label: "empty string", secret: "" },
    { label: "null", secret: null },
  ])("generates a 64-char secret when $label provided", async ({ secret }) => {
    const { req, res } = await setupTest("admin", "POST");

    req.body = {
      name: "Webhook With Auto Secret",
      secret,
      signatureHeader: "X-Signature",
      signatureAlgorithm: "sha256",
      includeGlobal: true,
      provider: null,
      subscribedEvents: [],
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(201);

    const data = res._getJSONData();
    expect(data.success).toBe(true);
    expect(typeof data.webhookSource.secret).toBe("string");
    expect(data.webhookSource.secret.length).toBe(64);
  });

  it("should create GitHub webhook source with pull_request event", async () => {
    const { req, res } = await setupTest("admin", "POST");

    req.body = {
      name: "GitHub PR Webhook",
      secret: "pr-secret-456",
      signatureHeader: "X-Hub-Signature-256",
      signatureAlgorithm: "sha256",
      includeGlobal: true,
      provider: "github",
      subscribedEvents: ["pull_request"],
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(201);
    const data = res._getJSONData();
    expect(data.success).toBe(true);
    expect(data.webhookSource.provider).toBe("github");
    expect(data.webhookSource.subscribedEvents).toEqual(["pull_request"]);
    expect(data.webhookSource.name).toBe("GitHub PR Webhook");
  });

  it("should return error when creating GitHub webhook source with no events", async () => {
    const { req, res } = await setupTest("admin", "POST");

    req.body = {
      name: "GitHub Webhook No Events",
      secret: "test-secret",
      signatureHeader: "X-Hub-Signature-256",
      signatureAlgorithm: "sha256",
      includeGlobal: true,
      provider: "github",
      subscribedEvents: [],
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    const data = res._getJSONData();
    expect(data.error).toBeDefined();
    expect(data.error.type).toBe("invalid_request_error");
    expect(data.error.message).toContain("Subscribed events must not be empty");
  });

  it("should create webhook source with description and retrieve it in system space view", async () => {
    // Create webhook source with description
    const {
      req: postReq,
      res: postRes,
      authenticator,
    } = await setupTest("admin", "POST");

    const testDescription = "This is a test webhook for monitoring events";

    postReq.body = {
      name: "Webhook With Description",
      secret: "test-secret-789",
      signatureHeader: "X-Signature",
      signatureAlgorithm: "sha256",
      includeGlobal: true,
      provider: null,
      subscribedEvents: [],
      description: testDescription,
    };

    await handler(postReq, postRes);

    expect(postRes._getStatusCode()).toBe(201);
    const postData = postRes._getJSONData();
    expect(postData.success).toBe(true);
    expect(postData.webhookSource).toBeDefined();
    expect(postData.webhookSource.name).toBe("Webhook With Description");

    const systemView =
      await WebhookSourcesViewResource.getWebhookSourceViewForSystemSpace(
        authenticator,
        postData.webhookSource.sId
      );
    expect(systemView).not.toBeNull();
    // eslint-disable-next-line no-unused-expressions
    systemView && expect(systemView.description).toBe(testDescription);
  });
});
