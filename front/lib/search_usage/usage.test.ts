import { beforeEach, describe, expect, it, vi } from "vitest";

const search = vi.hoisted(() => vi.fn());
vi.mock("@app/lib/api/elasticsearch", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@app/lib/api/elasticsearch")>();
  return {
    ...original,
    searchConsumptionAnalytics: search,
  };
});

import { ElasticsearchError } from "@app/lib/api/elasticsearch";
import { USER_USAGE_ORIGINS } from "@app/lib/api/programmatic_usage/common";
import { fetchSearchActiveUsers } from "@app/lib/search_usage/usage";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { Err, Ok } from "@app/types/shared/result";

describe("search usage snapshots", () => {
  beforeEach(() => {
    search.mockReset();
  });

  it.each([
    ["skill", "tool.attributed_skill_ids"],
    ["agent", "agent.attributed_id"],
  ] as const)("paginates distinct active users for %s using a fixed UTC window", async (dimension, field) => {
    const { authenticator: auth, workspace } = await createResourceTest({
      role: "admin",
    });
    search
      .mockResolvedValueOnce(
        new Ok({
          aggregations: {
            resources: {
              buckets: [
                { key: { resource_id: "first" }, active_users: { value: 3 } },
              ],
              after_key: { resource_id: "first" },
            },
          },
        })
      )
      .mockResolvedValueOnce(
        new Ok({
          aggregations: {
            resources: {
              buckets: [
                { key: { resource_id: "second" }, active_users: { value: 2 } },
              ],
            },
          },
        })
      );
    const result = await fetchSearchActiveUsers(auth, {
      dimension,
      evaluatedAtMs: Date.parse("2026-09-08T13:00:00Z"),
    });
    expect(result.isOk() && result.value).toEqual({ first: 3, second: 2 });
    expect(search).toHaveBeenCalledTimes(2);
    for (const [query, options] of search.mock.calls) {
      expect(query).toMatchObject({
        bool: {
          filter: expect.arrayContaining([
            { term: { workspace_id: workspace.sId } },
            { terms: { context_origin: USER_USAGE_ORIGINS } },
            { exists: { field: "user.id" } },
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
      });
      expect(options).toMatchObject({
        size: 0,
        allow_partial_search_results: false,
        aggregations: {
          resources: {
            composite: { sources: [{ resource_id: { terms: { field } } }] },
            aggs: { active_users: { cardinality: { field: "user.id" } } },
          },
        },
      });
    }
    expect(
      search.mock.calls[1][1].aggregations.resources.composite.after
    ).toEqual({
      resource_id: "first",
    });
  });

  it.each([
    { timed_out: true },
    {},
  ])("does not treat incomplete usage as zero: %j", async (response) => {
    const { authenticator: auth } = await createResourceTest({ role: "admin" });
    search.mockResolvedValue(new Ok(response));
    const result = await fetchSearchActiveUsers(auth, {
      dimension: "skill",
      evaluatedAtMs: Date.now(),
    });
    expect(result.isErr()).toBe(true);
  });

  it("fails if composite pagination does not advance", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "admin" });
    search.mockResolvedValue(
      new Ok({
        aggregations: {
          resources: {
            buckets: [
              { key: { resource_id: "first" }, active_users: { value: 3 } },
            ],
            after_key: { resource_id: "first" },
          },
        },
      })
    );
    const result = await fetchSearchActiveUsers(auth, {
      dimension: "skill",
      evaluatedAtMs: Date.now(),
    });
    expect(result.isErr()).toBe(true);
    expect(search).toHaveBeenCalledTimes(2);
  });

  it("propagates consumption search failures", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "admin" });
    const error = new ElasticsearchError("connection_error", "Search failed");
    search.mockResolvedValue(new Err(error));

    const result = await fetchSearchActiveUsers(auth, {
      dimension: "skill",
      evaluatedAtMs: Date.now(),
    });

    expect(result).toEqual(new Err(error));
  });
});
