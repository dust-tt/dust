import type { SnowflakeCredentials } from "@connectors/types";
import type { RowStatement } from "snowflake-sdk";
import snowflake from "snowflake-sdk";
import { describe, expect, it, vi } from "vitest";

import {
  isConnectionReadonly,
  isSnowflakeDatabaseUnavailableError,
} from "./snowflake_api";

describe("isConnectionReadonly", () => {
  const credentials: SnowflakeCredentials = {
    account: "test-account",
    username: "dust",
    password: "test-password",
    role: "DUST_ROLE",
    warehouse: "DUST_WAREHOUSE",
  };

  function mockConnection(grantsByQuery: Record<string, object[]>) {
    snowflake.configure({ logLevel: "OFF" });
    const connection = snowflake.createConnection(credentials);
    const statement: RowStatement = {
      getSqlText: vi.fn(),
      getStatus: vi.fn(),
      getColumns: vi.fn(),
      getColumn: vi.fn(),
      getNumRows: vi.fn(),
      getNumUpdatedRows: vi.fn(),
      getSessionState: vi.fn(),
      getRequestId: vi.fn(),
      getStatementId: vi.fn(),
      getQueryId: vi.fn(),
      cancel: vi.fn(),
      streamRows: vi.fn(),
      fetchRows: vi.fn(),
    };
    vi.spyOn(connection, "execute").mockImplementation((options) => {
      const rows = grantsByQuery[options.sqlText];
      if (!rows) {
        throw new Error(`Unexpected query: ${options.sqlText}`);
      }
      options.complete?.(undefined, statement, rows);
      return statement;
    });
    return connection;
  }

  it("allows CREATE WORKSPACE on a schema", async () => {
    const connection = mockConnection({
      "SHOW GRANTS TO ROLE DUST_ROLE": [
        {
          privilege: "CREATE WORKSPACE",
          granted_on: "SCHEMA",
          name: "DB.PUBLIC",
        },
      ],
      "SHOW FUTURE GRANTS TO ROLE DUST_ROLE": [],
    });

    const result = await isConnectionReadonly({ credentials, connection });

    expect(result.isOk()).toBe(true);
  });

  it.each([
    "READ",
    "WRITE",
    "OWNERSHIP",
  ])("allows current and future %s grants on workspaces", async (privilege) => {
    const connection = mockConnection({
      "SHOW GRANTS TO ROLE DUST_ROLE": [
        { privilege, granted_on: "WORKSPACE", name: "DB.PUBLIC.WORKSPACE" },
      ],
      "SHOW FUTURE GRANTS TO ROLE DUST_ROLE": [
        { privilege, grant_on: "WORKSPACE", name: "DB.PUBLIC.<WORKSPACE>" },
      ],
    });

    const result = await isConnectionReadonly({ credentials, connection });

    expect(result.isOk()).toBe(true);
  });

  it.each([
    { privilege: "CREATE TABLE", granted_on: "SCHEMA", name: "DB.PUBLIC" },
    { privilege: "INSERT", granted_on: "TABLE", name: "DB.PUBLIC.TABLE" },
    { privilege: "OWNERSHIP", granted_on: "SCHEMA", name: "DB.PUBLIC" },
  ])("rejects $privilege on $granted_on alongside workspace grants", async (grant) => {
    const connection = mockConnection({
      "SHOW GRANTS TO ROLE DUST_ROLE": [
        {
          privilege: "OWNERSHIP",
          granted_on: "WORKSPACE",
          name: "DB.PUBLIC.WORKSPACE",
        },
        grant,
      ],
      "SHOW FUTURE GRANTS TO ROLE DUST_ROLE": [],
    });

    const result = await isConnectionReadonly({ credentials, connection });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("NOT_READONLY");
      expect(result.error.message).toContain(`privilege=${grant.privilege}`);
      expect(result.error.message).toContain(`on ${grant.granted_on}`);
    }
  });
});

describe("isSnowflakeDatabaseUnavailableError", () => {
  it.each([
    "002043",
    "003030",
  ])("recognizes database-scoped error code %s", (code) => {
    const error = Object.assign(new Error("Database unavailable"), { code });

    expect(isSnowflakeDatabaseUnavailableError(error)).toBe(true);
  });

  it("does not skip an expired listing trial", () => {
    const error = Object.assign(
      new Error("Listing trial time limit exceeded"),
      {
        code: "090693",
      }
    );

    expect(isSnowflakeDatabaseUnavailableError(error)).toBe(false);
  });
});
