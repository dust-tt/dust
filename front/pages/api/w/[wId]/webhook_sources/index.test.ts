import type { RequestMethod } from "node-mocks-http";
import { describe, expect, it } from "vitest";

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
