import { describe, expect } from "vitest";

import { MAX_SEARCH_EMAILS } from "@app/lib/memberships";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { membershipFactory } from "@app/tests/utils/MembershipFactory";
import { userFactory } from "@app/tests/utils/UserFactory";
import { itInTransaction } from "@app/tests/utils/utils";

import handler from "./search";

describe("GET /api/w/[wId]/members/search", () => {
  itInTransaction("returns 403 for non-admin users", async () => {
    const { req, res } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "workspace_auth_error",
        message:
          "Only users that are `admins` for the current workspace can search memberships.",
      },
    });
  });

  itInTransaction("returns 405 for non-GET methods", async () => {
    for (const method of ["POST", "PUT", "DELETE"] as const) {
      const { req, res } = await createPrivateApiMockRequest({
        method,
        role: "admin",
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(405);
      expect(res._getJSONData()).toEqual({
        error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET is expected.",
        },
      });
    }
  });

  itInTransaction("handles search by term", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });

    // Create users with specific names for search
    const users = await Promise.all([
      userFactory().basic().create(),
      userFactory().basic().create(),
      userFactory().basic().create(),
    ]);

    await Promise.all(
      users.map((user) =>
        membershipFactory().associate(workspace, user, "user").create()
      )
    );

    req.query.searchTerm = users[0].email;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.total).toBe(1);
    expect(data.members).toHaveLength(1);
    expect(data.members[0].id).toBe(users[0].id);
  });

  itInTransaction("handles search by emails", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });

    const users = await Promise.all([
      userFactory().basic().create(),
      userFactory().basic().create(),
      userFactory().basic().create(),
    ]);

    await Promise.all(
      users.map((user) =>
        membershipFactory().associate(workspace, user, "user").create()
      )
    );

    req.query.searchEmails = users[0].email + "," + users[1].email;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.total).toBe(2);
    expect(data.members).toHaveLength(2);
    expect(data.members.map((m: any) => m.email)).toContain(users[0].email);
    expect(data.members.map((m: any) => m.email)).toContain(users[1].email);
  });

  itInTransaction("returns 400 when too many emails provided", async () => {
    const { req, res } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });

    // Create a string with more than MAX_SEARCH_EMAILS emails
    const tooManyEmails = Array(MAX_SEARCH_EMAILS + 1)
      .fill(null)
      .map((_, i) => `user${i}@example.com`)
      .join(",");

    req.query.searchEmails = tooManyEmails;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "invalid_request_error",
        message: `Too many emails provided. Maximum is ${MAX_SEARCH_EMAILS}.`,
      },
    });
  });

  itInTransaction("handles pagination with search results", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });

    // Create 29 (+1 from createPrivateApiMockRequest) users with similar names
    const users = await Promise.all(
      Array(29)
        .fill(null)
        .map(() => userFactory().basic().create())
    );

    await Promise.all(
      users.map((user) =>
        membershipFactory().associate(workspace, user, "user").create()
      )
    );

    req.query.limit = "20";
    req.query.offset = "0";

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.total).toBe(30);
    expect(data.members).toHaveLength(20);
  });

  itInTransaction("handles empty search results", async () => {
    const { req, res } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });

    req.query.searchTerm = "NonexistentUser";

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.total).toBe(0);
    expect(data.members).toHaveLength(0);
  });
});
