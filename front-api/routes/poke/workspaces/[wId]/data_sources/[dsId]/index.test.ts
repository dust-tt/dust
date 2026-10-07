import type * as workosAudit from "@app/lib/api/audit/workos_audit";
import { emitAuditLogEvent } from "@app/lib/api/audit/workos_audit";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { DataSourceViewFactory } from "@app/tests/utils/DataSourceViewFactory";
import { createPokeApiMockRequest } from "@app/tests/utils/generic_poke_api_tests";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/audit/workos_audit", async () => {
  const actual = await vi.importActual<typeof workosAudit>(
    "@app/lib/api/audit/workos_audit"
  );
  return {
    ...actual,
    emitAuditLogEvent: vi.fn(),
  };
});

vi.mock("@app/poke/temporal/client", async () => {
  const actual = await vi.importActual<
    typeof import("@app/poke/temporal/client")
  >("@app/poke/temporal/client");
  return {
    ...actual,
    launchScrubDataSourceWorkflow: vi.fn(),
  };
});

beforeEach(() => {
  vi.mocked(emitAuditLogEvent).mockClear();
});

describe("DELETE /api/poke/workspaces/:wId/data_sources/:dsId", () => {
  it("soft-deletes a folder and audits datasource.deleted_admin", async () => {
    const { workspace, user, globalSpace, auth } =
      await createPokeApiMockRequest({
        isSuperUser: true,
        role: "admin",
      });
    const view = await DataSourceViewFactory.folder(workspace, globalSpace);
    const dsId = view.dataSource.sId;

    const response = await honoApp.request(
      `/api/poke/workspaces/${workspace.sId}/data_sources/${dsId}`,
      { method: "DELETE" }
    );

    expect(response.status).toBe(200);
    expect(await DataSourceResource.fetchById(auth, dsId)).toBeNull();
    expect(vi.mocked(emitAuditLogEvent)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(emitAuditLogEvent)).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "datasource.deleted_admin",
        metadata: {
          data_source_name: view.dataSource.name,
          provider: "folder",
          deleted_by: user.email,
        },
        targets: expect.arrayContaining([
          expect.objectContaining({
            type: "workspace",
            id: workspace.sId,
          }),
          expect.objectContaining({
            type: "data_source",
            id: dsId,
          }),
        ]),
      })
    );
  });
});
