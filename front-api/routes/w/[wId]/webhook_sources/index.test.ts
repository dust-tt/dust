import { WebhookSourcesViewResource } from "@app/lib/resources/webhook_sources_view_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { WebhookSourceFactory } from "@app/tests/utils/WebhookSourceFactory";
import type { MembershipRoleType } from "@app/types/memberships";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

async function setupTest(role: MembershipRoleType = "admin") {
  const { workspace, auth } = await createPrivateApiMockRequest({ role });
  return { workspace, auth };
}

function listSources(wId: string) {
  return honoApp.request(`/api/w/${wId}/webhook_sources`);
}

function createSource(wId: string, body: unknown) {
  return honoApp.request(`/api/w/${wId}/webhook_sources`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/w/[wId]/webhook_sources/", () => {
  it("should return a list of webhook sources", async () => {
    const { workspace } = await setupTest();
    const webhookSourceFactory = new WebhookSourceFactory(workspace);

    await webhookSourceFactory.create({ name: "Test Webhook Source 1" });
    await webhookSourceFactory.create({ name: "Test Webhook Source 2" });

    const response = await listSources(workspace.sId);

    expect(response.status).toBe(200);
    const responseData = await response.json();
    expect(responseData).toHaveProperty("webhookSourcesWithViews");
    expect(responseData.webhookSourcesWithViews).toHaveLength(2);
  });

  it("should return empty array when no webhook sources exist", async () => {
    const { workspace } = await setupTest();

    const response = await listSources(workspace.sId);

    expect(response.status).toBe(200);
    const responseData = await response.json();
    expect(responseData.webhookSourcesWithViews).toBeInstanceOf(Array);
    expect(responseData.webhookSourcesWithViews).toHaveLength(0);
  });

  it("should return 403 when caller is not an admin", async () => {
    const { workspace } = await setupTest("user");

    const response = await listSources(workspace.sId);

    expect(response.status).toBe(403);
    const responseData = await response.json();
    expect(responseData.error.type).toBe("workspace_auth_error");
  });
});

describe("POST /api/w/[wId]/webhook_sources/", () => {
  it("uses provided non-empty secret as-is", async () => {
    const { workspace } = await setupTest();

    const providedSecret = "my-provided-secret-123";
    const response = await createSource(workspace.sId, {
      name: "Webhook With Provided Secret",
      secret: providedSecret,
      signatureHeader: "X-Signature",
      signatureAlgorithm: "sha256",
      includeGlobal: true,
      provider: null,
      subscribedEvents: [],
    });

    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.webhookSource).toBeDefined();
    expect(data.webhookSource.secret).toBe(providedSecret);
  });

  it.each([
    { label: "empty string", secret: "" },
    { label: "null", secret: null },
  ])("generates a 64-char secret when $label provided", async ({ secret }) => {
    const { workspace } = await setupTest();

    const response = await createSource(workspace.sId, {
      name: "Webhook With Auto Secret",
      secret,
      signatureHeader: "X-Signature",
      signatureAlgorithm: "sha256",
      includeGlobal: true,
      provider: null,
      subscribedEvents: [],
    });

    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(typeof data.webhookSource.secret).toBe("string");
    expect(data.webhookSource.secret.length).toBe(64);
  });

  it("should create GitHub webhook source with pull_request event", async () => {
    const { workspace } = await setupTest();

    const response = await createSource(workspace.sId, {
      name: "GitHub PR Webhook",
      secret: "pr-secret-456",
      signatureHeader: "X-Hub-Signature-256",
      signatureAlgorithm: "sha256",
      includeGlobal: true,
      provider: "github",
      subscribedEvents: ["pull_request"],
    });

    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.webhookSource.provider).toBe("github");
    expect(data.webhookSource.subscribedEvents).toEqual(["pull_request"]);
    expect(data.webhookSource.name).toBe("GitHub PR Webhook");
  });

  it("should return error when creating GitHub webhook source with no events", async () => {
    const { workspace } = await setupTest();

    const response = await createSource(workspace.sId, {
      name: "GitHub Webhook No Events",
      secret: "test-secret",
      signatureHeader: "X-Hub-Signature-256",
      signatureAlgorithm: "sha256",
      includeGlobal: true,
      provider: "github",
      subscribedEvents: [],
    });

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error.type).toBe("invalid_request_error");
    expect(data.error.message).toContain("Subscribed events must not be empty");
  });

  it("should create webhook source with description and retrieve it in system space view", async () => {
    const { workspace, auth } = await setupTest();

    const testDescription = "This is a test webhook for monitoring events";
    const response = await createSource(workspace.sId, {
      name: "Webhook With Description",
      secret: "test-secret-789",
      signatureHeader: "X-Signature",
      signatureAlgorithm: "sha256",
      includeGlobal: true,
      provider: null,
      subscribedEvents: [],
      description: testDescription,
    });

    expect(response.status).toBe(201);
    const postData = await response.json();
    expect(postData.success).toBe(true);
    expect(postData.webhookSource.name).toBe("Webhook With Description");

    const systemView =
      await WebhookSourcesViewResource.getWebhookSourceViewForSystemSpace(
        auth,
        postData.webhookSource.sId
      );
    expect(systemView).not.toBeNull();
    if (systemView) {
      expect(systemView.description).toBe(testDescription);
    }
  });

  it("should return 403 when caller is not an admin", async () => {
    const { workspace } = await setupTest("user");

    const response = await createSource(workspace.sId, {
      name: "Some Webhook",
      secret: "",
      signatureHeader: "X-Signature",
      signatureAlgorithm: "sha256",
      includeGlobal: true,
      provider: null,
      subscribedEvents: [],
    });

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error.type).toBe("workspace_auth_error");
  });
});
