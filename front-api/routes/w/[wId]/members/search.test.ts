import { MAX_SEARCH_EMAILS } from "@app/lib/memberships";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
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
      }: {
        owner: LightWorkspaceType;
        searchTerm: string;
        offset: number;
        limit: number;
      }) => {
        const { memberships } =
          await MembershipResource.getMembershipsForWorkspace({
            workspace: owner,
            includeUser: true,
          });

        const users = memberships
          .map((m) => m.user)
          .filter((u): u is NonNullable<typeof u> => u !== undefined);

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

async function setup(role: "builder" | "user" | "admin" = "admin") {
  const { workspace, user } = await createPrivateApiMockRequest({ role });
  return { workspace, user };
}

function searchUrl(wId: string, params: Record<string, string> = {}) {
  const qs = new URLSearchParams(params).toString();
  const base = `/api/w/${wId}/members/search`;
  return qs ? `${base}?${qs}` : base;
}

describe("GET /api/w/:wId/members/search", () => {
  it("returns 403 for non-admin users", async () => {
    const { workspace } = await setup("user");

    const response = await honoApp.request(searchUrl(workspace.sId));

    expect(response.status).toBe(403);
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

  it("filters to only builders and admins when buildersOnly=true", async () => {
    const { workspace } = await setup();

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
});
