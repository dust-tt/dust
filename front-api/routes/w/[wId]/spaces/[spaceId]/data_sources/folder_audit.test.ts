import type * as workosAudit from "@app/lib/api/audit/workos_audit";
import { emitAuditLogEvent } from "@app/lib/api/audit/workos_audit";
import { Authenticator } from "@app/lib/auth";
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

const FOLDER_NAME = "Board folder";
const FOLDER_DESCRIPTION = "Board packs";
const UPDATED_DESCRIPTION = "Updated board packs";

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

async function setup() {
  return createPrivateApiMockRequest({ role: "admin" });
}

beforeEach(() => {
  vi.mocked(emitAuditLogEvent).mockClear();
});

describe("folder data source audit events", () => {
  it("audits POST of a folder as datasource.created", async () => {
    const { workspace, globalSpace } = await setup();

    const response = await honoApp.request(
      dataSourcesUrl(workspace.sId, globalSpace.sId),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: FOLDER_NAME,
          description: FOLDER_DESCRIPTION,
        }),
      }
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toMatchObject({
      dataSource: {
        name: FOLDER_NAME,
        description: FOLDER_DESCRIPTION,
        connectorId: null,
        connectorProvider: null,
      },
      dataSourceView: {
        category: "folder",
        kind: "default",
        spaceId: globalSpace.sId,
      },
    });

    expect(vi.mocked(emitAuditLogEvent).mock.calls).toEqual([
      [
        {
          auth: expect.any(Authenticator),
          action: "datasource.created",
          targets: [
            {
              type: "workspace",
              id: workspace.sId,
              name: workspace.name,
            },
            {
              type: "data_source",
              id: body.dataSource.sId,
              name: FOLDER_NAME,
            },
          ],
          context: { location: "internal" },
          metadata: {
            data_source_name: FOLDER_NAME,
            provider: "folder",
            space_id: globalSpace.sId,
          },
        },
      ],
    ]);
  });

  it("audits PATCH of a folder description as datasource.updated", async () => {
    const { workspace, globalSpace } = await setup();
    const view = await DataSourceViewFactory.folder(workspace, globalSpace);
    const name = view.dataSource.name;

    const response = await honoApp.request(
      dataSourcesUrl(workspace.sId, globalSpace.sId, view.dataSource.sId),
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: UPDATED_DESCRIPTION }),
      }
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      dataSource: {
        sId: view.dataSource.sId,
        name,
        description: UPDATED_DESCRIPTION,
      },
    });

    expect(vi.mocked(emitAuditLogEvent).mock.calls).toEqual([
      [
        {
          auth: expect.any(Authenticator),
          action: "datasource.updated",
          targets: [
            {
              type: "workspace",
              id: workspace.sId,
              name: workspace.name,
            },
            {
              type: "data_source",
              id: view.dataSource.sId,
              name,
            },
          ],
          context: { location: "internal" },
          metadata: {
            data_source_name: name,
            field: "description",
          },
        },
      ],
    ]);
  });

  it("audits DELETE of a folder as datasource.deleted", async () => {
    const { workspace, globalSpace, auth } = await setup();
    const view = await DataSourceViewFactory.folder(workspace, globalSpace);
    const name = view.dataSource.name;
    const dsId = view.dataSource.sId;

    const response = await honoApp.request(
      dataSourcesUrl(workspace.sId, globalSpace.sId, dsId),
      { method: "DELETE" }
    );

    expect(response.status).toBe(204);
    expect(await DataSourceResource.fetchById(auth, dsId)).toBeNull();

    expect(vi.mocked(emitAuditLogEvent).mock.calls).toEqual([
      [
        {
          auth: expect.any(Authenticator),
          action: "datasource.deleted",
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
            space_id: globalSpace.sId,
          },
        },
      ],
    ]);
  });
});
