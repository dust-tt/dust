import { checkConnectionOwnership } from "@app/lib/api/oauth";
import { DataSourceViewFactory } from "@app/tests/utils/DataSourceViewFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { ConnectorsAPI } from "@app/types/connectors/connectors_api";
import { Err } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/oauth", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@app/lib/api/oauth")>();
  return {
    ...mod,
    checkConnectionOwnership: vi.fn(),
  };
});

function post(workspace: { sId: string }, dsId: string, body: unknown) {
  return honoApp.request(
    `/api/w/${workspace.sId}/data_sources/${dsId}/managed/update`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

describe("POST /api/w/:wId/data_sources/:dsId/managed/update", () => {
  beforeEach(() => {
    vi.mocked(checkConnectionOwnership).mockReset();
  });

  it("rejects a connection that is not owned by the current user and workspace", async () => {
    const { workspace, globalSpace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
    });

    const dataSourceView = await DataSourceViewFactory.fromConnector(
      workspace,
      globalSpace,
      "google_drive"
    );
    await dataSourceView.dataSource.setConnectorId("connector-123");

    vi.mocked(checkConnectionOwnership).mockResolvedValue(
      new Err(new Error("Invalid connection"))
    );
    const updateConnectorSpy = vi.spyOn(
      ConnectorsAPI.prototype,
      "updateConnector"
    );

    const response = await post(workspace, dataSourceView.dataSource.sId, {
      connectionId: "con_foreign_workspace",
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        type: "invalid_request_error",
        message: "Failed to get the access token for the connector.",
      },
    });
    expect(checkConnectionOwnership).toHaveBeenCalledWith(
      expect.anything(),
      "con_foreign_workspace"
    );
    expect(updateConnectorSpy).not.toHaveBeenCalled();
  });
});
