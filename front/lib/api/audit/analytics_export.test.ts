import * as workosAudit from "@app/lib/api/audit/workos_audit";
import { Authenticator } from "@app/lib/auth";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { emitAnalyticsExportedEvent } from "./analytics_export";

vi.mock("@app/lib/api/audit/workos_audit", async () => {
  const actual = await vi.importActual<typeof workosAudit>(
    "@app/lib/api/audit/workos_audit"
  );
  return {
    ...actual,
    emitAuditLogEvent: vi.fn(),
  };
});

describe("emitAnalyticsExportedEvent", () => {
  beforeEach(() => {
    vi.mocked(workosAudit.emitAuditLogEvent).mockClear();
    vi.mocked(workosAudit.emitAuditLogEvent).mockResolvedValue(undefined);
  });

  it("flattens query pairs and drops undefined entries", async () => {
    const workspace = await WorkspaceFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    await emitAnalyticsExportedEvent(auth, {
      exportName: "analytics_table",
      format: "csv",
      dataset: "users",
      query: {
        timezone: "UTC",
        days: 30,
        groupBy: undefined,
      },
    });

    expect(workosAudit.emitAuditLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "analytics.exported",
        metadata: expect.objectContaining({
          export_name: "analytics_table",
          dataset: "users",
          format: "csv",
          export_query: "timezone=UTC&days=30",
        }),
      })
    );
    const metadata = vi.mocked(workosAudit.emitAuditLogEvent).mock.calls[0][0]
      .metadata;
    expect(metadata).not.toHaveProperty("file_name");
    expect(metadata).not.toHaveProperty("row_count");
    expect(metadata).not.toHaveProperty("period_start");
    expect(metadata).not.toHaveProperty("period_end");
  });

  it("omits export_query when every query value is absent", async () => {
    const workspace = await WorkspaceFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    await emitAnalyticsExportedEvent(auth, {
      exportName: "consumption_lines",
      format: "csv",
      fileName: "raw.csv",
      query: { search: undefined },
    });

    const metadata = vi.mocked(workosAudit.emitAuditLogEvent).mock.calls[0][0]
      .metadata;
    expect(metadata).toEqual(
      expect.objectContaining({
        export_name: "consumption_lines",
        format: "csv",
        file_name: "raw.csv",
      })
    );
    expect(metadata).not.toHaveProperty("export_query");
    expect(metadata).not.toHaveProperty("dataset");
  });
});
