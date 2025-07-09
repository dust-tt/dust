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

  itInTransaction("should not delete a tag if user is not admin", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "DELETE",
    });
    const tag = await TagFactory.create(workspace, { name: "test-tag" });
    req.query.tId = tag.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "invalid_request_error",
        message: "Only workspace administrators can delete tags",
      },
    });
  });

  itInTransaction("should delete a tag", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "DELETE",
      role: "admin",
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
      role: "admin",
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
});
