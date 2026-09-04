import { DataSourceViewFactory } from "@app/tests/utils/DataSourceViewFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { ConnectorsAPI } from "@app/types/connectors/connectors_api";
import { Err } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import { describe, expect, it, vi } from "vitest";

const ZENDESK_MISSING_RIGHTS_MESSAGE =
  "Dust cannot list Zendesk brands because the connected user lacks the required permissions. Re-authorize Zendesk with an admin account.";

describe("GET /api/w/:wId/data_sources/:dsId/managed/permissions", () => {
  it("returns the Zendesk missing-rights error", async () => {
    const { workspace, globalSpace, user } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });
    const dataSourceView = await DataSourceViewFactory.fromConnector(
      workspace,
      globalSpace,
      "zendesk",
      user,
      { connectorId: "connector-id" }
    );
    vi.spyOn(
      ConnectorsAPI.prototype,
      "getConnectorPermissions"
    ).mockResolvedValue(
      new Err({
        type: "connector_oauth_user_missing_rights",
        message: ZENDESK_MISSING_RIGHTS_MESSAGE,
      })
    );

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/data_sources/${dataSourceView.dataSource.sId}/managed/permissions?viewType=all`
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: {
        type: "connector_oauth_user_missing_rights",
        message: ZENDESK_MISSING_RIGHTS_MESSAGE,
      },
    });
  });
});
