import type { RequestMethod } from "node-mocks-http";
import { describe, expect, it } from "vitest";

import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { WebhookSourceFactory } from "@app/tests/utils/WebhookSourceFactory";
import { WebhookSourceViewFactory } from "@app/tests/utils/WebhookSourceViewFactory";

import handler from "./index";

async function setupTest(
  role: "builder" | "user" | "admin" = "admin",
  method: RequestMethod = "GET"
) {
  const { req, res, workspace, user, authenticator } =
    await createPrivateApiMockRequest({
      role,
      method,
    });

  const systemSpace = await SpaceFactory.system(workspace);
  const globalSpace = await SpaceFactory.global(workspace);
  const regularSpace = await SpaceFactory.regular(workspace);

  // Set up common query parameters
  req.query.wId = workspace.sId;
  req.query.spaceId = regularSpace.sId;

  return {
    req,
    res,
    workspace,
    regularSpace,
    systemSpace,
    globalSpace,
    user,
    authenticator,
  };
}

describe("GET /api/w/[wId]/spaces/[spaceId]/webhook_source_views", () => {
  it("returns webhook source views for system space", async () => {
    const { req, res, systemSpace } = await setupTest("admin", "GET");

    req.query.spaceId = systemSpace.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({
      success: true,
      webhookSourceViews: expect.any(Array),
    });
  });

  it("returns webhook source views for regular space", async () => {
    const { req, res, workspace, regularSpace } = await setupTest(
      "admin",
      "GET"
    );

    const webhookSourceViewFactory = new WebhookSourceViewFactory(workspace);
    await webhookSourceViewFactory.create(regularSpace);

    req.query.spaceId = regularSpace.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({
      success: true,
      webhookSourceViews: expect.any(Array),
    });
  });
});

describe("POST /api/w/[wId]/spaces/[spaceId]/webhook_source_views", () => {
  it("creates webhook source view successfully for admin", async () => {
    const { req, res, workspace } = await setupTest("admin", "POST");

    // Create a webhook source first
    const webhookSourceFactory = new WebhookSourceFactory(workspace);
    const webhookSourceResult = await webhookSourceFactory.create();
    if (webhookSourceResult.isErr()) {
      throw webhookSourceResult.error;
    }
    const webhookSource = webhookSourceResult.value;

    // Set request body
    req.body = {
      webhookSourceId: webhookSource.sId(),
    };

    // Create regular space for the test
    const regularSpace = await SpaceFactory.regular(workspace);
    req.query.spaceId = regularSpace.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const responseData = res._getJSONData();
    expect(responseData).toEqual({
      success: true,
      webhookSourceView: expect.objectContaining({
        id: expect.any(Number),
        sId: expect.any(String),
        spaceId: regularSpace.sId,
      }),
    });
  });

  it("creates webhook source view successfully for global space", async () => {
    const { req, res, workspace, globalSpace } = await setupTest(
      "admin",
      "POST"
    );

    // Create a webhook source first
    const webhookSourceFactory = new WebhookSourceFactory(workspace);
    const webhookSourceResult = await webhookSourceFactory.create();
    if (webhookSourceResult.isErr()) {
      throw webhookSourceResult.error;
    }
    const webhookSource = webhookSourceResult.value;

    // Set request body
    req.body = {
      webhookSourceId: webhookSource.sId(),
    };

    req.query.spaceId = globalSpace.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const responseData = res._getJSONData();
    expect(responseData).toEqual({
      success: true,
      webhookSourceView: expect.objectContaining({
        id: expect.any(Number),
        sId: expect.any(String),
        spaceId: globalSpace.sId,
      }),
    });
  });

  it("returns 404 when user cannot access space", async () => {
    // Create setup with builder role but same workspace
    const { req, res, workspace } = await setupTest("builder", "POST");

    const webhookSourceFactory = new WebhookSourceFactory(workspace);
    const webhookSourceResult = await webhookSourceFactory.create();
    if (webhookSourceResult.isErr()) {
      throw webhookSourceResult.error;
    }
    const webhookSource = webhookSourceResult.value;

    // Set request body
    req.body = {
      webhookSourceId: webhookSource.sId(),
    };

    await handler(req, res);

    // Builder user gets 404 because they cannot access the space
    // The auth wrapper checks space access before checking admin permissions
    expect(res._getStatusCode()).toBe(404);
  });

  it("returns 400 for invalid request body", async () => {
    const { req, res } = await setupTest("admin", "POST");

    // Set invalid request body (missing webhookSourceId)
    req.body = {};

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    const responseData = res._getJSONData();
    expect(responseData).toEqual({
      error: {
        type: "invalid_request_error",
        message: 'Validation error: Required at "webhookSourceId"',
      },
    });
  });

  it("returns 400 for invalid space type", async () => {
    const { req, res, workspace, authenticator } = await setupTest(
      "admin",
      "POST"
    );

    // Create a webhook source first
    const webhookSourceFactory = new WebhookSourceFactory(workspace);
    const webhookSourceResult = await webhookSourceFactory.create();
    if (webhookSourceResult.isErr()) {
      throw webhookSourceResult.error;
    }
    const webhookSource = webhookSourceResult.value;

    // Set request body
    req.body = {
      webhookSourceId: webhookSource.sId(),
    };

    // Get the system space from defaults (don't create a new one)
    const { systemSpace } = await SpaceFactory.defaults(authenticator);
    req.query.spaceId = systemSpace.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    const responseData = res._getJSONData();
    expect(responseData).toEqual({
      error: {
        type: "invalid_request_error",
        message:
          "Can only create webhook source views from regular or global spaces.",
      },
    });
  });

  it("returns 400 when webhook source system view doesn't exist", async () => {
    const { req, res } = await setupTest("admin", "POST");

    // Set request body with non-existent webhook source ID
    req.body = {
      webhookSourceId: "9999",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    const responseData = res._getJSONData();
    expect(responseData).toEqual({
      error: {
        type: "invalid_request_error",
        message:
          "Missing system view for webhook source, it should have been created when adding the webhook source.",
      },
    });
  });
});

describe("Method Support /api/w/[wId]/spaces/[spaceId]/webhook_source_views", () => {
  it("supports GET and POST methods", async () => {
    const { req, res } = await setupTest("admin", "PUT");

    await handler(req, res);

    expect(res._getStatusCode()).toBe(405);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "method_not_supported_error",
        message:
          "The method passed is not supported, GET and POST are expected",
      },
    });
  });
});
