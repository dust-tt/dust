import { describe, expect, it } from "vitest";

import { DataSourceViewFactory } from "@app/tests/utils/DataSourceViewFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";

import { honoApp } from "@front-api/app";

function post(workspace: { sId: string }, dsId: string, body: unknown) {
  return honoApp.request(`/api/w/${workspace.sId}/data_sources/${dsId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/w/:wId/data_sources/:dsId", () => {
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

  it("successfully updates assistantDefaultSelected to true (admin only)", async () => {
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
    const body = await response.json();
    expect(body.dataSource).toBeDefined();
    expect(body.dataSource.sId).toBe(dataSourceView.dataSource.sId);
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
    const body = await response.json();
    expect(body.dataSource).toBeDefined();
    expect(body.dataSource.sId).toBe(dataSourceView.dataSource.sId);
  });
});
