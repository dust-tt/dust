import type * as workosAudit from "@app/lib/api/audit/workos_audit";
import { emitAuditLogEvent } from "@app/lib/api/audit/workos_audit";
import { DataSourceViewFactory } from "@app/tests/utils/DataSourceViewFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
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

function post(workspace: { sId: string }, dsId: string, body: unknown) {
  return honoApp.request(`/api/w/${workspace.sId}/data_sources/${dsId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/w/:wId/data_sources/:dsId", () => {
  beforeEach(() => {
    vi.mocked(emitAuditLogEvent).mockClear();
  });

  it("returns 404 when data source not found", async () => {
    const { workspace } = await createPrivateApiMockRequest({ method: "POST" });

    const response = await post(workspace, "non-existent", {
      assistantDefaultSelected: true,
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        type: "data_source_not_found",
        message: "The data source you requested was not found.",
      },
    });
  });

  it("returns 403 if not authorized to administrate the data source", async () => {
    const { workspace, globalSpace } = await createPrivateApiMockRequest({
      method: "POST",
    });

    const dataSourceView = await DataSourceViewFactory.folder(
      workspace,
      globalSpace
    );

    const response = await post(workspace, dataSourceView.dataSource.sId, {
      assistantDefaultSelected: true,
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: {
        type: "data_source_auth_error",
        message:
          "You do not have permission to access this data source's settings.",
      },
    });
  });

  it("returns 400 when request body is invalid", async () => {
    const { workspace, globalSpace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
    });

    const dataSourceView = await DataSourceViewFactory.folder(
      workspace,
      globalSpace
    );

    const response = await post(workspace, dataSourceView.dataSource.sId, {
      assistantDefaultSelected: "invalid",
    });

    expect(response.status).toBe(400);
    expect((await response.json()).error.type).toBe("invalid_request_error");
  });

  it("audits assistantDefaultSelected updates as datasource.updated", async () => {
    const { workspace, globalSpace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
    });

    const dataSourceView = await DataSourceViewFactory.folder(
      workspace,
      globalSpace
    );

    const response = await post(workspace, dataSourceView.dataSource.sId, {
      assistantDefaultSelected: true,
    });

    expect(response.status).toBe(200);
    expect(vi.mocked(emitAuditLogEvent)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(emitAuditLogEvent)).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "datasource.updated",
        metadata: {
          data_source_name: dataSourceView.dataSource.name,
          field: "assistant_default_selected",
        },
        targets: expect.arrayContaining([
          expect.objectContaining({
            type: "workspace",
            id: workspace.sId,
          }),
          expect.objectContaining({
            type: "data_source",
            id: dataSourceView.dataSource.sId,
          }),
        ]),
      })
    );
  });

  it("successfully updates assistantDefaultSelected to false", async () => {
    const { workspace, globalSpace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
    });

    const dataSourceView = await DataSourceViewFactory.folder(
      workspace,
      globalSpace
    );

    const response = await post(workspace, dataSourceView.dataSource.sId, {
      assistantDefaultSelected: false,
    });

    expect(response.status).toBe(200);
    expect((await response.json()).dataSource.assistantDefaultSelected).toBe(
      false
    );
  });
});
