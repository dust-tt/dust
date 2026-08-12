import { buildConsumptionScopeQuery } from "@app/lib/api/analytics/consumption/scope";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { describe, expect, it } from "vitest";

const WINDOW = {
  startDate: "2026-07-01T00:00:00.000Z",
  endDate: "2026-07-13T00:00:00.000Z",
};

describe("buildConsumptionScopeQuery", () => {
  it("scopes to the workspace over a half-open window", async () => {
    const { authenticator } = await createResourceTest({
      role: "admin",
    });
    expect(
      buildConsumptionScopeQuery({ auth: authenticator, ...WINDOW })
    ).toEqual({
      bool: {
        filter: [
          {
            term: { workspace_id: authenticator.getNonNullableWorkspace().sId },
          },
          {
            range: {
              completed_at: { gte: WINDOW.startDate, lt: WINDOW.endDate },
            },
          },
        ],
      },
    });
  });

  it("maps each dimension to its index field, single value as a term", async () => {
    const { authenticator } = await createResourceTest({
      role: "admin",
    });
    const query = buildConsumptionScopeQuery({
      auth: authenticator,
      ...WINDOW,
      filter: {
        agents: ["a1"],
        users: ["u1", "u2"],
        groups: ["group1"],
        models: ["gpt-5.6-luna"],
        tools: ["web_search_&_browse"],
        skills: ["s1"],
        sources: ["web"],
      },
    });

    expect(query.bool?.filter).toEqual([
      { term: { workspace_id: authenticator.getNonNullableWorkspace().sId } },
      expect.objectContaining({ range: expect.anything() }),
      { term: { "agent.id": "a1" } },
      { terms: { "user.id": ["u1", "u2"] } },
      { term: { "user.group_ids": "group1" } },
      { term: { "model.model_id": "gpt-5.6-luna" } },
      { term: { "tool.server_name": "web_search_&_browse" } },
      { term: { "tool.attributed_skill_ids": "s1" } },
      { term: { context_origin: "web" } },
    ]);
  });

  it("ignores empty selections", async () => {
    const { authenticator } = await createResourceTest({
      role: "admin",
    });
    const query = buildConsumptionScopeQuery({
      auth: authenticator,
      ...WINDOW,
      filter: { agents: [], users: [""] },
    });

    expect(query.bool?.filter).toHaveLength(2);
  });
});
