import type { RequestMethod } from "node-mocks-http";
import { describe, expect, it } from "vitest";

import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { WebhookSourceResource } from "@app/lib/resources/webhook_source_resource";
import { WebhookSourceFactory } from "@app/tests/utils/WebhookSourceFactory";

import handler from "./[webhookSourceId]";

async function setupTest(method: RequestMethod = "POST") {
  const { req, res, workspace } = await createPrivateApiMockRequest({
    method,
  });
  return { req, res, workspace };
}

describe("POST /api/v1/w/[wId]/triggers/hooks/[webhookSourceId]", () => {
  it("returns 200 when workspace and webhook source exist", async () => {
    const { req, res, workspace } = await setupTest("POST");

    const webhookSourceFactory = new WebhookSourceFactory(workspace);
    const created = await webhookSourceFactory.create();
    if (created.isErr()) {
      throw created.error;
    }
    const webhookSourceId = created.value.sId();

    req.query.wId = workspace.sId;
    req.query.webhookSourceId = webhookSourceId;

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({ success: true });
  });

  it("returns 404 when webhook source does not exist", async () => {
    const { req, res, workspace } = await setupTest("POST");

    req.query.wId = workspace.sId;
    req.query.webhookSourceId = WebhookSourceResource.modelIdToSId({
      id: 999999999,
      workspaceId: workspace.id,
    });

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(404);
    const data = res._getJSONData();
    expect(data).toHaveProperty("error");
    expect(data.error.type).toBe("webhook_source_not_found");
  });

  it("returns 405 on non-POST methods", async () => {
    const { req, res, workspace } = await setupTest("GET");
    req.query.wId = workspace.sId;
    req.query.webhookSourceId = "webhook_source/whatever";

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(405);
  });
});
