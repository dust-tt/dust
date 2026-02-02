import { beforeEach, describe, expect, it, vi } from "vitest";

import { Ok } from "@app/types";

const mockSnowflakeClientConstructor = vi.fn();

class SnowflakeClientMock {
  constructor(options: unknown) {
    return mockSnowflakeClientConstructor(options);
  }
}

vi.mock("@app/lib/api/actions/servers/snowflake/client", () => ({
  SnowflakeClient: SnowflakeClientMock,
}));

describe("Snowflake MCP tool auth parsing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses OAuth token when authInfo.token is provided", async () => {
    mockSnowflakeClientConstructor.mockReturnValue({
      listDatabases: vi.fn().mockResolvedValue(new Ok(["DB1"])),
    });

    const { TOOLS } = await import("@app/lib/api/actions/servers/snowflake/tools");
    const tool = TOOLS.find((t) => t.name === "list_databases");
    expect(tool).toBeDefined();

    const res = await tool!.handler(
      {},
      {
        authInfo: {
          token: "oauth_token",
          extra: {
            snowflake_account: "acc",
            snowflake_warehouse: "wh",
          },
        },
      } as any
    );

    expect(res.isOk()).toBe(true);
    expect(mockSnowflakeClientConstructor).toHaveBeenCalledWith({
      account: "acc",
      warehouse: "wh",
      auth: { type: "oauth", accessToken: "oauth_token" },
    });
  });

  it("uses key-pair credentials when authInfo.extra indicates keypair", async () => {
    mockSnowflakeClientConstructor.mockReturnValue({
      listDatabases: vi.fn().mockResolvedValue(new Ok(["DB1"])),
    });

    const { TOOLS } = await import("@app/lib/api/actions/servers/snowflake/tools");
    const tool = TOOLS.find((t) => t.name === "list_databases");
    expect(tool).toBeDefined();

    const res = await tool!.handler(
      {},
      {
        authInfo: {
          token: "",
          extra: {
            snowflake_auth_type: "keypair",
            snowflake_account: "acc",
            snowflake_warehouse: "wh",
            snowflake_username: "user",
            snowflake_role: "role",
            snowflake_private_key: "-----BEGIN PRIVATE KEY-----\nMIIB...\n-----END PRIVATE KEY-----",
          },
        },
      } as any
    );

    expect(res.isOk()).toBe(true);
    expect(mockSnowflakeClientConstructor).toHaveBeenCalledWith({
      account: "acc",
      warehouse: "wh",
      auth: {
        type: "keypair",
        username: "user",
        role: "role",
        privateKey: "-----BEGIN PRIVATE KEY-----\nMIIB...\n-----END PRIVATE KEY-----",
      },
    });
  });

  it("fails safely when misconfigured", async () => {
    mockSnowflakeClientConstructor.mockReturnValue({
      listDatabases: vi.fn().mockResolvedValue(new Ok(["DB1"])),
    });

    const { TOOLS } = await import("@app/lib/api/actions/servers/snowflake/tools");
    const tool = TOOLS.find((t) => t.name === "list_databases");
    expect(tool).toBeDefined();

    const res = await tool!.handler(
      {},
      {
        authInfo: {
          token: "",
          extra: {
            snowflake_auth_type: "keypair",
            snowflake_account: "acc",
            snowflake_warehouse: "wh",
            snowflake_username: "user",
            snowflake_role: "role",
            // missing snowflake_private_key
          },
        },
      } as any
    );

    expect(res.isErr()).toBe(true);
    if (res.isErr()) {
      expect(res.error.message).toContain("Snowflake connection not configured");
    }
  });
});
