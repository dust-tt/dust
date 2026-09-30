import { searchAnalytics } from "@app/lib/api/elasticsearch";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import { describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/elasticsearch", async (importActual) => {
  const actual =
    await importActual<typeof import("@app/lib/api/elasticsearch")>();
  return { ...actual, searchAnalytics: vi.fn() };
});

function mockAgentBuckets(agentIds: string[]) {
  vi.mocked(searchAnalytics).mockResolvedValue(
    new Ok({
      took: 1,
      timed_out: false,
      _shards: { total: 1, successful: 1, skipped: 0, failed: 0 },
      hits: { total: { value: 0, relation: "eq" }, hits: [] },
      aggregations: {
        export_data: {
          buckets: agentIds.map((agent) => ({
            key: {
              date: Date.UTC(2026, 8, 1),
              agent,
              api_key: "key",
              origin: "api",
            },
            doc_count: 1,
            total_cost: { value: 1_000_000 },
          })),
        },
      },
    })
  );
}

function getExportRequest(wId: string) {
  return honoApp.request(
    `/api/w/${wId}/analytics/programmatic-cost-export?billingCycleStartDay=1`
  );
}

describe("GET /api/w/:wId/analytics/programmatic-cost-export", () => {
  it("returns 403 for non-admin users", async () => {
    for (const role of ["user", "manager"] as const) {
      vi.mocked(searchAnalytics).mockClear();
      const { workspace } = await createPrivateApiMockRequest({ role });

      const response = await getExportRequest(workspace.sId);

      expect(response.status).toBe(403);
      expect(vi.mocked(searchAnalytics)).not.toHaveBeenCalled();
    }
  });

  it("resolves agent names within the workspace from their current version", async () => {
    const { authenticator: otherAuth } = await createResourceTest({
      role: "admin",
    });
    const otherWorkspaceAgent = await AgentConfigurationFactory.createTestAgent(
      otherAuth,
      { name: "Other Workspace Agent" }
    );

    const { workspace, auth: authorAuth } = await createPrivateApiMockRequest({
      role: "user",
    });
    const hiddenAgent = await AgentConfigurationFactory.createTestAgent(
      authorAuth,
      { name: "Hidden Agent", scope: "hidden" }
    );

    const { auth: adminAuth } = await createPrivateApiMockRequest({
      role: "admin",
      workspace,
    });
    const renamedAgent = await AgentConfigurationFactory.createTestAgent(
      adminAuth,
      { name: "Original Agent" }
    );
    await AgentConfigurationFactory.updateTestAgent(
      adminAuth,
      renamedAgent.sId,
      { name: "Renamed Agent" }
    );

    mockAgentBuckets([
      renamedAgent.sId,
      hiddenAgent.sId,
      otherWorkspaceAgent.sId,
    ]);

    const response = await getExportRequest(workspace.sId);

    expect(response.status).toBe(200);
    const csv = await response.text();
    expect(csv).toContain("Renamed Agent");
    expect(csv).not.toContain("Original Agent");
    expect(csv).toContain("Hidden Agent");
    expect(csv).toContain(otherWorkspaceAgent.sId);
    expect(csv).not.toContain("Other Workspace Agent");
  });
});
