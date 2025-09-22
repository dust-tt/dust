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
vi.mock("@app/temporal/agent_schedule/client", () => ({
  launchAgentTriggerWorkflow: vi.fn(async () => ({
    isOk: () => true,
    isErr: () => false,
    value: undefined,
  })),
}));

import handler from ".";

describe("POST /api/v1/w/[wId]/triggers/hooks/[webhookSourceId]", () => {
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
    };
    req.body = { any: "payload" };

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
    };
    req.body = { any: "payload" };

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
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(405);
  });
});
