import type { ToolHandlerExtra } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { makePersonalAuthenticationError } from "@app/lib/actions/mcp_internal_actions/utils";
import { TOOLS } from "@app/lib/api/actions/servers/snowflake/tools";
import type { Authenticator } from "@app/lib/auth";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { Err } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { listDatabasesMock } = vi.hoisted(() => ({
  listDatabasesMock: vi.fn(),
}));

vi.mock("@app/lib/api/actions/servers/snowflake/client", () => ({
  SnowflakeClient: class {
    listDatabases = listDatabasesMock;
  },
}));

function getListDatabasesTool() {
  const tool = TOOLS.find(({ name }) => name === "list_databases");
  if (!tool) {
    throw new Error("Snowflake list_databases tool not found");
  }
  return tool;
}

function createRequestFailedError(statusCode: number): Error {
  return Object.assign(new Error(`Snowflake API returned ${statusCode}`), {
    name: "RequestFailedError",
    response: { statusCode },
  });
}

function createTestExtra(auth: Authenticator): ToolHandlerExtra {
  return {
    auth,
    authInfo: {
      token: "snowflake-token",
      clientId: "snowflake-client",
      scopes: [],
      extra: {
        snowflake_account: "test-account",
        snowflake_warehouse: "test-warehouse",
      },
    },
    requestId: "snowflake-auth-error-test",
    // @ts-expect-error These focused error-path tests do not require a run context.
    runContext: undefined,
    sendNotification: async () => {},
    sendRequest: async () => {
      throw new Error("Unexpected MCP request");
    },
    signal: new AbortController().signal,
  };
}

describe("Snowflake tools", () => {
  beforeEach(() => {
    listDatabasesMock.mockReset();
  });

  it.each([
    401, 403,
  ])("returns a personal authentication error for HTTP %s", async (statusCode) => {
    listDatabasesMock.mockResolvedValue(
      new Err(createRequestFailedError(statusCode))
    );
    const { authenticator } = await createResourceTest({ role: "admin" });

    const result = await getListDatabasesTool().handler(
      {},
      createTestExtra(authenticator)
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual(
        makePersonalAuthenticationError("snowflake").content
      );
    }
  });

  it("keeps non-authentication failures as MCP errors", async () => {
    listDatabasesMock.mockResolvedValue(new Err(createRequestFailedError(500)));
    const { authenticator } = await createResourceTest({ role: "admin" });

    const result = await getListDatabasesTool().handler(
      {},
      createTestExtra(authenticator)
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toBe("Snowflake API returned 500");
    }
  });
});
