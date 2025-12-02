import { describe, expect, it, vi } from "vitest";

import { MAX_SEARCH_EMAILS } from "@app/lib/memberships";
import { MembershipModel } from "@app/lib/resources/storage/models/membership";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { Ok } from "@app/types";

import handler from "./search";

// Mock the searchUsers function to use SQL instead of Elasticsearch
vi.mock("@app/lib/user_search/search", () => ({
  searchUsers: vi.fn(
    async ({
      owner,
      searchTerm,
      offset,
      limit,
    }: {
      owner: { sId: string; id: number };
      searchTerm: string;
      offset: number;
      limit: number;
    }) => {
      // Load all users that are members of the workspace
      const users = await UserModel.findAll({
        include: [
          {
            model: MembershipModel,
            as: "memberships",
            required: true,
            where: {
              workspaceId: owner.id,
            },
          },
        ],
      });

      // Filter by search term (case-insensitive matching on email or full name)
      // If searchTerm is empty or undefined, return all users
      const filteredUsers =
        searchTerm && searchTerm.trim()
          ? users.filter((user) => {
              const lowerSearchTerm = searchTerm.toLowerCase();
              const email = user.email?.toLowerCase() || "";
              const fullName =
                `${user.firstName ?? ""} ${user.lastName ?? ""}`.toLowerCase();
              return (
                email.includes(lowerSearchTerm) ||
                fullName.includes(lowerSearchTerm)
              );
            })
          : users;

      // Apply pagination
      const paginatedUsers = filteredUsers.slice(offset, offset + limit);

      // Convert to UserSearchDocument format
      const userDocs = paginatedUsers.map((user) => ({
        user_id: user.sId,
        email: user.email,
        full_name: `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim(),
        updated_at: user.updatedAt,
      }));

      return new Ok({
        users: userDocs,
        total: filteredUsers.length,
      });
    }
  ),
}));

describe("GET /api/w/[wId]/members/search", () => {
  // We need search to work for all users as they can be added as editors of an agent by anyone.
  it("allows users to search members", async () => {
    const { req, res, user } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);

    const data = res._getJSONData();
    expect(data.total).toBe(1);
    expect(data.members).toHaveLength(1);
    expect(data.members[0].id).toBe(user.id);
    expect(data.members[0].workspace.role).toBe("user");
  });

  it("returns 405 for non-GET methods", async () => {
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

  it("handles search by term", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });

    // Create users with specific names for search
    const users = await Promise.all([
      UserFactory.basic(),
      UserFactory.basic(),
      UserFactory.basic(),
    ]);

    await Promise.all(
      users.map((user) =>
        MembershipFactory.associate(workspace, user, { role: "user" })
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

  it("handles search by emails", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });

    const users = await Promise.all([
      UserFactory.basic(),
      UserFactory.basic(),
      UserFactory.basic(),
    ]);

    await Promise.all(
      users.map((user) =>
        MembershipFactory.associate(workspace, user, { role: "user" })
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

  it("returns 400 when too many emails provided", async () => {
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

  it("handles pagination with search results", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });

    // Create 29 (+1 from createPrivateApiMockRequest) users with similar names
    const users = await Promise.all(
      Array(29)
        .fill(null)
        .map(() => UserFactory.basic())
    );

    await Promise.all(
      users.map((user) =>
        MembershipFactory.associate(workspace, user, { role: "user" })
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

  it("handles empty search results", async () => {
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

  it("returns all members when searchTerm is empty string", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });

    // Create additional users
    const users = await Promise.all([
      UserFactory.basic(),
      UserFactory.basic(),
      UserFactory.basic(),
    ]);

    await Promise.all(
      users.map((user) =>
        MembershipFactory.associate(workspace, user, { role: "user" })
      )
    );

    req.query.searchTerm = "";
    req.query.offset = "0";
    req.query.limit = "25";

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    // Should return all 4 users (3 created + 1 from createPrivateApiMockRequest)
    expect(data.total).toBe(4);
    expect(data.members).toHaveLength(4);
  });
});
