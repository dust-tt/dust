import { MAX_SEARCH_EMAILS } from "@app/lib/memberships";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import type { MembershipRoleType } from "@app/types/memberships";
import { Ok } from "@app/types/shared/result";
import type { LightWorkspaceType } from "@app/types/user";
import { describe, expect, it, vi } from "vitest";

// Stub Elasticsearch-backed search with a SQL implementation so tests don't
// depend on a running ES cluster.
vi.mock(import("@app/lib/user_search/search"), async (importOriginal) => {
  const mod = await importOriginal();
  return {
    ...mod,
    searchUsers: vi.fn(
      async ({
        owner,
        searchTerm,
        offset,
        limit,
        userIds,
      }: {
        owner: LightWorkspaceType;
        searchTerm: string;
        offset: number;
        limit: number;
        userIds?: string[];
      }) => {
        const { memberships } =
          await MembershipResource.getMembershipsForWorkspace({
            workspace: owner,
            includeUser: true,
          });

        const allowedUserIds = userIds ? new Set(userIds) : undefined;
        const users = memberships
          .map((m) => m.user)
          .filter((u): u is NonNullable<typeof u> => u !== undefined)
          .filter((u) => !allowedUserIds || allowedUserIds.has(u.sId));

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
          workspace_id: owner.sId,
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
  };
});

import { honoApp } from "@front-api/app";

async function setup(role: MembershipRoleType = "admin") {
  const { workspace, user } = await createPrivateApiMockRequest({ role });
  return { workspace, user };
}

function searchUrl(wId: string, params: Record<string, string> = {}) {
  const qs = new URLSearchParams(params).toString();
  const base = `/api/w/${wId}/members/search`;
  return qs ? `${base}?${qs}` : base;
}

describe("GET /api/w/:wId/members/search", () => {
  it("allows users to search members", async () => {
    const { workspace, user } = await setup("user");

    const response = await honoApp.request(searchUrl(workspace.sId));

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.total).toBe(1);
    expect(data.members).toHaveLength(1);
    expect(data.members[0].sId).toBe(user.sId);
    // Non-admin users receive minimal essential user data plus workspace info.
    expect(data.members[0].workspace).toBeDefined();
    expect(data.members[0].email).toBeDefined();
    expect(data.members[0].id).toBeUndefined();
  });

  it("handles search by term", async () => {
    const { workspace } = await setup();

    const users = await Promise.all([
      UserFactory.basic(),
      UserFactory.basic(),
      UserFactory.basic(),
    ]);

    await Promise.all(
      users.map((u) =>
        MembershipFactory.associate(workspace, u, { role: "user" })
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
    const { workspace } = await setup();

    const users = await Promise.all([
      UserFactory.basic(),
      UserFactory.basic(),
      UserFactory.basic(),
    ]);

    await Promise.all(
      users.map((u) =>
        MembershipFactory.associate(workspace, u, { role: "user" })
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

  it("filters members by role", async () => {
    const { workspace, user: adminUser } = await setup();

    const [member, otherAdmin] = await Promise.all([
      UserFactory.basic(),
      UserFactory.basic(),
    ]);

    await MembershipFactory.associate(workspace, member, { role: "user" });
    await MembershipFactory.associate(workspace, otherAdmin, {
      role: "admin",
    });

    const response = await honoApp.request(
      searchUrl(workspace.sId, { role: "admin" })
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.total).toBe(2);
    expect(data.members.map((m: { sId: string }) => m.sId).sort()).toEqual(
      [adminUser.sId, otherAdmin.sId].sort()
    );
  });

  it("returns every member when filtering on the member role", async () => {
    const { workspace } = await setup();

    const [member, otherMember] = await Promise.all([
      UserFactory.basic(),
      UserFactory.basic(),
    ]);

    await MembershipFactory.associate(workspace, member, { role: "user" });
    await MembershipFactory.associate(workspace, otherMember, { role: "user" });

    const response = await honoApp.request(
      searchUrl(workspace.sId, { role: "user" })
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.total).toBe(2);
    expect(data.members.map((m: { sId: string }) => m.sId).sort()).toEqual(
      [member.sId, otherMember.sId].sort()
    );
  });

  it("combines the role filter with the search term", async () => {
    const { workspace } = await setup();

    const [member, otherAdmin] = await Promise.all([
      UserFactory.basic(),
      UserFactory.basic(),
    ]);

    await MembershipFactory.associate(workspace, member, { role: "user" });
    await MembershipFactory.associate(workspace, otherAdmin, {
      role: "admin",
    });

    const response = await honoApp.request(
      searchUrl(workspace.sId, { role: "admin", searchTerm: member.email })
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.total).toBe(0);
    expect(data.members).toHaveLength(0);
  });

  it("returns 400 on an unknown role filter", async () => {
    const { workspace } = await setup();

    const response = await honoApp.request(
      searchUrl(workspace.sId, { role: "not-a-role" })
    );

    expect(response.status).toBe(400);
  });

  it("returns 400 when too many emails provided", async () => {
    const { workspace } = await setup();

    const tooManyEmails = Array(MAX_SEARCH_EMAILS + 1)
      .fill(null)
      .map((_, i) => `user${i}@example.com`)
      .join(",");

    const response = await honoApp.request(
      searchUrl(workspace.sId, { searchEmails: tooManyEmails })
    );

    expect(response.status).toBe(400);
  });

  it("handles pagination with search results", async () => {
    const { workspace } = await setup();

    const users = await Promise.all(
      Array(29)
        .fill(null)
        .map(() => UserFactory.basic())
    );

    await Promise.all(
      users.map((u) =>
        MembershipFactory.associate(workspace, u, { role: "user" })
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
    const { workspace } = await setup();

    const response = await honoApp.request(
      searchUrl(workspace.sId, { searchTerm: "NonexistentUser" })
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.total).toBe(0);
    expect(data.members).toHaveLength(0);
  });

  it("returns only light user fields for non-admin users", async () => {
    const { workspace, user } = await setup("user");

    const response = await honoApp.request(searchUrl(workspace.sId));

    expect(response.status).toBe(200);
    const data = await response.json();
    const member = data.members[0];

    // Light fields are present.
    expect(member.sId).toBe(user.sId);
    expect(member.firstName).toBe(user.firstName);
    expect(member.lastName).toBe(user.lastName);
    expect(member.fullName).toBeDefined();
    expect(member).toHaveProperty("image");

    // Workspace info (role) is still present for non-admins.
    expect(member.workspace).toBeDefined();

    // Non-admins receive only minimal essential fields; admin-only fields are absent.
    expect(member.email).toBeDefined();
    expect(member.id).toBeUndefined();
    expect(member.provider).toBeUndefined();
    expect(member.username).toBeUndefined();
  });

  it("allows non-admin users to search by term", async () => {
    const { workspace } = await setup("user");

    const users = await Promise.all([UserFactory.basic(), UserFactory.basic()]);

    await Promise.all(
      users.map((u) =>
        MembershipFactory.associate(workspace, u, { role: "user" })
      )
    );

    const response = await honoApp.request(
      searchUrl(workspace.sId, { searchTerm: users[0].email })
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.total).toBe(1);
    expect(data.members).toHaveLength(1);
    expect(data.members[0].sId).toBe(users[0].sId);
    // Non-admin receives minimal essential data including email.
    expect(data.members[0].email).toBeDefined();
  });

  it("paginates correctly for non-admin users", async () => {
    const { workspace } = await setup("user");

    const users = await Promise.all(
      Array(5)
        .fill(null)
        .map(() => UserFactory.basic())
    );

    await Promise.all(
      users.map((u) =>
        MembershipFactory.associate(workspace, u, { role: "user" })
      )
    );

    const response = await honoApp.request(
      searchUrl(workspace.sId, { limit: "3", offset: "0" })
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    // 5 created + 1 from setup = 6 total.
    expect(data.total).toBe(6);
    expect(data.members).toHaveLength(3);
    // Every member should have light shape (minimal essential data + workspace).
    for (const member of data.members) {
      expect(member.workspace).toBeDefined();
      expect(member.email).toBeDefined();
    }
  });
});
