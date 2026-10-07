import type * as workosAudit from "@app/lib/api/audit/workos_audit";
import { emitAuditLogEvent } from "@app/lib/api/audit/workos_audit";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { DataSourceViewFactory } from "@app/tests/utils/DataSourceViewFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { CoreAPI } from "@app/types/core/core_api";
import { DEFAULT_QDRANT_CLUSTER } from "@app/types/core/data_source";
import { Ok } from "@app/types/shared/result";
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

vi.spyOn(CoreAPI.prototype, "createProject").mockImplementation(async () => {
  return new Ok({
    project: {
      project_id: Math.floor(Math.random() * 1_000_000_000),
    },
  });
});

vi.spyOn(CoreAPI.prototype, "createDataSource").mockImplementation(
  async ({ name }) => {
    const dataSourceId = `core-ds-${Math.random().toString(36).slice(2)}`;
    return new Ok({
      data_source: {
        created: Date.now(),
        data_source_id: dataSourceId,
        data_source_internal_id: `internal-${dataSourceId}`,
        name,
        config: {
          embedder_config: {
            embedder: {
              provider_id: "openai",
              model_id: "text-embedding-3-large",
              splitter_id: "base_v0",
              max_chunk_size: 512,
            },
          },
          qdrant_config: {
            cluster: DEFAULT_QDRANT_CLUSTER,
            shadow_write_cluster: null,
          },
        },
      },
    });
  }
);

function dataSourcesUrl(workspaceId: string, spaceId: string, dsId?: string) {
  const base = `/api/w/${workspaceId}/spaces/${spaceId}/data_sources`;
  return dsId ? `${base}/${dsId}` : base;
}

beforeEach(() => {
  vi.mocked(emitAuditLogEvent).mockClear();
});

describe("folder data source audit events", () => {
  it("audits POST of a folder as datasource.created", async () => {
    const { workspace, globalSpace } = await createPrivateApiMockRequest({
      role: "admin",
    });

    const response = await honoApp.request(
      dataSourcesUrl(workspace.sId, globalSpace.sId),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Board folder",
          description: "Board packs",
        }),
      }
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(vi.mocked(emitAuditLogEvent)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(emitAuditLogEvent)).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "datasource.created",
        metadata: {
          data_source_name: "Board folder",
          provider: "folder",
          space_id: globalSpace.sId,
        },
        targets: expect.arrayContaining([
          expect.objectContaining({
            type: "workspace",
            id: workspace.sId,
          }),
          expect.objectContaining({
            type: "data_source",
            id: body.dataSource.sId,
            name: "Board folder",
          }),
        ]),
      })
    );
  });

  it("audits PATCH of a folder description as datasource.updated", async () => {
    const { workspace, globalSpace } = await createPrivateApiMockRequest({
      role: "admin",
    });
    const view = await DataSourceViewFactory.folder(workspace, globalSpace);

    const response = await honoApp.request(
      dataSourcesUrl(workspace.sId, globalSpace.sId, view.dataSource.sId),
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: "Updated board packs" }),
      }
    );

    expect(response.status).toBe(200);
    expect(vi.mocked(emitAuditLogEvent)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(emitAuditLogEvent)).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "datasource.updated",
        metadata: {
          data_source_name: view.dataSource.name,
          field: "description",
        },
        targets: expect.arrayContaining([
          expect.objectContaining({
            type: "workspace",
            id: workspace.sId,
          }),
          expect.objectContaining({
            type: "data_source",
            id: view.dataSource.sId,
          }),
        ]),
      })
    );
  });

  it("audits DELETE of a folder as datasource.deleted", async () => {
    const { workspace, globalSpace, auth } = await createPrivateApiMockRequest({
      role: "admin",
    });
    const view = await DataSourceViewFactory.folder(workspace, globalSpace);
    const dsId = view.dataSource.sId;

    const response = await honoApp.request(
      dataSourcesUrl(workspace.sId, globalSpace.sId, dsId),
      { method: "DELETE" }
    );

    expect(response.status).toBe(204);
    expect(await DataSourceResource.fetchById(auth, dsId)).toBeNull();
    expect(vi.mocked(emitAuditLogEvent)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(emitAuditLogEvent)).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "datasource.deleted",
        metadata: {
          data_source_name: view.dataSource.name,
          provider: "folder",
          space_id: globalSpace.sId,
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
