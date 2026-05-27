import { parseQueryString } from "@app/lib/utils/router";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { honoApp } from "@front-api/app";
import { describe, expect, it, vi } from "vitest";

import { DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT } from "./index";

async function setup(role: "builder" | "user" | "admin" = "admin") {
  const { workspace } = await createPrivateApiMockRequest({ role });
  return { workspace };
}

function membersUrl(wId: string, params: Record<string, string> = {}) {
  const qs = new URLSearchParams(params).toString();
  const base = `/api/w/${wId}/members`;
  return qs ? `${base}?${qs}` : base;
}

describe("GET /api/w/:wId/members", () => {
  it("returns all members for admin", async () => {
    const { workspace } = await setup("admin");

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

    const response = await honoApp.request(membersUrl(workspace.sId));

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.total).toBe(4);
    expect(data.members).toHaveLength(4);
    expect(data.members[0]).toHaveProperty("id");
    expect(data.members[0]).toHaveProperty("email");
    expect(data.nextPageUrl).toBeUndefined();
  });

  it("returns 403 for non-admin users", async () => {
    const { workspace } = await setup("user");

    const response = await honoApp.request(membersUrl(workspace.sId));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: {
        type: "workspace_auth_error",
        message: "Only users that are `admins` can perform this action.",
      },
    });
  });

  it("returns 403 for builder users", async () => {
    const { workspace } = await setup("builder");

    const response = await honoApp.request(membersUrl(workspace.sId));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: {
        type: "workspace_auth_error",
        message: "Only users that are `admins` can perform this action.",
      },
    });
  });

  it("returns only admin members when role=admin is provided", async () => {
    const { workspace } = await setup("admin");

    const users = await Promise.all([
      UserFactory.basic(),
      UserFactory.basic(),
      UserFactory.basic(),
    ]);

    await Promise.all([
      MembershipFactory.associate(workspace, users[0], { role: "admin" }),
      MembershipFactory.associate(workspace, users[1], { role: "admin" }),
      MembershipFactory.associate(workspace, users[2], { role: "user" }),
    ]);

    const response = await honoApp.request(
      membersUrl(workspace.sId, { role: "admin" })
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.members).toHaveLength(3);
    expect(data.total).toBe(3);
    expect(data.nextPageUrl).toBeUndefined();
    data.members.forEach((member: { workspaces: { role: string }[] }) => {
      expect(member.workspaces[0].role).toBe("admin");
    });
  });

  it("handles pagination with default parameters", async () => {
    const { workspace } = await setup("admin");

    const users = await Promise.all(
      Array(DEFAULT_PAGE_LIMIT + 4)
        .fill(null)
        .map(() => UserFactory.basic())
    );

    await Promise.all(
      users.map((user) =>
        MembershipFactory.associate(workspace, user, { role: "user" })
      )
    );

    const response = await honoApp.request(membersUrl(workspace.sId));

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.total).toBe(DEFAULT_PAGE_LIMIT + 5);
    expect(data.members).toHaveLength(DEFAULT_PAGE_LIMIT);
    expect(data.nextPageUrl).toBeDefined();
  });

  it("falls back to default limit if requested limit exceeds maximum", async () => {
    const { workspace } = await setup("admin");

    const users = await Promise.all(
      Array(MAX_PAGE_LIMIT + 49)
        .fill(null)
        .map(() => UserFactory.basic())
    );

    await Promise.all(
      users.map((user) =>
        MembershipFactory.associate(workspace, user, { role: "user" })
      )
    );

    const response = await honoApp.request(
      membersUrl(workspace.sId, { limit: "200" })
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.total).toBe(MAX_PAGE_LIMIT + 50);
    expect(data.members).toHaveLength(DEFAULT_PAGE_LIMIT);
    expect(data.nextPageUrl).toBeDefined();
  });

  it("handles custom pagination parameters", async () => {
    const { workspace } = await setup("admin");

    const users = [];
    for (let i = 0; i < 9; i++) {
      const createdAt = new Date(new Date().getTime() - (i + 1) * 1000);
      const user = await UserFactory.withCreatedAt(createdAt);

      vi.useFakeTimers();
      vi.setSystemTime(createdAt);
      await MembershipFactory.associate(workspace, user, { role: "user" });
      vi.useRealTimers();

      users.push(user);
    }

    const response = await honoApp.request(
      membersUrl(workspace.sId, {
        limit: "5",
        orderColumn: "createdAt",
        orderDirection: "desc",
      })
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.total).toBe(10);
    expect(data.members).toHaveLength(5);
    expect(data.nextPageUrl).toBeDefined();
    const memberCreatedAts = data.members.map(
      (m: { createdAt: number }) => m.createdAt
    );
    for (let i = 0; i < memberCreatedAts.length - 1; i++) {
      expect(memberCreatedAts[i]).toBeGreaterThanOrEqual(
        memberCreatedAts[i + 1]
      );
    }
  });

  it("returns correct first and second pages", async () => {
    const { workspace } = await setup("admin");

    const users = [];
    for (let i = 0; i < 15; i++) {
      const createdAt = new Date(new Date().getTime() - (i + 1) * 1000);
      const user = await UserFactory.withCreatedAt(createdAt);
      vi.useFakeTimers();
      vi.setSystemTime(createdAt);
      await MembershipFactory.associate(workspace, user, { role: "user" });
      vi.useRealTimers();

      users.push(user);
    }

    const firstResponse = await honoApp.request(
      membersUrl(workspace.sId, {
        limit: "10",
        orderColumn: "createdAt",
        orderDirection: "desc",
      })
    );

    expect(firstResponse.status).toBe(200);
    const firstPageData = await firstResponse.json();

    expect(firstPageData.total).toBe(16);
    expect(firstPageData.members).toHaveLength(10);
    expect(firstPageData.nextPageUrl).toBeDefined();

    const nextParams = parseQueryString(firstPageData.nextPageUrl);
    const stringParams: Record<string, string> = {};
    for (const [k, v] of Object.entries(nextParams)) {
      if (typeof v === "string") {
        stringParams[k] = v;
      }
    }
    const secondResponse = await honoApp.request(
      membersUrl(workspace.sId, stringParams)
    );

    expect(secondResponse.status).toBe(200);
    const secondPageData = await secondResponse.json();

    expect(secondPageData.total).toBe(16);
    expect(secondPageData.members).toHaveLength(6);

    const firstPageIds = new Set(
      firstPageData.members.map((m: { id: number }) => m.id)
    );
    const secondPageIds = new Set(
      secondPageData.members.map((m: { id: number }) => m.id)
    );
    const intersection = [...firstPageIds].filter((id) =>
      secondPageIds.has(id)
    );
    expect(intersection).toHaveLength(0);
  });

  it("returns 200 for invalid pagination limit and falls back", async () => {
    const { workspace } = await setup("admin");

    const response = await honoApp.request(
      membersUrl(workspace.sId, { limit: "-1" })
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.members).toHaveLength(1);
  });

  it("returns 200 for invalid orderColumn and falls back", async () => {
    const { workspace } = await setup("admin");

    const response = await honoApp.request(
      membersUrl(workspace.sId, { limit: "10", orderColumn: "invalidColumn" })
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.members).toHaveLength(1);
  });

  it("returns 200 for empty lastValue", async () => {
    const { workspace } = await setup("admin");

    const response = await honoApp.request(
      membersUrl(workspace.sId, { lastValue: "" })
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.members).toHaveLength(1);
  });
});
