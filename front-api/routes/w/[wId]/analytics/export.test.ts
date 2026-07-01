import {
  exportTable,
  stringifyExportTableAsCsv,
} from "@app/lib/api/analytics/export_tables";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import type { MembershipRoleType } from "@app/types/memberships";
import { Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import { describe, expect, it, vi } from "vitest";

// devModeConstants reads localStorage at module load. jsdom does not always
// have localStorage initialized when mock factories evaluate, which crashes
// any test whose mocked lib transitively imports AuthContext. Stub it here.
vi.mock("@app/components/dev/devModeConstants", () => ({
  DEV_MODE_STORAGE_KEY: "dust_dev_mode",
  DEV_MODE_ACTIVE: false,
}));

vi.mock(import("@app/lib/api/analytics/export_tables"), async (orig) => {
  const mod = await orig();
  return {
    ...mod,
    exportTable: vi.fn(),
    stringifyExportTableAsCsv: vi.fn(),
  };
});

async function setupTest({ role = "admin" as MembershipRoleType } = {}) {
  const { workspace, ...rest } = await createPrivateApiMockRequest({ role });
  return { workspace, ...rest };
}

const VALID_QUERY = {
  table: "usage_metrics",
  startDate: "2026-01-01",
  endDate: "2026-01-31",
};

function exportRequest(
  wId: string,
  query: Record<string, string> = VALID_QUERY
) {
  const qs = new URLSearchParams(query).toString();
  return honoApp.request(`/api/w/${wId}/analytics/export${qs ? `?${qs}` : ""}`);
}

describe("GET /api/w/:wId/analytics/export", () => {
  it("returns 403 for users without analytics permission", async () => {
    const { workspace } = await setupTest({ role: "user" });

    const response = await exportRequest(workspace.sId);

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { type: "workspace_auth_error" },
    });
    expect(vi.mocked(exportTable)).not.toHaveBeenCalled();
  });

  it("returns 200 with CSV for admin users", async () => {
    vi.mocked(exportTable).mockResolvedValue(
      new Ok({
        table: "usage_metrics",
        headers: ["date", "messages", "conversations", "activeUsers"] as const,
        rows: [],
      })
    );
    vi.mocked(stringifyExportTableAsCsv).mockReturnValue("date,messages\n");
    const { workspace } = await setupTest();

    const response = await exportRequest(workspace.sId);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/csv");
    expect(response.headers.get("Content-Disposition")).toContain(
      "dust_usage_metrics_2026-01-01_2026-01-31.csv"
    );
    expect(await response.text()).toBe("date,messages\n");
  });

  it("returns 200 with JSON rows when format is json", async () => {
    const rows = [
      { date: "2026-01-01", messages: 3, conversations: 2, activeUsers: 1 },
    ];
    vi.mocked(exportTable).mockResolvedValue(
      new Ok({
        table: "usage_metrics",
        headers: ["date", "messages", "conversations", "activeUsers"] as const,
        rows,
      })
    );
    const { workspace } = await setupTest();

    const response = await exportRequest(workspace.sId, {
      ...VALID_QUERY,
      format: "json",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(rows);
  });

  it("returns 400 when required params are missing", async () => {
    const { workspace } = await setupTest();

    const response = await exportRequest(workspace.sId, {});

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { type: "invalid_request_error" },
    });
    expect(vi.mocked(exportTable)).not.toHaveBeenCalled();
  });
});
