import {
  ElasticsearchError,
  searchConsumptionAnalytics,
} from "@app/lib/api/elasticsearch";
import { countActiveUsersForPeriodInWorkspace } from "@app/lib/plans/usage/mau";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { Err, Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(import("@app/lib/api/elasticsearch"), async (orig) => {
  const mod = await orig();
  return { ...mod, searchConsumptionAnalytics: vi.fn() };
});

const SINCE = new Date("2026-08-01T00:00:00.000Z");
const TO = new Date("2026-09-01T00:00:00.000Z");

function userBucket(user: string, messageCount: number) {
  return {
    key: { user },
    // Several LLM/tool units must not inflate the activity threshold.
    doc_count: 100,
    messages: {
      buckets: Array.from({ length: messageCount }, (_, index) => ({
        key: `${user}-message-${index}`,
      })),
    },
  };
}

function esResponse(
  buckets: ReturnType<typeof userBucket>[],
  afterKey?: { user: string }
) {
  return {
    took: 1,
    timed_out: false,
    _shards: { total: 1, successful: 1, skipped: 0, failed: 0 },
    hits: { hits: [] },
    aggregations: { users: { buckets, after_key: afterKey } },
  };
}

describe("countActiveUsersForPeriodInWorkspace", () => {
  beforeEach(() => {
    vi.mocked(searchConsumptionAnalytics).mockReset();
  });

  it.each([
    1, 5, 10,
  ])("counts users across pages at the MAU_%i distinct-response threshold", async (messagesPerMonthForMau) => {
    const workspace = await WorkspaceFactory.basic();
    vi.mocked(searchConsumptionAnalytics)
      .mockResolvedValueOnce(
        new Ok(
          esResponse(
            [
              userBucket("below", messagesPerMonthForMau - 1),
              userBucket("at-threshold", messagesPerMonthForMau),
            ],
            { user: "next-page" }
          )
        )
      )
      .mockResolvedValueOnce(
        new Ok(esResponse([userBucket("also-active", messagesPerMonthForMau)]))
      );

    const activeUsers = await countActiveUsersForPeriodInWorkspace({
      workspace,
      messagesPerMonthForMau,
      since: SINCE,
      to: TO,
    });

    expect(activeUsers).toBe(2);
    expect(searchConsumptionAnalytics).toHaveBeenCalledTimes(2);
    const [query, options] = vi.mocked(searchConsumptionAnalytics).mock
      .calls[0];
    expect(query).toEqual({
      bool: {
        filter: [
          { term: { workspace_id: workspace.sId } },
          {
            range: {
              completed_at: { gte: SINCE.toISOString(), lt: TO.toISOString() },
            },
          },
        ],
        must_not: [{ exists: { field: "parent_message_id" } }],
      },
    });
    expect(options).toMatchObject({
      size: 0,
      aggregations: {
        users: {
          composite: {
            sources: [{ user: { terms: { field: "user.id" } } }],
          },
          aggs: {
            messages: {
              terms: {
                field: "agent_message_id",
                size: messagesPerMonthForMau,
                order: { _key: "asc" },
              },
            },
          },
        },
      },
    });
    expect(
      vi.mocked(searchConsumptionAnalytics).mock.calls[1][1]?.aggregations
        ?.users?.composite?.after
    ).toEqual({ user: "next-page" });
  });

  it("returns zero when the consumption index has no qualifying users", async () => {
    const workspace = await WorkspaceFactory.basic();
    vi.mocked(searchConsumptionAnalytics).mockResolvedValue(
      new Ok(esResponse([]))
    );

    const activeUsers = await countActiveUsersForPeriodInWorkspace({
      workspace,
      messagesPerMonthForMau: 1,
      since: SINCE,
      to: TO,
    });

    expect(activeUsers).toBe(0);
  });

  it("throws instead of returning a partial count when a later ES page fails", async () => {
    const workspace = await WorkspaceFactory.basic();
    const error = new ElasticsearchError("connection_error", "ES unavailable");
    vi.mocked(searchConsumptionAnalytics)
      .mockResolvedValueOnce(
        new Ok(esResponse([userBucket("active", 1)], { user: "active" }))
      )
      .mockResolvedValueOnce(new Err(error));

    await expect(
      countActiveUsersForPeriodInWorkspace({
        workspace,
        messagesPerMonthForMau: 1,
        since: SINCE,
        to: TO,
      })
    ).rejects.toBe(error);
  });

  it.each([
    { name: "timeout", response: { ...esResponse([]), timed_out: true } },
    {
      name: "failed shard",
      response: {
        ...esResponse([]),
        _shards: { total: 1, successful: 0, skipped: 0, failed: 1 },
      },
    },
    {
      name: "missing aggregation",
      response: { ...esResponse([]), aggregations: undefined },
    },
  ])("rejects an incomplete response: $name", async ({ response }) => {
    const workspace = await WorkspaceFactory.basic();
    vi.mocked(searchConsumptionAnalytics).mockResolvedValue(new Ok(response));

    await expect(
      countActiveUsersForPeriodInWorkspace({
        workspace,
        messagesPerMonthForMau: 1,
        since: SINCE,
        to: TO,
      })
    ).rejects.toThrow("Incomplete Elasticsearch response");
  });
});
