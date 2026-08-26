import {
  analystQuery,
  buildAnalystScope,
} from "@app/lib/api/analytics/analyst/scope";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { describe, expect, it } from "vitest";

describe("buildAnalystScope", () => {
  it("converts an inclusive endOf('day') endDate to a half-open range", () => {
    // resolveTimeWindow's explicit-range branch returns endOf("day"), i.e.
    // 23:59:59.999 — bumping by 1ms must land exactly on the next midnight.
    const scope = buildAnalystScope({
      startDate: "2026-07-01T00:00:00.000Z",
      endDate: "2026-07-13T23:59:59.999Z",
      timezone: "UTC",
    });
    expect(scope.startDate).toBe("2026-07-01T00:00:00.000Z");
    expect(scope.endDate).toBe("2026-07-14T00:00:00.000Z");
  });

  it("converts a 'now' endDate (no endOf-day rounding) the same way", () => {
    // resolveTimeWindow's relative-period branch returns `now.toISOString()`
    // verbatim, with no endOf("day") — the +1ms conversion must be uniform
    // across both branches, not conditioned on the input looking rounded.
    const scope = buildAnalystScope({
      startDate: "2026-07-01T00:00:00.000Z",
      endDate: "2026-07-13T14:32:07.123Z",
      timezone: "UTC",
    });
    expect(scope.endDate).toBe("2026-07-13T14:32:07.124Z");
  });

  it("puts agentIds, userIds and modelIds in the scope filter", () => {
    const scope = buildAnalystScope({
      startDate: "2026-07-01T00:00:00.000Z",
      endDate: "2026-07-13T00:00:00.000Z",
      timezone: "UTC",
      agentIds: ["a1"],
      userIds: ["u1", "u2"],
      modelIds: ["gpt-5.6-luna"],
    });
    expect(scope.filter).toEqual({
      agents: ["a1"],
      users: ["u1", "u2"],
      models: ["gpt-5.6-luna"],
    });
    expect(scope.extraFilters).toEqual([]);
  });

  it("puts a single agentTagIds value in extraFilters as a term, never in filter", () => {
    const scope = buildAnalystScope({
      startDate: "2026-07-01T00:00:00.000Z",
      endDate: "2026-07-13T00:00:00.000Z",
      timezone: "UTC",
      agentTagIds: ["tag1"],
    });
    expect(scope.filter).toEqual({});
    expect(scope.extraFilters).toEqual([{ term: { "agent.tag_ids": "tag1" } }]);
  });

  it("puts multiple agentTagIds values in extraFilters as a terms clause", () => {
    const scope = buildAnalystScope({
      startDate: "2026-07-01T00:00:00.000Z",
      endDate: "2026-07-13T00:00:00.000Z",
      timezone: "UTC",
      agentTagIds: ["tag1", "tag2"],
    });
    expect(scope.extraFilters).toEqual([
      { terms: { "agent.tag_ids": ["tag1", "tag2"] } },
    ]);
  });

  it("filters 'unknown' source as a missing-context_origin clause", () => {
    const scope = buildAnalystScope({
      startDate: "2026-07-01T00:00:00.000Z",
      endDate: "2026-07-13T00:00:00.000Z",
      timezone: "UTC",
      source: "unknown",
    });
    expect(scope.extraFilters).toEqual([
      {
        bool: {
          should: [
            { term: { context_origin: "unknown" } },
            { bool: { must_not: { exists: { field: "context_origin" } } } },
          ],
          minimum_should_match: 1,
        },
      },
    ]);
  });

  it("filters a regular source as a context_origin term", () => {
    const scope = buildAnalystScope({
      startDate: "2026-07-01T00:00:00.000Z",
      endDate: "2026-07-13T00:00:00.000Z",
      timezone: "UTC",
      source: "web",
    });
    expect(scope.extraFilters).toEqual([{ term: { context_origin: "web" } }]);
  });
});

describe("analystQuery", () => {
  it("scopes to the workspace and merges the scope's extraFilters with the caller's extra", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    const scope = buildAnalystScope({
      startDate: "2026-07-01T00:00:00.000Z",
      endDate: "2026-07-13T00:00:00.000Z",
      timezone: "UTC",
      agentTagIds: ["tag1"],
    });

    const query = analystQuery({
      auth: authenticator,
      scope,
      extra: [{ exists: { field: "user.id" } }],
    });

    expect(query).toEqual({
      bool: {
        filter: [
          {
            term: { workspace_id: authenticator.getNonNullableWorkspace().sId },
          },
          {
            range: {
              completed_at: {
                gte: "2026-07-01T00:00:00.000Z",
                lt: "2026-07-13T00:00:00.001Z",
              },
            },
          },
          { term: { "agent.tag_ids": "tag1" } },
          { exists: { field: "user.id" } },
        ],
      },
    });
  });
});
