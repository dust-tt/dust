import { fetchAutomationTriggerBreakdown } from "@app/lib/api/analytics/automations/breakdown";
import { resolveDimensionLabels } from "@app/lib/api/analytics/consumption/labels";
import type { ConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import {
  ElasticsearchError,
  searchConsumptionAnalytics,
} from "@app/lib/api/elasticsearch";
import { Authenticator } from "@app/lib/auth";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { Err, Ok } from "@app/types/shared/result";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock(import("@app/lib/api/elasticsearch"), async (orig) => {
  const mod = await orig();
  return { ...mod, searchConsumptionAnalytics: vi.fn() };
});

vi.mock(import("@app/lib/api/analytics/consumption/labels"), async (orig) => {
  const mod = await orig();
  return { ...mod, resolveDimensionLabels: vi.fn() };
});

const PERIOD: ConsumptionPeriod = {
  startDate: "2026-07-01T00:00:00.000Z",
  endDate: "2026-08-01T00:00:00.000Z",
};

function bucket(key: string, creditMicro: number) {
  return { key, credit_micro: { value: creditMicro } };
}

function mockAggs({
  tool = [],
  model = [],
  skill = [],
  totalMicro,
}: {
  tool?: unknown[];
  model?: unknown[];
  skill?: unknown[];
  totalMicro: number;
}) {
  vi.mocked(searchConsumptionAnalytics).mockResolvedValue(
    new Ok({
      aggregations: {
        by_tool: { buckets: tool },
        by_model: { buckets: model },
        by_skill: { buckets: skill },
        total_credit_micro: { value: totalMicro },
      },
    }) as Awaited<ReturnType<typeof searchConsumptionAnalytics>>
  );
}

function mockLabel(key: string, name: string) {
  vi.mocked(resolveDimensionLabels).mockResolvedValue(
    new Map([[key, { name, pictureUrl: null, description: null }]])
  );
}

async function setup() {
  const workspace = await WorkspaceFactory.basic();
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  return { auth };
}

describe("fetchAutomationTriggerBreakdown", () => {
  afterEach(() => {
    vi.mocked(searchConsumptionAnalytics).mockReset();
    vi.mocked(resolveDimensionLabels).mockReset();
  });

  it("picks the tool dimension when it has the largest bucket", async () => {
    const { auth } = await setup();
    mockAggs({
      tool: [bucket("web_search", 6_000_000)],
      model: [bucket("claude-opus-5", 3_000_000)],
      skill: [bucket("skl_1", 1_000_000)],
      totalMicro: 10_000_000,
    });
    mockLabel("web_search", "Web Search");

    const result = await fetchAutomationTriggerBreakdown(auth, {
      triggerId: "trg1",
      period: PERIOD,
    });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    expect(result.value.creditDestination).toEqual({
      dimension: "tool",
      key: "web_search",
      name: "Web Search",
      icon: null,
      credits: 6,
      share: 0.6,
    });
    expect(resolveDimensionLabels).toHaveBeenCalledWith(auth, "tool", [
      "web_search",
    ]);
  });

  it("picks the model dimension when it outranks tool and skill", async () => {
    const { auth } = await setup();
    mockAggs({
      tool: [bucket("web_search", 1_000_000)],
      model: [bucket("claude-opus-5", 7_000_000)],
      skill: [bucket("skl_1", 2_000_000)],
      totalMicro: 10_000_000,
    });
    mockLabel("claude-opus-5", "Claude Opus 5");

    const result = await fetchAutomationTriggerBreakdown(auth, {
      triggerId: "trg1",
      period: PERIOD,
    });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    expect(result.value.creditDestination).toMatchObject({
      dimension: "model",
      key: "claude-opus-5",
      credits: 7,
    });
  });

  it("picks the skill dimension when it outranks tool and model", async () => {
    const { auth } = await setup();
    mockAggs({
      tool: [bucket("web_search", 1_000_000)],
      model: [bucket("claude-opus-5", 2_000_000)],
      skill: [bucket("skl_1", 8_000_000)],
      totalMicro: 10_000_000,
    });
    mockLabel("skl_1", "Research");

    const result = await fetchAutomationTriggerBreakdown(auth, {
      triggerId: "trg1",
      period: PERIOD,
    });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    expect(result.value.creditDestination).toMatchObject({
      dimension: "skill",
      key: "skl_1",
      credits: 8,
    });
  });

  it("returns no destination when the trigger has no attributed consumption", async () => {
    const { auth } = await setup();
    mockAggs({ totalMicro: 0 });

    const result = await fetchAutomationTriggerBreakdown(auth, {
      triggerId: "trg1",
      period: PERIOD,
    });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    expect(result.value.creditDestination).toBeNull();
    expect(resolveDimensionLabels).not.toHaveBeenCalled();
  });

  it("returns the search error unchanged when the query fails", async () => {
    const { auth } = await setup();
    vi.mocked(searchConsumptionAnalytics).mockResolvedValue(
      new Err(new ElasticsearchError("query_error", "boom"))
    );

    const result = await fetchAutomationTriggerBreakdown(auth, {
      triggerId: "trg1",
      period: PERIOD,
    });

    expect(result.isErr()).toBe(true);
  });
});
