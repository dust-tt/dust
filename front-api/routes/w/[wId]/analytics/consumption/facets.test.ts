import type { GetConsumptionFacetsResponse } from "@app/lib/api/analytics/consumption/facets";
import { fetchConsumptionFacets } from "@app/lib/api/analytics/consumption/facets";
import { ElasticsearchError } from "@app/lib/api/elasticsearch";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { Err, Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock(import("@app/lib/api/analytics/consumption/facets"), async (orig) => {
  const mod = await orig();
  return { ...mod, fetchConsumptionFacets: vi.fn() };
});

const RESPONSE: GetConsumptionFacetsResponse = {
  period: {
    startDate: "2026-08-04T00:00:00.000Z",
    endDate: "2026-08-11T00:00:00.000Z",
  },
  facets: {
    agent: [
      {
        value: "agent_1",
        label: "Dust",
        pictureUrl: null,
        documentCount: 3,
        disabled: false,
        scope: "global",
      },
    ],
    user: [],
    api_key: [],
    group: [],
    model: [],
    tool: [],
    skill: [],
    source: [],
  },
};

describe("POST /api/w/:wId/analytics/consumption/facets", () => {
  afterEach(() => {
    vi.mocked(fetchConsumptionFacets).mockReset();
  });

  it("returns contextual facets to managers", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      role: "manager",
    });
    vi.mocked(fetchConsumptionFacets).mockResolvedValue(new Ok(RESPONSE));
    const filter = {
      users: ["user_1"],
      api_keys: ["Production key"],
      sources: ["slack"],
    };

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/analytics/consumption/facets`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period: "days", days: 7, filter }),
      }
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(RESPONSE);
    expect(fetchConsumptionFacets).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ filter })
    );
  });

  it("requires a manager and reports Elasticsearch failures", async () => {
    const memberRequest = await createPrivateApiMockRequest({ role: "user" });
    const forbiddenResponse = await honoApp.request(
      `/api/w/${memberRequest.workspace.sId}/analytics/consumption/facets`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }
    );
    expect(forbiddenResponse.status).toBe(403);

    const managerRequest = await createPrivateApiMockRequest({
      role: "manager",
    });
    vi.mocked(fetchConsumptionFacets).mockResolvedValue(
      new Err(new ElasticsearchError("query_error", "query failed"))
    );
    const failedResponse = await honoApp.request(
      `/api/w/${managerRequest.workspace.sId}/analytics/consumption/facets`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }
    );

    expect(failedResponse.status).toBe(500);
  });

  it("rejects unknown filter dimensions", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      role: "manager",
    });

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/analytics/consumption/facets`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filter: { unknown: ["value"] } }),
      }
    );

    expect(response.status).toBe(400);
    expect(fetchConsumptionFacets).not.toHaveBeenCalled();
  });
});
