import { afterEach, describe, expect, vi } from "vitest";

import { Authenticator } from "@app/lib/auth";
import { TagResource } from "@app/lib/resources/tags_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { TagFactory } from "@app/tests/utils/TagFactory";
import { itInTransaction } from "@app/tests/utils/utils";

import handler from "./index";

describe("DELETE /api/w/[wId]/tags/[tId]", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  itInTransaction("should delete a tag", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "DELETE",
    });
    const tag = await TagFactory.create(workspace, { name: "test-tag" });
    req.query.tId = tag.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(204);
    expect(res._getData()).toBe("");

    const auth = await Authenticator.internalBuilderForWorkspace(workspace.sId);
    // Verify the tag was actually deleted
    const deletedTag = await TagResource.fetchById(auth, tag.sId);
    expect(deletedTag).toBeNull();
  });

  itInTransaction("should return 404 if tag not found", async () => {
    const { req, res } = await createPrivateApiMockRequest({
      method: "DELETE",
    });
    req.query.tId = "non-existent-tag";

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "invalid_request_error",
        message: "Tag not found",
      },
    });
  });

  itInTransaction("should return 405 for unsupported methods", async () => {
    const { req, res } = await createPrivateApiMockRequest({
      method: "GET",
    });
    req.query.tId = "non-existent-tag";

    await handler(req, res);

    expect(res._getStatusCode()).toBe(405);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, DELETE is expected.",
      },
    });
  });
});
