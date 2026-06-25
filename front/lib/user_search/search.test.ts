import { beforeEach, describe, expect, it, vi } from "vitest";

const mockClientSearch = vi.hoisted(() => vi.fn());

vi.mock("@app/lib/api/elasticsearch", async () => {
  const { Ok } = await import("@app/types/shared/result");

  return {
    USER_SEARCH_ALIAS_NAME: "front.user_search",
    withEs: async (
      fn: (client: { search: typeof mockClientSearch }) => Promise<unknown>
    ) => new Ok(await fn({ search: mockClientSearch })),
  };
});

import { searchAllUsers, searchUsers } from "@app/lib/user_search/search";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";

describe("user_search/search", () => {
  beforeEach(() => {
    mockClientSearch.mockReset();
  });

  it("requests exact totals for paginated user searches", async () => {
    const workspace = await WorkspaceFactory.basic();

    mockClientSearch.mockResolvedValue({
      hits: {
        total: { value: 12345, relation: "eq" },
        hits: [],
      },
    });

    const result = await searchUsers({
      owner: workspace,
      searchTerm: "",
      offset: 0,
      limit: 25,
      orderBy: { field: "name", direction: "asc" },
    });

    expect(mockClientSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        track_total_hits: true,
      })
    );
    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      return;
    }

    expect(result.value.total).toBe(12345);
  });

  it("pages through all matching users with search_after", async () => {
    const workspace = await WorkspaceFactory.basic();
    const updatedAt = new Date("2026-01-01T00:00:00.000Z");
    const firstPageHits = Array.from({ length: 1000 }, (_, index) => {
      const userNumber = index + 1;
      const fullName = `User ${userNumber.toString().padStart(4, "0")}`;
      const userId = `user-${userNumber}`;

      return {
        _source: {
          workspace_id: workspace.sId,
          user_id: userId,
          email: `${userId}@example.com`,
          full_name: fullName,
          updated_at: updatedAt,
        },
        sort: [fullName, userId],
      };
    });

    mockClientSearch
      .mockResolvedValueOnce({
        hits: {
          total: { value: 1002, relation: "eq" },
          hits: firstPageHits,
        },
      })
      .mockResolvedValueOnce({
        hits: {
          total: { value: 1002, relation: "eq" },
          hits: [
            {
              _source: {
                workspace_id: workspace.sId,
                user_id: "user-1001",
                email: "user-1001@example.com",
                full_name: "User 1001",
                updated_at: updatedAt,
              },
              sort: ["User 1001", "user-1001"],
            },
            {
              _source: {
                workspace_id: workspace.sId,
                user_id: "user-1002",
                email: "user-1002@example.com",
                full_name: "User 1002",
                updated_at: updatedAt,
              },
              sort: ["User 1002", "user-1002"],
            },
          ],
        },
      });

    const result = await searchAllUsers({
      owner: workspace,
      searchTerm: "user",
    });

    expect(mockClientSearch).toHaveBeenCalledTimes(2);
    expect(mockClientSearch.mock.calls[0][0]).toMatchObject({
      index: "front.user_search",
      size: 1000,
      sort: [
        { "full_name.keyword": { order: "asc" } },
        { user_id: { order: "asc" } },
      ],
      track_total_hits: true,
    });
    expect(mockClientSearch.mock.calls[1][0]).toMatchObject({
      search_after: ["User 1000", "user-1000"],
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      return;
    }

    expect(result.value.total).toBe(1002);
    expect(result.value.users).toHaveLength(1002);
    expect(result.value.users[0]?.user_id).toBe("user-1");
    expect(result.value.users[1001]?.user_id).toBe("user-1002");
  });
});
