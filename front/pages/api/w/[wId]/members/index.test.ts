import type { NextApiRequest, NextApiResponse } from "next";
import { createMocks } from "node-mocks-http";
import { describe, expect } from "vitest";

import { parseQueryString } from "@app/lib/utils/router";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { membershipFactory } from "@app/tests/utils/MembershipFactory";
import { userFactory } from "@app/tests/utils/UserFactory";
import { itInTransaction } from "@app/tests/utils/utils";

import handler from "./index";

describe("GET /api/w/[wId]/members", () => {
  itInTransaction("returns all members for admin", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });

    // Create additional members
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

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.total).toBe(4); // 3 created users + 1 from createPrivateApiMockRequest
    expect(data.members).toHaveLength(4);
    expect(data.members[0]).toHaveProperty("id");
    expect(data.members[0]).toHaveProperty("email");
    expect(data.nextPageUrl).toBeUndefined();
  });

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
          "Only users that are `admins` for the current workspace can see memberships or modify it.",
      },
    });
  });

  itInTransaction(
    "returns only admin members for builder with admin role query",
    async () => {
      const { req, res, workspace } = await createPrivateApiMockRequest({
        method: "GET",
        role: "builder",
      });

      // Create additional members with different roles
      const users = await Promise.all([
        userFactory().basic().create(),
        userFactory().basic().create(),
        userFactory().basic().create(),
      ]);

      await Promise.all([
        membershipFactory().associate(workspace, users[0], "admin").create(),
        membershipFactory().associate(workspace, users[1], "admin").create(),
        membershipFactory().associate(workspace, users[2], "user").create(),
      ]);

      // Add admin role query parameter
      req.query.role = "admin";

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const data = res._getJSONData();
      expect(data.members).toHaveLength(2); // Only admin users
      expect(data.total).toBe(2);
      expect(data.nextPageUrl).toBeUndefined();
      data.members.forEach((member: any) => {
        expect(member.workspaces[0].role).toBe("admin");
      });
    }
  );

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

  itInTransaction("handles pagination with default parameters", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });

    // Create 55 members (more than default limit of 50)
    const users = await Promise.all(
      Array(54) // +1 from createPrivateApiMockRequest
        .fill(null)
        .map(() => userFactory().basic().create())
    );

    await Promise.all(
      users.map((user) =>
        membershipFactory().associate(workspace, user, "user").create()
      )
    );

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.total).toBe(55);
    expect(data.members).toHaveLength(50); // Default limit
    expect(data.nextPageUrl).toBeDefined();
  });

  itInTransaction(
    "falls back to default limit if requested limit exceeds maximum",
    async () => {
      const { req, res, workspace } = await createPrivateApiMockRequest({
        method: "GET",
        role: "admin",
      });

      // Create 200 members (more than max limit of 150)
      const users = await Promise.all(
        Array(199) // +1 from createPrivateApiMockRequest
          .fill(null)
          .map(() => userFactory().basic().create())
      );

      await Promise.all(
        users.map((user) =>
          membershipFactory().associate(workspace, user, "user").create()
        )
      );

      // Request more than max allowed limit
      req.query.limit = "200";

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const data = res._getJSONData();
      expect(data.total).toBe(200);
      expect(data.members).toHaveLength(50); // Should fall back to default limit
      expect(data.nextPageUrl).toBeDefined();
    }
  );

  itInTransaction("handles custom pagination parameters", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });

    // Create 10 members
    const users = [];

    for (let i = 0; i < 9; i++) {
      const createdAt = new Date(new Date().getTime() - (i + 1) * 1000);
      const user = await userFactory().withCreatedAt(createdAt).create();
      await membershipFactory()
        .associateWithCreatedAt(workspace, user, "user", createdAt)
        .create();
      users.push(user);
    }

    // Set custom pagination parameters
    req.query.limit = "5";
    req.query.orderColumn = "createdAt";
    req.query.orderDirection = "desc";

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.total).toBe(10);
    expect(data.members).toHaveLength(5);
    expect(data.nextPageUrl).toBeDefined();
    // Check that members are ordered by createdAt in descending order
    const memberCreatedAts = data.members.map((m: any) => m.createdAt);
    for (let i = 0; i < memberCreatedAts.length - 1; i++) {
      expect(memberCreatedAts[i]).toBeGreaterThanOrEqual(
        memberCreatedAts[i + 1]
      );
    }
  });

  itInTransaction("returns correct first and second pages", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });

    // Create 15 members
    const users = [];
    for (let i = 0; i < 15; i++) {
      // Todo: we have to set the same date to both because pagination is done on membership createdAt
      // but we return users with their createdAt
      const createdAt = new Date(new Date().getTime() - (i + 1) * 1000);
      const user = await userFactory().withCreatedAt(createdAt).create();
      await membershipFactory()
        .associateWithCreatedAt(workspace, user, "user", createdAt)
        .create();

      users.push(user);
    }

    // Get first page
    req.query.limit = "10";
    req.query.orderColumn = "createdAt";
    req.query.orderDirection = "desc";

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const firstPageData = res._getJSONData();

    expect(firstPageData.total).toBe(16); // 15 created + 1 admin
    expect(firstPageData.members).toHaveLength(10);
    expect(firstPageData.nextPageUrl).toBeDefined();

    const { req: req2, res: res2 } = createMocks<
      NextApiRequest,
      NextApiResponse
    >({
      method: "GET",
      query: parseQueryString(firstPageData.nextPageUrl),
      headers: {},
    });

    await handler(req2, res2);

    expect(res2._getStatusCode()).toBe(200);
    const secondPageData = res2._getJSONData();

    expect(secondPageData.total).toBe(16);
    expect(secondPageData.members).toHaveLength(6);

    // Verify no overlap between pages
    const firstPageIds = new Set(firstPageData.members.map((m: any) => m.id));
    const secondPageIds = new Set(secondPageData.members.map((m: any) => m.id));
    const intersection = [...firstPageIds].filter((id) =>
      secondPageIds.has(id)
    );
    expect(intersection).toHaveLength(0);

    // Verify ordering
    const allMembers = [...firstPageData.members, ...secondPageData.members];
    for (let i = 0; i < allMembers.length - 1; i++) {
      expect(allMembers[i].createdAt).toBeGreaterThanOrEqual(
        allMembers[i + 1].createdAt
      );
    }
  });

  itInTransaction(
    "returns 200 for invalid pagination limit and fallback",
    async () => {
      const { req, res } = await createPrivateApiMockRequest({
        method: "GET",
        role: "admin",
      });

      // Test invalid limit
      req.query.limit = "-1";

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(res._getJSONData().members).toHaveLength(1);
    }
  );

  itInTransaction(
    "returns 200 for invalid pagination orderColumn and use ",
    async () => {
      const { req, res } = await createPrivateApiMockRequest({
        method: "GET",
        role: "admin",
      });

      // Test invalid order column
      req.query.limit = "10";
      req.query.orderColumn = "invalidColumn";

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(res._getJSONData().members).toHaveLength(1);
    }
  );

  itInTransaction("returns 200 for empty lastValue", async () => {
    const { req, res } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });

    req.query.lastValue = "";

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData().members).toHaveLength(1);
  });
});
