import type { ToolHandlerExtra } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { makePersonalAuthenticationError } from "@app/lib/actions/mcp_internal_actions/utils";
import { TOOLS } from "@app/lib/api/actions/servers/snowflake/tools";
import type { Authenticator } from "@app/lib/auth";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import type { CredentialsProvider } from "@app/types/oauth/lib";
import { Err, Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { listDatabasesMock, snowflakeClientConstructed, getCredentialsMock } =
  vi.hoisted(() => ({
    listDatabasesMock: vi.fn(),
    snowflakeClientConstructed: { count: 0 },
    getCredentialsMock: vi.fn(),
  }));

vi.mock("@app/lib/api/actions/servers/snowflake/client", () => ({
  SnowflakeClient: class {
    constructor() {
      snowflakeClientConstructed.count += 1;
    }
    listDatabases = listDatabasesMock;
  },
}));

vi.mock("@app/types/oauth/oauth_api", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@app/types/oauth/oauth_api")>();

  return {
    ...actual,
    OAuthAPI: vi.fn().mockImplementation(function OAuthAPIMock() {
      return {
        getCredentials: getCredentialsMock,
      };
    }),
  };
});

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

const KEY_PAIR_CONTENT = {
  username: "LOADER",
  account: "myorg-myaccount",
  role: "ANALYST",
  warehouse: "COMPUTE_WH",
  auth_type: "keypair" as const,
  private_key: "test-private-key",
};

function createTestExtra(
  auth: Authenticator,
  authInfo?: ToolHandlerExtra["authInfo"]
): ToolHandlerExtra {
  return {
    auth,
    authInfo: authInfo ?? {
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

function credentialAuthInfo(
  credentialId: string
): ToolHandlerExtra["authInfo"] {
  return {
    token: "",
    clientId: "snowflake-client",
    scopes: [],
    extra: {
      credentialId,
    },
  };
}

function mockCredential({
  workspaceId,
  provider = "snowflake",
  content = KEY_PAIR_CONTENT,
}: {
  workspaceId: string;
  provider?: CredentialsProvider;
  content?: Record<string, unknown>;
}) {
  getCredentialsMock.mockResolvedValue(
    new Ok({
      credential: {
        credential_id: "cred_snowflake",
        created: 0,
        provider,
        metadata: {
          workspace_id: workspaceId,
          user_id: "user_1",
        },
        content,
      },
    })
  );
}

describe("Snowflake tools", () => {
  beforeEach(() => {
    listDatabasesMock.mockReset();
    getCredentialsMock.mockReset();
    snowflakeClientConstructed.count = 0;
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
    expect(getCredentialsMock).not.toHaveBeenCalled();
  });

  it("logs in with a snowflake key-pair credential from the caller workspace", async () => {
    listDatabasesMock.mockResolvedValue(new Ok([]));
    const { authenticator, workspace } = await createResourceTest({
      role: "user",
    });
    mockCredential({ workspaceId: workspace.sId });

    const result = await getListDatabasesTool().handler(
      {},
      createTestExtra(authenticator, credentialAuthInfo("cred_snowflake"))
    );

    expect(result.isOk()).toBe(true);
    expect(getCredentialsMock).toHaveBeenCalledWith({
      credentialsId: "cred_snowflake",
    });
    expect(snowflakeClientConstructed.count).toBe(1);
  });

  it.each([
    {
      label: "another workspace",
      workspaceId: "other-workspace",
      provider: "snowflake" as const,
    },
    {
      label: "a non-snowflake provider",
      provider: "bigquery" as const,
    },
  ])("refuses a key-pair login for $label", async ({
    workspaceId,
    provider,
  }) => {
    const { authenticator, workspace } = await createResourceTest({
      role: "user",
    });
    mockCredential({
      workspaceId: workspaceId ?? workspace.sId,
      provider,
    });

    const result = await getListDatabasesTool().handler(
      {},
      createTestExtra(authenticator, credentialAuthInfo("cred_stolen"))
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toBe(
        "Snowflake connection not configured. Please connect your Snowflake account."
      );
    }
    expect(snowflakeClientConstructed.count).toBe(0);
    expect(listDatabasesMock).not.toHaveBeenCalled();
  });

  it("refuses a snowflake credential that is not a key pair", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "user",
    });
    mockCredential({
      workspaceId: workspace.sId,
      content: {
        username: "LOADER",
        account: "myorg-myaccount",
        role: "ANALYST",
        warehouse: "COMPUTE_WH",
        auth_type: "password",
        password: "secret",
      },
    });

    const result = await getListDatabasesTool().handler(
      {},
      createTestExtra(authenticator, credentialAuthInfo("cred_password"))
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("Invalid Snowflake credentials");
    }
    expect(snowflakeClientConstructed.count).toBe(0);
    expect(listDatabasesMock).not.toHaveBeenCalled();
  });
});
