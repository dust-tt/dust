import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { isSnowflakeCredentials } from "@connectors/types";
import { Ok } from "@dust-tt/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildInternalId,
  getConnectorAndCredentials,
  getCredentials,
  parseInternalId,
  RemoteDatabaseCredentialBindingError,
} from "./utils";

const { getConnectionCredentialsMock } = vi.hoisted(() => ({
  getConnectionCredentialsMock: vi.fn(),
}));

vi.mock("@connectors/types", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@connectors/types")>();
  return {
    ...actual,
    getConnectionCredentials: getConnectionCredentialsMock,
  };
});

const snowflakePassword = {
  username: "loader",
  account: "ab12345",
  role: "READER",
  warehouse: "WH",
  password: "secret",
};

function fetchedCredential({
  workspaceId,
  provider = "snowflake",
  content = snowflakePassword,
}: {
  workspaceId: string;
  provider?: string;
  content?: unknown;
}) {
  return new Ok({
    credential: {
      credential_id: "cred_test",
      created: 1,
      provider,
      metadata: { workspace_id: workspaceId, user_id: "user" },
      content,
    },
  });
}

describe("Remote Database Utils", () => {
  beforeEach(() => {
    process.env.OAUTH_API = "http://oauth.test";
  });

  describe("buildInternalId", () => {
    it("should build internal ID with only database name", () => {
      const result = buildInternalId({
        databaseName: "my_database",
      });
      expect(result).toBe("my_database");
    });

    it("should build internal ID with database and schema names", () => {
      const result = buildInternalId({
        databaseName: "my_database",
        schemaName: "public",
      });
      expect(result).toBe("my_database.public");
    });

    it("should build internal ID with all components", () => {
      const result = buildInternalId({
        databaseName: "my_database",
        schemaName: "public",
        tableName: "users",
      });
      expect(result).toBe("my_database.public.users");
    });

    it("should handle dots in names by replacing them with __DUST_DOT__", () => {
      const result = buildInternalId({
        databaseName: "my.database",
        schemaName: "public.schema",
        tableName: "user.table",
      });
      expect(result).toBe(
        "my__DUST_DOT__database.public__DUST_DOT__schema.user__DUST_DOT__table"
      );
    });

    it("should handle multiple dots in a single name", () => {
      const result = buildInternalId({
        databaseName: "foo.bar.baz",
      });
      expect(result).toBe("foo__DUST_DOT__bar__DUST_DOT__baz");
    });
  });

  describe("parseInternalId", () => {
    it("should parse internal ID with only database name", () => {
      const result = parseInternalId("my_database");
      expect(result).toEqual({
        databaseName: "my_database",
        schemaName: undefined,
        tableName: undefined,
      });
    });

    it("should parse internal ID with database and schema names", () => {
      const result = parseInternalId("my_database.public");
      expect(result).toEqual({
        databaseName: "my_database",
        schemaName: "public",
        tableName: undefined,
      });
    });

    it("should parse internal ID with all components", () => {
      const result = parseInternalId("my_database.public.users");
      expect(result).toEqual({
        databaseName: "my_database",
        schemaName: "public",
        tableName: "users",
      });
    });

    it("should throw error for invalid internal ID", () => {
      expect(() => parseInternalId("")).toThrow(
        "Invalid internal ID, it requires at least a database name: "
      );
    });
  });

  describe("buildInternalId and parseInternalId integration", () => {
    it("should correctly roundtrip internal IDs", () => {
      const original = {
        databaseName: "my_database",
        schemaName: "public",
        tableName: "users",
      };
      const built = buildInternalId(original);
      const parsed = parseInternalId(built);
      expect(parsed).toEqual(original);
    });

    it("should correctly roundtrip internal IDs with dots in names", () => {
      const original = {
        databaseName: "my.database",
        schemaName: "public.schema",
        tableName: "user.table",
      };
      const built = buildInternalId(original);
      const parsed = parseInternalId(built);
      expect(parsed).toEqual(original);
    });

    it("should correctly roundtrip internal IDs with multiple dots in names", () => {
      const original = {
        databaseName: "foo.bar.baz",
        schemaName: "a.b.c",
        tableName: "x.y",
      };
      const built = buildInternalId(original);
      const parsed = parseInternalId(built);
      expect(parsed).toEqual(original);
    });
  });

  describe("credential binding", () => {
    it("refuses a credential minted for another workspace before returning its content", async () => {
      getConnectionCredentialsMock.mockResolvedValue(
        fetchedCredential({ workspaceId: "workspace-b" })
      );

      const result = await getCredentials({
        credentialsId: "cred_leaked",
        isTypeGuard: isSnowflakeCredentials,
        logger,
        workspaceId: "workspace-a",
        provider: "snowflake",
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBeInstanceOf(
          RemoteDatabaseCredentialBindingError
        );
      }
    });

    it("refuses a credential whose provider does not match the connector", async () => {
      getConnectionCredentialsMock.mockResolvedValue(
        fetchedCredential({ workspaceId: "workspace-a", provider: "slack" })
      );

      const result = await getCredentials({
        credentialsId: "cred_slack",
        isTypeGuard: isSnowflakeCredentials,
        logger,
        workspaceId: "workspace-a",
        provider: "snowflake",
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBeInstanceOf(
          RemoteDatabaseCredentialBindingError
        );
      }
    });

    it("returns snowflake credentials when workspace and provider match", async () => {
      getConnectionCredentialsMock.mockResolvedValue(
        fetchedCredential({ workspaceId: "workspace-a" })
      );

      const result = await getCredentials({
        credentialsId: "cred_own",
        isTypeGuard: isSnowflakeCredentials,
        logger,
        workspaceId: "workspace-a",
        provider: "snowflake",
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.credentials).toMatchObject({ username: "loader" });
      }
    });

    it("refuses an already bound credential whose workspace no longer matches", async () => {
      const workspaceId = `ws-${crypto.randomUUID()}`;
      const connector = await ConnectorResource.makeNew(
        "snowflake",
        {
          connectionId: "cred_bound",
          workspaceAPIKey: "key",
          workspaceId,
          dataSourceId: `ds-${crypto.randomUUID()}`,
        },
        {}
      );
      getConnectionCredentialsMock.mockResolvedValue(
        fetchedCredential({ workspaceId: "somewhere-else" })
      );

      const result = await getConnectorAndCredentials({
        connectorId: connector.id,
        isTypeGuard: isSnowflakeCredentials,
        logger,
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe("invalid_credentials");
        expect(result.error.error).toBeInstanceOf(
          RemoteDatabaseCredentialBindingError
        );
      }
    });
  });
});
