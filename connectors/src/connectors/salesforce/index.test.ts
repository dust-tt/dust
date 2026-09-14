import { ConnectorManagerError } from "@connectors/connectors/interface";
import { ExternalOAuthTokenError } from "@connectors/lib/error";
import { INTERNAL_MIME_TYPES } from "@connectors/types";
import { Err, Ok } from "@dust-tt/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  SALESFORCE_AUTHORIZATION_ERROR_MESSAGE,
  SalesforceConnectorManager,
} from "./index";

const mocks = vi.hoisted(() => ({
  fetchByConnector: vi.fn(),
  getConnectorAndCredentials: vi.fn(),
  getSalesforceConnection: vi.fn(),
}));

vi.mock(
  "@connectors/connectors/salesforce/lib/utils",
  async (importOriginal) => {
    const mod =
      await importOriginal<
        typeof import("@connectors/connectors/salesforce/lib/utils")
      >();
    return {
      ...mod,
      getConnectorAndCredentials: mocks.getConnectorAndCredentials,
    };
  }
);

vi.mock("@connectors/connectors/salesforce/lib/salesforce_api", () => ({
  getSalesforceConnection: mocks.getSalesforceConnection,
  testSalesforceConnection: vi.fn(),
}));

vi.mock("@connectors/connectors/salesforce/temporal/client", () => ({
  launchSalesforceSyncWorkflow: vi.fn(),
  stopSalesforceSyncQueryWorkflow: vi.fn(),
  stopSalesforceSyncWorkflow: vi.fn(),
}));

vi.mock("@connectors/resources/salesforce_resources", () => ({
  SalesforceSyncedQueryResource: {
    fetchByConnector: mocks.fetchByConnector,
  },
}));

const connector = { id: 42 };
const credentials = {
  accessToken: "access-token",
  instanceUrl: "https://example.my.salesforce.com",
};

describe("SalesforceConnectorManager.retrievePermissions", () => {
  const manager = new SalesforceConnectorManager(connector.id);

  beforeEach(() => {
    mocks.getConnectorAndCredentials.mockResolvedValue(
      new Ok({ connector, credentials })
    );
    mocks.getSalesforceConnection.mockResolvedValue(new Ok({}));
    mocks.fetchByConnector.mockResolvedValue([]);
  });

  it("returns EXTERNAL_OAUTH_TOKEN_ERROR with the provider message when credentials retrieval throws ExternalOAuthTokenError", async () => {
    const providerMessage =
      "Error retrieving access token from salesforce: code=provider_access_token_refresh_error " +
      "message=invalid_grant token validity expired";
    mocks.getConnectorAndCredentials.mockRejectedValue(
      new ExternalOAuthTokenError(new Error(providerMessage))
    );

    const res = await manager.retrievePermissions();

    expect(res.isErr()).toBe(true);
    if (res.isErr()) {
      expect(res.error).toBeInstanceOf(ConnectorManagerError);
      expect(res.error.code).toBe("EXTERNAL_OAUTH_TOKEN_ERROR");
      expect(res.error.message).toBe(
        `${SALESFORCE_AUTHORIZATION_ERROR_MESSAGE} Error: ${providerMessage}`
      );
    }
    expect(mocks.getSalesforceConnection).not.toHaveBeenCalled();
  });

  it("rethrows unknown errors unchanged", async () => {
    const error = new Error("Connector 42 not found");
    mocks.getConnectorAndCredentials.mockRejectedValue(error);

    await expect(manager.retrievePermissions()).rejects.toBe(error);
  });

  it("returns the error returned by getConnectorAndCredentials", async () => {
    const error = new ConnectorManagerError(
      "EXTERNAL_OAUTH_TOKEN_ERROR",
      "Invalid credentials"
    );
    mocks.getConnectorAndCredentials.mockResolvedValue(new Err(error));

    const res = await manager.retrievePermissions();

    expect(res.isErr()).toBe(true);
    if (res.isErr()) {
      expect(res.error).toBe(error);
    }
  });

  it("returns EXTERNAL_OAUTH_TOKEN_ERROR when the Salesforce connection fails", async () => {
    mocks.getSalesforceConnection.mockResolvedValue(
      new Err(new Error("connection failed"))
    );

    const res = await manager.retrievePermissions();

    expect(res.isErr()).toBe(true);
    if (res.isErr()) {
      expect(res.error.code).toBe("EXTERNAL_OAUTH_TOKEN_ERROR");
      expect(res.error.message).toBe(SALESFORCE_AUTHORIZATION_ERROR_MESSAGE);
    }
  });

  it("returns one folder node per synced query", async () => {
    mocks.fetchByConnector.mockResolvedValue([
      { id: 7, rootNodeName: "Opportunities" },
    ]);

    const res = await manager.retrievePermissions();

    expect(res.isOk()).toBe(true);
    if (res.isOk()) {
      expect(res.value).toEqual([
        {
          internalId: "salesforce-synced-query-42-7",
          parentInternalId: null,
          type: "folder",
          title: "[Synced Query] Opportunities",
          sourceUrl: null,
          expandable: false,
          preventSelection: true,
          permission: "read",
          lastUpdatedAt: null,
          mimeType: INTERNAL_MIME_TYPES.SALESFORCE.SYNCED_QUERY_FOLDER,
        },
      ]);
    }
  });
});
