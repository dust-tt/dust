import { beforeEach, describe, expect, it, vi } from "vitest";

const search = vi.hoisted(() => vi.fn());
vi.mock("@app/lib/api/elasticsearch", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@app/lib/api/elasticsearch")>();
  const { Ok } = await import("@app/types/shared/result");
  return {
    ...original,
    withEs: async (
      fn: (client: { search: typeof search }) => Promise<unknown>
    ) => new Ok(await fn({ search })),
  };
});

import {
  fetchSearchActiveUsers,
  readCodeDefinedActiveUsers,
  readCodeDefinedSkillActiveUsers,
  storeCodeDefinedActiveUsers,
  storeCodeDefinedSkillActiveUsers,
} from "@app/lib/search/usage";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";

describe("search usage snapshots", () => {
  beforeEach(() => {
    search.mockReset();
  });

  it.each([
    ["skill", "tool.attributed_skill_ids"],
    ["agent", "agent.attributed_id"],
  ] as const)("paginates distinct active users for %s using a fixed UTC window", async (resourceType, field) => {
    search
      .mockResolvedValueOnce({
        aggregations: {
          resources: {
            buckets: [
              { key: { resource_id: "first" }, active_users: { value: 3 } },
            ],
            after_key: { resource_id: "first" },
          },
        },
      })
      .mockResolvedValueOnce({
        aggregations: {
          resources: {
            buckets: [
              { key: { resource_id: "second" }, active_users: { value: 2 } },
            ],
          },
        },
      });
    const result = await fetchSearchActiveUsers({
      workspaceId: "workspace-1",
      resourceType,
      evaluatedAtMs: Date.parse("2026-09-08T13:00:00Z"),
    });
    expect(result.isOk() && result.value).toEqual({ first: 3, second: 2 });
    expect(search).toHaveBeenCalledTimes(2);
    for (const [query] of search.mock.calls) {
      expect(query).toMatchObject({
        size: 0,
        allow_partial_search_results: false,
        query: {
          bool: {
            filter: expect.arrayContaining([
              { term: { workspace_id: "workspace-1" } },
              {
                range: {
                  completed_at: {
                    gte: "2026-08-09T00:00:00.000Z",
                    lt: "2026-09-08T00:00:00.000Z",
                  },
                },
              },
            ]),
          },
        },
        aggs: {
          resources: {
            composite: { sources: [{ resource_id: { terms: { field } } }] },
            aggs: { active_users: { cardinality: { field: "user.id" } } },
          },
        },
      });
    }
    expect(search.mock.calls[1][0].aggs.resources.composite.after).toEqual({
      resource_id: "first",
    });
  });

  it.each([
    { timed_out: true },
    {},
  ])("does not treat incomplete usage as zero: %j", async (response) => {
    search.mockResolvedValue(response);
    const result = await fetchSearchActiveUsers({
      workspaceId: "workspace-1",
      resourceType: "skill",
      evaluatedAtMs: Date.now(),
    });
    expect(result.isErr()).toBe(true);
  });

  it("fails if composite pagination does not advance", async () => {
    search.mockResolvedValue({
      aggregations: {
        resources: {
          buckets: [
            { key: { resource_id: "first" }, active_users: { value: 3 } },
          ],
          after_key: { resource_id: "first" },
        },
      },
    });
    const result = await fetchSearchActiveUsers({
      workspaceId: "workspace-1",
      resourceType: "skill",
      evaluatedAtMs: Date.now(),
    });
    expect(result.isErr()).toBe(true);
    expect(search).toHaveBeenCalledTimes(2);
  });

  it("keeps code-defined usage workspace-scoped and replaces stale counts", async () => {
    await storeCodeDefinedSkillActiveUsers("workspace-a", {
      "go-deep": 7,
      skl_custom: 3,
    });
    await storeCodeDefinedSkillActiveUsers("workspace-b", { "go-deep": 1 });
    expect(await readCodeDefinedSkillActiveUsers("workspace-a")).toEqual({
      "go-deep": 7,
    });
    expect(await readCodeDefinedSkillActiveUsers("workspace-b")).toEqual({
      "go-deep": 1,
    });
    await storeCodeDefinedSkillActiveUsers("workspace-a", {});
    expect(await readCodeDefinedSkillActiveUsers("workspace-a")).toEqual({});
  });

  it("separates global agent usage from skills and other workspaces, and clears missing counts", async () => {
    const counts = { [GLOBAL_AGENTS_SID.HELPER]: 9, customAgentId: 2 };
    await storeCodeDefinedActiveUsers({
      workspaceId: "workspace-a",
      resourceType: "agent",
      counts,
    });
    await storeCodeDefinedActiveUsers({
      workspaceId: "workspace-b",
      resourceType: "agent",
      counts: { [GLOBAL_AGENTS_SID.HELPER]: 1 },
    });
    await storeCodeDefinedSkillActiveUsers("workspace-a", {
      [GLOBAL_AGENTS_SID.HELPER]: 5,
    });
    expect(
      await readCodeDefinedActiveUsers({
        workspaceId: "workspace-a",
        resourceType: "agent",
      })
    ).toEqual({ [GLOBAL_AGENTS_SID.HELPER]: 9 });
    expect(
      await readCodeDefinedActiveUsers({
        workspaceId: "workspace-b",
        resourceType: "agent",
      })
    ).toEqual({ [GLOBAL_AGENTS_SID.HELPER]: 1 });
    expect(await readCodeDefinedSkillActiveUsers("workspace-a")).toEqual({
      [GLOBAL_AGENTS_SID.HELPER]: 5,
    });
    await storeCodeDefinedActiveUsers({
      workspaceId: "workspace-a",
      resourceType: "agent",
      counts: {},
    });
    expect(
      await readCodeDefinedActiveUsers({
        workspaceId: "workspace-a",
        resourceType: "agent",
      })
    ).toEqual({});
  });
});
