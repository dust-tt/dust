import { ExternalOAuthTokenError } from "@connectors/lib/error";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { getConnectionCredentials } from "@connectors/types/oauth/client/credentials";
import { Err } from "@dust-tt/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { syncBigQueryConnection } from "./activities";

vi.mock("@connectors/types/oauth/client/credentials", () => ({
  getConnectionCredentials: vi.fn(),
}));

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("syncBigQueryConnection", () => {
  it("requires reauthorization when credentials cannot be retrieved", async () => {
    vi.stubEnv("OAUTH_API", "http://oauth.test");
    vi.mocked(getConnectionCredentials).mockResolvedValue(
      new Err({
        code: "credential_not_found",
        message: "Credentials not found",
      })
    );
    const connector = await ConnectorResource.makeNew(
      "bigquery",
      {
        connectionId: "test-connection-id",
        workspaceId: "test-workspace-id",
        dataSourceId: "test-data-source-id",
        workspaceAPIKey: "test-workspace-api-key",
      },
      { useMetadataForDBML: false }
    );

    const execution = syncBigQueryConnection(connector.id);

    await expect(execution).rejects.toThrow(ExternalOAuthTokenError);
    await expect(execution).rejects.toHaveProperty(
      "cause",
      new Error("Failed to retrieve credentials")
    );
    const updatedConnector = await ConnectorResource.fetchById(connector.id);
    expect(updatedConnector?.lastSyncStartTime).toBeNull();
  });

  it("throws a regular error when the connector does not exist", async () => {
    const execution = syncBigQueryConnection(-1);

    await expect(execution).rejects.toThrow("Connector not found");
    await expect(execution).rejects.not.toBeInstanceOf(ExternalOAuthTokenError);
    expect(getConnectionCredentials).not.toHaveBeenCalled();
  });
});
