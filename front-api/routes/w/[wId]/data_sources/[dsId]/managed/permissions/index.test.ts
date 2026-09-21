import { DataSourceViewFactory } from "@app/tests/utils/DataSourceViewFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { Err } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getConnectorPermissions: vi.fn(),
}));

vi.mock("@app/types/connectors/connectors_api", async (importOriginal) => {
  const original =
    await importOriginal<
      typeof import("@app/types/connectors/connectors_api")
    >();

  return {
    ...original,
    ConnectorsAPI: class {
      getConnectorPermissions = mocks.getConnectorPermissions;
    },
  };
});

describe("GET /api/w/:wId/data_sources/:dsId/managed/permissions", () => {
  beforeEach(() => {
    mocks.getConnectorPermissions.mockReset();
  });

  it("returns data_source_document_not_found for a missing connector location", async () => {
    const { workspace, globalSpace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });
    const dataSourceView = await DataSourceViewFactory.fromConnector(
      workspace,
      globalSpace,
      "microsoft"
    );
    await dataSourceView.dataSource.setConnectorId("123");
    mocks.getConnectorPermissions.mockResolvedValue(
      new Err({
        type: "not_found",
        message: "Microsoft content node not found",
      })
    );

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/data_sources/${dataSourceView.dataSource.sId}/managed/permissions?viewType=all`
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        type: "data_source_document_not_found",
        message: "The requested data source location could not be found.",
      },
    });
  });
});
