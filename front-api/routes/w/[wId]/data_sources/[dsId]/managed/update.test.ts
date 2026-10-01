import { DataSourceViewFactory } from "@app/tests/utils/DataSourceViewFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAccessToken: vi.fn(),
  updateConnector: vi.fn(),
}));

vi.mock("@app/types/oauth/oauth_api", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@app/types/oauth/oauth_api")>();
  return {
    ...actual,
    OAuthAPI: vi.fn().mockImplementation(function OAuthAPIMock() {
      return { getAccessToken: mocks.getAccessToken };
    }),
  };
});

vi.mock("@app/types/connectors/connectors_api", async (importOriginal) => {
  const original =
    await importOriginal<
      typeof import("@app/types/connectors/connectors_api")
    >();
  return {
    ...original,
    ConnectorsAPI: class {
      updateConnector = mocks.updateConnector;
    },
  };
});

describe("POST /api/w/:wId/data_sources/:dsId/managed/update", () => {
  beforeEach(() => {
    mocks.getAccessToken.mockReset();
    mocks.updateConnector.mockReset();
  });

  it("returns 403 and skips updateConnector when connection belongs to another workspace", async () => {
    const { workspace, globalSpace } = await createPrivateApiMockRequest({
      role: "admin",
    });
    const dataSourceView = await DataSourceViewFactory.fromConnector(
      workspace,
      globalSpace,
      "slack"
    );
    await dataSourceView.dataSource.setConnectorId("connector-456");

    mocks.getAccessToken.mockResolvedValue(
      new Ok({
        connection: {
          metadata: { workspace_id: "ws_other", user_id: "user_other" },
        },
      })
    );

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/data_sources/${dataSourceView.dataSource.sId}/managed/update`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId: "con_abc123" }),
      }
    );

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error.type).toBe("data_source_auth_error");
    expect(mocks.updateConnector).not.toHaveBeenCalled();
  });
});
