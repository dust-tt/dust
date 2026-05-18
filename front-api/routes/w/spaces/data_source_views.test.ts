import { describe, expect, it } from "vitest";

import { DataSourceViewFactory } from "@app/tests/utils/DataSourceViewFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";

import { honoApp } from "../../../app";

function listTables(
  workspace: { sId: string },
  spaceId: string,
  dsvId: string,
  query: Record<string, string> = {}
) {
  const qs = new URLSearchParams(query).toString();
  const suffix = qs ? `?${qs}` : "";
  return honoApp.request(
    `/api/w/${workspace.sId}/spaces/${spaceId}/data_source_views/${dsvId}/tables${suffix}`
  );
}

function searchTables(
  workspace: { sId: string },
  spaceId: string,
  dsvId: string,
  query: Record<string, string>
) {
  const qs = new URLSearchParams(query).toString();
  return honoApp.request(
    `/api/w/${workspace.sId}/spaces/${spaceId}/data_source_views/${dsvId}/tables/search?${qs}`
  );
}

describe("GET /api/w/:wId/spaces/:spaceId/data_source_views/:dsvId/tables", () => {
  it("returns 404 when user cannot read or administrate", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
    });

    const space = await SpaceFactory.regular(workspace);
    const dataSourceView = await DataSourceViewFactory.folder(workspace, space);

    const response = await listTables(workspace, space.sId, dataSourceView.sId);

    expect(response.status).toBe(404);
    expect((await response.json()).error.type).toBe("space_not_found");
  });

  it("returns 400 with invalid pagination parameters", async () => {
    const { workspace, globalSpace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });

    const dataSourceView = await DataSourceViewFactory.folder(
      workspace,
      globalSpace
    );

    const response = await listTables(
      workspace,
      globalSpace.sId,
      dataSourceView.sId,
      { limit: "invalid" }
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        type: "invalid_pagination_parameters",
        message: "Invalid pagination parameters",
      },
    });
  });
});

describe("GET /api/w/:wId/spaces/:spaceId/data_source_views/:dsvId/tables/search", () => {
  it("requires minimum query length", async () => {
    const { workspace, globalSpace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });

    const dataSourceView = await DataSourceViewFactory.folder(
      workspace,
      globalSpace
    );

    const response = await searchTables(
      workspace,
      globalSpace.sId,
      dataSourceView.sId,
      { query: "a" }
    );

    expect(response.status).toBe(400);
  });
});
