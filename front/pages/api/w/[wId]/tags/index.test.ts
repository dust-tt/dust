import type { RequestMethod } from "node-mocks-http";
import { describe, expect } from "vitest";

import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { TagFactory } from "@app/tests/utils/TagFactory";
import { itInTransaction } from "@app/tests/utils/utils";

import handler from "./index";

async function setupTest(
  t: any,
  role: "builder" | "user" | "admin" = "admin",
  method: RequestMethod = "GET"
) {
  const { req, res, workspace } = await createPrivateApiMockRequest({
    role,
    method,
  });

  // Set up common query parameters
  req.query.wId = workspace.sId;

  return { req, res, workspace };
}

describe("GET /api/w/[wId]/tags/", () => {
  itInTransaction("should return a list of tags", async (t) => {
    const { req, res, workspace } = await setupTest(t);

    // Create two test tags
    await TagFactory.create(workspace, {
      name: "Test Tag 1",
    });

    await TagFactory.create(workspace, {
      name: "Test Tag 2",
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);

    const responseData = res._getJSONData();
    expect(responseData).toHaveProperty("tags");
    expect(responseData.tags).toHaveLength(2);
  });

  itInTransaction("should return empty array when no tags exist", async (t) => {
    const { req, res } = await setupTest(t);

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);

    const responseData = res._getJSONData();
    expect(responseData).toHaveProperty("tags");
    expect(responseData.tags).toBeInstanceOf(Array);
    expect(responseData.tags).toHaveLength(0);
  });
});

describe("POST /api/w/[wId]/tags/", () => {
  itInTransaction("should return 400 when name is missing", async (t) => {
    const { req, res } = await setupTest(t, "admin", "POST");

    req.body = {};

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "invalid_request_error",
        message: "Invalid request body",
      },
    });
  });

  itInTransaction(
    "should return 400 when tag with name already exists",
    async (t) => {
      const { req, res, workspace } = await setupTest(t, "admin", "POST");

      const existingName = "Existing Tag";
      await TagFactory.create(workspace, {
        name: existingName,
      });

      req.body = { name: existingName };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(res._getJSONData()).toEqual({
        error: {
          type: "invalid_request_error",
          message: "A tag with this name already exists",
        },
      });
    }
  );

  itInTransaction("should create a new tag successfully", async (t) => {
    const { req, res } = await setupTest(t, "admin", "POST");

    const tagName = "New Test Tag";
    req.body = { name: tagName };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(201);
    const responseData = res._getJSONData();
    expect(responseData).toHaveProperty("tag");
    expect(responseData.tag).toHaveProperty("name", tagName);
  });
});

describe("Method Support /api/w/[wId]/tags", () => {
  itInTransaction("only supports GET and POST methods", async (t) => {
    for (const method of ["DELETE", "PUT", "PATCH"] as const) {
      const { req, res } = await setupTest(t, "admin", method);

      await handler(req, res);

      expect(res._getStatusCode()).toBe(405);
      expect(res._getJSONData()).toEqual({
        error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET or POST is expected.",
        },
      });
    }
  });
});
