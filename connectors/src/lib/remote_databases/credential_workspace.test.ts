import { BigQueryConnectorManager } from "@connectors/connectors/bigquery";
import { SnowflakeConnectorManager } from "@connectors/connectors/snowflake";
import { apiConfig } from "@connectors/lib/api/config";
import mainLogger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { OauthAPIGetCredentialsResponse } from "@connectors/types";
import { isSnowflakeCredentials } from "@connectors/types";
import { Err, Ok } from "@dust-tt/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getConnectorAndCredentials,
  getCredentials,
  REMOTE_DATABASE_CREDENTIAL_ERROR_MESSAGE,
} from "./utils";

const mocks = vi.hoisted(() => ({
  getConnectionCredentials: vi.fn(),
  testSnowflakeConnection: vi.fn(),
  testBigQueryConnection: vi.fn(),
  launchSnowflakeSyncWorkflow: vi.fn(),
  stopSnowflakeSyncWorkflow: vi.fn(),
  launchBigQuerySyncWorkflow: vi.fn(),
  stopBigQuerySyncWorkflow: vi.fn(),
}));

vi.mock("@connectors/types", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@connectors/types")>();
  return {
    ...actual,
    getConnectionCredentials: mocks.getConnectionCredentials,
  };
});

vi.mock("@connectors/connectors/snowflake/lib/snowflake_api", () => ({
  testConnection: mocks.testSnowflakeConnection,
}));

vi.mock("@connectors/connectors/snowflake/temporal/client", () => ({
  launchSnowflakeSyncWorkflow: mocks.launchSnowflakeSyncWorkflow,
  stopSnowflakeSyncWorkflow: mocks.stopSnowflakeSyncWorkflow,
}));

vi.mock("@connectors/connectors/bigquery/lib/bigquery_api", () => ({
  testConnection: mocks.testBigQueryConnection,
}));

vi.mock("@connectors/connectors/bigquery/temporal/client", () => ({
  launchBigQuerySyncWorkflow: mocks.launchBigQuerySyncWorkflow,
  stopBigQuerySyncWorkflow: mocks.stopBigQuerySyncWorkflow,
}));

const logger = mainLogger.child({ test: "credential-workspace" });

const snowflakeContent = {
  username: "user",
  account: "acct",
  role: "role",
  warehouse: "wh",
  password: "secret",
};

function credentialsResponse(
  workspaceId: string
): Ok<OauthAPIGetCredentialsResponse> {
  return new Ok({
    credential: {
      credential_id: "cred_test-secret",
      created: 1,
      provider: "snowflake",
      metadata: {
        workspace_id: workspaceId,
        user_id: "user_1",
      },
      content: snowflakeContent,
    },
  });
}

describe("remote database credential workspace binding", () => {
  beforeEach(() => {
    vi.spyOn(apiConfig, "getOAuthAPIConfig").mockReturnValue({
      url: "http://oauth.test",
      apiKey: null,
    });
    mocks.testSnowflakeConnection.mockResolvedValue(
      new Err({ code: "INVALID_CREDENTIALS", message: "should not run" })
    );
    mocks.testBigQueryConnection.mockResolvedValue(
      new Err({ code: "INVALID_CREDENTIALS", message: "should not run" })
    );
  });

  describe("getCredentials", () => {
    it("returns content when the credential workspace matches", async () => {
      mocks.getConnectionCredentials.mockResolvedValue(
        credentialsResponse("workspace-a")
      );

      const res = await getCredentials({
        credentialsId: "cred_test-secret",
        isTypeGuard: isSnowflakeCredentials,
        logger,
        workspaceId: "workspace-a",
      });

      expect(res.isOk()).toBe(true);
      if (res.isOk()) {
        expect(res.value.credentials).toEqual(snowflakeContent);
      }
    });

    it("refuses a credential minted for another workspace", async () => {
      mocks.getConnectionCredentials.mockResolvedValue(
        credentialsResponse("workspace-a")
      );

      const res = await getCredentials({
        credentialsId: "cred_test-secret",
        isTypeGuard: isSnowflakeCredentials,
        logger,
        workspaceId: "workspace-b",
      });

      expect(res.isErr()).toBe(true);
      if (res.isErr()) {
        expect(res.error.message).toBe(
          REMOTE_DATABASE_CREDENTIAL_ERROR_MESSAGE
        );
      }
    });

    it("uses the same error for an unavailable credential", async () => {
      mocks.getConnectionCredentials.mockResolvedValue(
        new Err({
          code: "credential_not_found",
          message: "Credential not found",
        })
      );

      const res = await getCredentials({
        credentialsId: "cred_missing-secret",
        isTypeGuard: isSnowflakeCredentials,
        logger,
        workspaceId: "workspace-b",
      });

      expect(res.isErr()).toBe(true);
      if (res.isErr()) {
        expect(res.error.message).toBe(
          REMOTE_DATABASE_CREDENTIAL_ERROR_MESSAGE
        );
      }
    });

    it("refuses a credential with an empty workspace id", async () => {
      mocks.getConnectionCredentials.mockResolvedValue(credentialsResponse(""));

      const res = await getCredentials({
        credentialsId: "cred_test-secret",
        isTypeGuard: isSnowflakeCredentials,
        logger,
        workspaceId: "",
      });

      expect(res.isErr()).toBe(true);
      if (res.isErr()) {
        expect(res.error.message).toBe(
          REMOTE_DATABASE_CREDENTIAL_ERROR_MESSAGE
        );
      }
    });
  });

  describe("getConnectorAndCredentials", () => {
    it("returns content when the stored credential belongs to the connector workspace", async () => {
      const connector = await ConnectorResource.makeNew(
        "snowflake",
        {
          connectionId: "cred_owned-secret",
          workspaceAPIKey: "key",
          workspaceId: "workspace-a",
          dataSourceId: "ds-owned",
        },
        {}
      );
      mocks.getConnectionCredentials.mockResolvedValue(
        credentialsResponse("workspace-a")
      );

      const res = await getConnectorAndCredentials({
        connectorId: connector.id,
        isTypeGuard: isSnowflakeCredentials,
        logger,
      });

      expect(res.isOk()).toBe(true);
      if (res.isOk()) {
        expect(res.value.credentials).toEqual(snowflakeContent);
      }
    });

    it("refuses a stored credential from another workspace", async () => {
      const connector = await ConnectorResource.makeNew(
        "snowflake",
        {
          connectionId: "cred_foreign-secret",
          workspaceAPIKey: "key",
          workspaceId: "workspace-b",
          dataSourceId: "ds-foreign",
        },
        {}
      );
      mocks.getConnectionCredentials.mockResolvedValue(
        credentialsResponse("workspace-a")
      );

      const res = await getConnectorAndCredentials({
        connectorId: connector.id,
        isTypeGuard: isSnowflakeCredentials,
        logger,
      });

      expect(res.isErr()).toBe(true);
      if (res.isErr()) {
        expect(res.error.code).toBe("invalid_credentials");
        expect(res.error.error.message).toBe(
          REMOTE_DATABASE_CREDENTIAL_ERROR_MESSAGE
        );
      }
    });
  });

  describe("SnowflakeConnectorManager", () => {
    const dataSourceConfig = {
      workspaceId: "workspace-b",
      workspaceAPIKey: "key",
      dataSourceId: "ds-snowflake-create",
    };

    it("does not create a connector bound to another workspace's credential", async () => {
      mocks.getConnectionCredentials.mockResolvedValue(
        credentialsResponse("workspace-a")
      );

      const res = await SnowflakeConnectorManager.create({
        dataSourceConfig,
        connectionId: "cred_leaked-secret",
      });

      expect(res.isErr()).toBe(true);
      if (res.isErr()) {
        expect(res.error.code).toBe("INVALID_CONFIGURATION");
        expect(res.error.message).toBe(
          REMOTE_DATABASE_CREDENTIAL_ERROR_MESSAGE
        );
      }
      expect(mocks.testSnowflakeConnection).not.toHaveBeenCalled();
      expect(
        await ConnectorResource.findByDataSource({
          workspaceId: dataSourceConfig.workspaceId,
          dataSourceId: dataSourceConfig.dataSourceId,
        })
      ).toBeNull();
    });

    it("does not rebind a connector to another workspace's credential", async () => {
      const connector = await ConnectorResource.makeNew(
        "snowflake",
        {
          connectionId: "cred_original-secret",
          workspaceAPIKey: "key",
          workspaceId: "workspace-b",
          dataSourceId: "ds-snowflake-update",
        },
        {}
      );
      mocks.getConnectionCredentials.mockResolvedValue(
        credentialsResponse("workspace-a")
      );

      const res = await new SnowflakeConnectorManager(connector.id).update({
        connectionId: "cred_leaked-secret",
      });

      expect(res.isErr()).toBe(true);
      if (res.isErr()) {
        expect(res.error.code).toBe("INVALID_CONFIGURATION");
        expect(res.error.message).toBe(
          REMOTE_DATABASE_CREDENTIAL_ERROR_MESSAGE
        );
      }
      expect(mocks.testSnowflakeConnection).not.toHaveBeenCalled();
      expect(mocks.stopSnowflakeSyncWorkflow).not.toHaveBeenCalled();

      const stored = await ConnectorResource.fetchById(connector.id);
      expect(stored?.connectionId).toBe("cred_original-secret");
    });
  });

  describe("BigQueryConnectorManager", () => {
    const dataSourceConfig = {
      workspaceId: "workspace-b",
      workspaceAPIKey: "key",
      dataSourceId: "ds-bigquery-create",
    };

    it("does not create a connector bound to another workspace's credential", async () => {
      mocks.getConnectionCredentials.mockResolvedValue(
        credentialsResponse("workspace-a")
      );

      const res = await BigQueryConnectorManager.create({
        dataSourceConfig,
        connectionId: "cred_leaked-secret",
      });

      expect(res.isErr()).toBe(true);
      if (res.isErr()) {
        expect(res.error.code).toBe("INVALID_CONFIGURATION");
        expect(res.error.message).toBe(
          REMOTE_DATABASE_CREDENTIAL_ERROR_MESSAGE
        );
      }
      expect(mocks.testBigQueryConnection).not.toHaveBeenCalled();
      expect(
        await ConnectorResource.findByDataSource({
          workspaceId: dataSourceConfig.workspaceId,
          dataSourceId: dataSourceConfig.dataSourceId,
        })
      ).toBeNull();
    });

    it("does not rebind a connector to another workspace's credential", async () => {
      const connector = await ConnectorResource.makeNew(
        "bigquery",
        {
          connectionId: "cred_original-secret",
          workspaceAPIKey: "key",
          workspaceId: "workspace-b",
          dataSourceId: "ds-bigquery-update",
        },
        {
          useMetadataForDBML: false,
          maximumBytesBilled: null,
        }
      );
      mocks.getConnectionCredentials.mockResolvedValue(
        credentialsResponse("workspace-a")
      );

      const res = await new BigQueryConnectorManager(connector.id).update({
        connectionId: "cred_leaked-secret",
      });

      expect(res.isErr()).toBe(true);
      if (res.isErr()) {
        expect(res.error.code).toBe("INVALID_CONFIGURATION");
        expect(res.error.message).toBe(
          REMOTE_DATABASE_CREDENTIAL_ERROR_MESSAGE
        );
      }
      expect(mocks.testBigQueryConnection).not.toHaveBeenCalled();
      expect(mocks.stopBigQuerySyncWorkflow).not.toHaveBeenCalled();

      const stored = await ConnectorResource.fetchById(connector.id);
      expect(stored?.connectionId).toBe("cred_original-secret");
    });
  });
});
