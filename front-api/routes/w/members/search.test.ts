import { describe, expect, it, vi } from "vitest";

import { MAX_SEARCH_EMAILS } from "@app/lib/memberships";
import { MembershipModel } from "@app/lib/resources/storage/models/membership";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { Ok } from "@app/types/shared/result";

import { honoApp } from "../../../app";

// Mock the searchUsers function to use SQL instead of Elasticsearch.
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
      const users = await UserModel.findAll({
        include: [
          {
            model: MembershipModel,
            as: "memberships",
            required: true,
            where: { workspaceId: owner.id },
          },
        ],
      });

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

      const paginatedUsers = filteredUsers.slice(offset, offset + limit);

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

function searchUrl(wId: string, params: Record<string, string> = {}) {
  const qs = new URLSearchParams(params).toString();
  const base = `/api/w/${wId}/members/search`;
  return qs ? `${base}?${qs}` : base;
}

describe("GET /api/w/:wId/members/search", () => {
  it("allows users to search members", async () => {
    const { workspace, user } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
    });

    const response = await honoApp.request(searchUrl(workspace.sId));

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.total).toBe(1);
    expect(data.members).toHaveLength(1);
    expect(data.members[0].id).toBe(user.id);
    expect(data.members[0].workspace.role).toBe("user");
  });

  it("handles search by term", async () => {
    const { workspace } = await createPrivateApiMockRequest({
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

    const response = await honoApp.request(
      searchUrl(workspace.sId, { searchTerm: users[0].email })
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.total).toBe(1);
    expect(data.members).toHaveLength(1);
    expect(data.members[0].id).toBe(users[0].id);
  });

  it("handles search by emails", async () => {
    const { workspace } = await createPrivateApiMockRequest({
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

    const response = await honoApp.request(
      searchUrl(workspace.sId, {
        searchEmails: `${users[0].email},${users[1].email}`,
      })
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.total).toBe(2);
    expect(data.members).toHaveLength(2);
    expect(data.members.map((m: { email: string }) => m.email)).toContain(
      users[0].email
    );
    expect(data.members.map((m: { email: string }) => m.email)).toContain(
      users[1].email
    );
  });

  it("returns 400 when too many emails provided", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });

    const tooManyEmails = Array(MAX_SEARCH_EMAILS + 1)
      .fill(null)
      .map((_, i) => `user${i}@example.com`)
      .join(",");

    const response = await honoApp.request(
      searchUrl(workspace.sId, { searchEmails: tooManyEmails })
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        type: "invalid_request_error",
        message: `Too many emails provided. Maximum is ${MAX_SEARCH_EMAILS}.`,
      },
    });
  });

  it("handles pagination with search results", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });

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

    const response = await honoApp.request(
      searchUrl(workspace.sId, { limit: "20", offset: "0" })
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.total).toBe(30);
    expect(data.members).toHaveLength(20);
  });

  it("handles empty search results", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });

    const response = await honoApp.request(
      searchUrl(workspace.sId, { searchTerm: "NonexistentUser" })
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.total).toBe(0);
    expect(data.members).toHaveLength(0);
  });

  it("returns all members when searchTerm is empty string", async () => {
    const { workspace } = await createPrivateApiMockRequest({
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

    const response = await honoApp.request(
      searchUrl(workspace.sId, {
        searchTerm: "",
        offset: "0",
        limit: "25",
      })
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.total).toBe(4);
    expect(data.members).toHaveLength(4);
  });

  it("filters to only builders and admins when buildersOnly=true", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });

    const users = await Promise.all([
      UserFactory.basic(),
      UserFactory.basic(),
      UserFactory.basic(),
      UserFactory.basic(),
    ]);

    await Promise.all([
      MembershipFactory.associate(workspace, users[0], { role: "admin" }),
      MembershipFactory.associate(workspace, users[1], { role: "builder" }),
      MembershipFactory.associate(workspace, users[2], { role: "user" }),
      MembershipFactory.associate(workspace, users[3], { role: "user" }),
    ]);

    const response = await honoApp.request(
      searchUrl(workspace.sId, {
        buildersOnly: "true",
        offset: "0",
        limit: "25",
      })
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.total).toBe(3);
    expect(data.members).toHaveLength(3);
    for (const member of data.members) {
      expect(["admin", "builder"]).toContain(member.workspace.role);
    }
  });

  it("returns all members when buildersOnly=false", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });

    const users = await Promise.all([UserFactory.basic(), UserFactory.basic()]);

    await Promise.all([
      MembershipFactory.associate(workspace, users[0], { role: "builder" }),
      MembershipFactory.associate(workspace, users[1], { role: "user" }),
    ]);

    const response = await honoApp.request(
      searchUrl(workspace.sId, {
        buildersOnly: "false",
        offset: "0",
        limit: "25",
      })
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.total).toBe(3);
    expect(data.members).toHaveLength(3);
  });

  it("returns all members when buildersOnly is not provided", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });

    const users = await Promise.all([UserFactory.basic(), UserFactory.basic()]);

    await Promise.all([
      MembershipFactory.associate(workspace, users[0], { role: "builder" }),
      MembershipFactory.associate(workspace, users[1], { role: "user" }),
    ]);

    const response = await honoApp.request(
      searchUrl(workspace.sId, { offset: "0", limit: "25" })
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.total).toBe(3);
    expect(data.members).toHaveLength(3);
  });

  it("combines buildersOnly filter with searchTerm", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });

    const users = await Promise.all([
      UserFactory.basic(),
      UserFactory.basic(),
      UserFactory.basic(),
    ]);

    await Promise.all([
      MembershipFactory.associate(workspace, users[0], { role: "builder" }),
      MembershipFactory.associate(workspace, users[1], { role: "builder" }),
      MembershipFactory.associate(workspace, users[2], { role: "user" }),
    ]);

    const response = await honoApp.request(
      searchUrl(workspace.sId, {
        searchTerm: users[0].email,
        buildersOnly: "true",
        offset: "0",
        limit: "25",
      })
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.total).toBe(1);
    expect(data.members).toHaveLength(1);
    expect(data.members[0].email).toBe(users[0].email);
    expect(data.members[0].workspace.role).toBe("builder");
  });

  it("returns empty when searching for non-builder with buildersOnly=true", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });

    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "user" });

    const response = await honoApp.request(
      searchUrl(workspace.sId, {
        searchTerm: user.email,
        buildersOnly: "true",
        offset: "0",
        limit: "25",
      })
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.total).toBe(0);
    expect(data.members).toHaveLength(0);
  });
});
