import type * as workosAudit from "@app/lib/api/audit/workos_audit";
import { emitAuditLogEvent } from "@app/lib/api/audit/workos_audit";
import { Authenticator } from "@app/lib/auth";
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

function deleteDataSource(workspaceId: string, dsId: string) {
  return honoApp.request(
    `/api/poke/workspaces/${workspaceId}/data_sources/${dsId}`,
    { method: "DELETE" }
  );
}

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
    const name = view.dataSource.name;
    const dsId = view.dataSource.sId;

    const response = await deleteDataSource(workspace.sId, dsId);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      sId: dsId,
      name,
      connectorProvider: null,
    });
    expect(await DataSourceResource.fetchById(auth, dsId)).toBeNull();

    expect(vi.mocked(emitAuditLogEvent).mock.calls).toEqual([
      [
        {
          auth: expect.any(Authenticator),
          action: "datasource.deleted_admin",
          targets: [
            {
              type: "workspace",
              id: workspace.sId,
              name: workspace.name,
            },
            {
              type: "data_source",
              id: dsId,
              name,
            },
          ],
          context: { location: "internal" },
          metadata: {
            data_source_name: name,
            provider: "folder",
            deleted_by: user.email,
          },
        },
      ],
    ]);
  });

  it("returns 404 and does not audit an unknown data source", async () => {
    const { workspace } = await createPokeApiMockRequest({
      isSuperUser: true,
      role: "admin",
    });

    const response = await deleteDataSource(workspace.sId, "not-a-data-source");

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        type: "data_source_not_found",
        message: "The data source you requested was not found.",
      },
    });
    expect(vi.mocked(emitAuditLogEvent).mock.calls).toEqual([]);
  });
});
