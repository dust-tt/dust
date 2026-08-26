import { buildAnalystScope } from "@app/lib/api/analytics/analyst/scope";
import {
  fetchAnalystTopSkills,
  fetchAnalystTopTools,
} from "@app/lib/api/analytics/analyst/top_invocations";
import { resolveDimensionLabels } from "@app/lib/api/analytics/consumption/labels";
import {
  ElasticsearchError,
  searchConsumptionAnalytics,
} from "@app/lib/api/elasticsearch";
import { Authenticator } from "@app/lib/auth";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { Err, Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(import("@app/lib/api/elasticsearch"), async (orig) => {
  const mod = await orig();
  return { ...mod, searchConsumptionAnalytics: vi.fn() };
});

vi.mock(import("@app/lib/api/analytics/consumption/labels"), async (orig) => {
  const mod = await orig();
  return { ...mod, resolveDimensionLabels: vi.fn() };
});

function esResponse(
  aggregations: unknown
): Awaited<ReturnType<typeof searchConsumptionAnalytics>> {
  return new Ok({
    took: 1,
    timed_out: false,
    _shards: { total: 1, successful: 1, skipped: 0, failed: 0 },
    hits: { total: { value: 0, relation: "eq" }, hits: [] },
    aggregations,
  });
}

async function setup() {
  const workspace = await WorkspaceFactory.basic();
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  const scope = buildAnalystScope({
    startDate: "2026-07-01T00:00:00.000Z",
    endDate: "2026-08-01T00:00:00.000Z",
  });
  return { auth, scope };
}

describe("fetchAnalystTopSkills", () => {
  beforeEach(() => {
    vi.mocked(searchConsumptionAnalytics).mockReset();
    vi.mocked(resolveDimensionLabels).mockReset();
  });

  it("counts tool calls per skill via a terms agg on tool.attributed_skill_ids", async () => {
    const { auth, scope } = await setup();
    vi.mocked(searchConsumptionAnalytics).mockResolvedValue(
      esResponse({
        by_group: {
          buckets: [{ key: "skl_1", doc_count: 12 }],
        },
      })
    );
    vi.mocked(resolveDimensionLabels).mockResolvedValue(
      new Map([
        [
          "skl_1",
          { name: "Deep Research", pictureUrl: null, description: null },
        ],
      ])
    );

    const result = await fetchAnalystTopSkills({ auth, scope, limit: 25 });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    expect(result.value).toEqual([
      { skillId: "skl_1", skillName: "Deep Research", totalExecutions: 12 },
    ]);

    const [query, options] = vi.mocked(searchConsumptionAnalytics).mock
      .calls[0];
    expect(options?.aggregations).toEqual({
      by_group: {
        terms: {
          field: "tool.attributed_skill_ids",
          size: 25,
          order: { _count: "desc" },
        },
      },
    });
    expect(query).toMatchObject({
      bool: {
        filter: expect.arrayContaining([
          { exists: { field: "tool.attributed_skill_ids" } },
        ]),
      },
    });
  });

  it("falls back to the raw skill id when the label does not resolve", async () => {
    const { auth, scope } = await setup();
    vi.mocked(searchConsumptionAnalytics).mockResolvedValue(
      esResponse({
        by_group: { buckets: [{ key: "skl_deleted", doc_count: 3 }] },
      })
    );
    vi.mocked(resolveDimensionLabels).mockResolvedValue(new Map());

    const result = await fetchAnalystTopSkills({ auth, scope, limit: 25 });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    expect(result.value).toEqual([
      { skillId: "skl_deleted", skillName: "skl_deleted", totalExecutions: 3 },
    ]);
  });

  it("propagates an Elasticsearch error", async () => {
    const { auth, scope } = await setup();
    vi.mocked(searchConsumptionAnalytics).mockResolvedValue(
      new Err(new ElasticsearchError("query_error", "boom"))
    );

    const result = await fetchAnalystTopSkills({ auth, scope, limit: 25 });

    expect(result.isErr()).toBe(true);
  });
});

describe("fetchAnalystTopTools", () => {
  beforeEach(() => {
    vi.mocked(searchConsumptionAnalytics).mockReset();
    vi.mocked(resolveDimensionLabels).mockReset();
  });

  it("counts tool calls per server via a terms agg on tool.server_name", async () => {
    const { auth, scope } = await setup();
    vi.mocked(searchConsumptionAnalytics).mockResolvedValue(
      esResponse({
        by_group: {
          buckets: [{ key: "web_search_&_browse", doc_count: 7 }],
        },
      })
    );
    vi.mocked(resolveDimensionLabels).mockResolvedValue(
      new Map([
        [
          "web_search_&_browse",
          { name: "Web search & browse", pictureUrl: null, description: null },
        ],
      ])
    );

    const result = await fetchAnalystTopTools({ auth, scope, limit: 25 });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    expect(result.value).toEqual([
      {
        serverName: "web_search_&_browse",
        displayName: "Web search & browse",
        totalExecutions: 7,
      },
    ]);

    const [, options] = vi.mocked(searchConsumptionAnalytics).mock.calls[0];
    expect(options?.aggregations).toEqual({
      by_group: {
        terms: {
          field: "tool.server_name",
          size: 25,
          order: { _count: "desc" },
        },
      },
    });
  });

  it("falls back to the raw server name when the label does not resolve", async () => {
    const { auth, scope } = await setup();
    vi.mocked(searchConsumptionAnalytics).mockResolvedValue(
      esResponse({
        by_group: { buckets: [{ key: "custom_server", doc_count: 2 }] },
      })
    );
    vi.mocked(resolveDimensionLabels).mockResolvedValue(new Map());

    const result = await fetchAnalystTopTools({ auth, scope, limit: 25 });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    expect(result.value).toEqual([
      {
        serverName: "custom_server",
        displayName: "custom_server",
        totalExecutions: 2,
      },
    ]);
  });
});
