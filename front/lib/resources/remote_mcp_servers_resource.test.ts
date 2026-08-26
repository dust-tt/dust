import type { MCPToolType } from "@app/lib/api/mcp";
import { Authenticator } from "@app/lib/auth";
import { RemoteMCPServerToolMetadataResource } from "@app/lib/resources/remote_mcp_server_tool_metadata_resource";
import {
  getMCPAuthorizationScope,
  RemoteMCPServerResource,
} from "@app/lib/resources/remote_mcp_servers_resource";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const oauthMocks = vi.hoisted(() => ({
  discoverAuthorizationServerMetadata: vi.fn(),
  discoverOAuthProtectedResourceMetadata: vi.fn(),
  registerClient: vi.fn(),
}));

vi.mock("@modelcontextprotocol/sdk/client/auth.js", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@modelcontextprotocol/sdk/client/auth.js")
    >();

  return {
    ...actual,
    discoverAuthorizationServerMetadata:
      oauthMocks.discoverAuthorizationServerMetadata,
    discoverOAuthProtectedResourceMetadata:
      oauthMocks.discoverOAuthProtectedResourceMetadata,
    registerClient: oauthMocks.registerClient,
  };
});

const oauthProvider: OAuthClientProvider = {
  redirectUrl: undefined,
  clientMetadata: {
    client_name: "Dust",
    grant_types: ["authorization_code", "refresh_token"],
    redirect_uris: ["https://dust.example.com/oauth/mcp"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
  },
  clientInformation: () => undefined,
  tokens: () => undefined,
  saveTokens: () => undefined,
  redirectToAuthorization: () => undefined,
  saveCodeVerifier: () => undefined,
  codeVerifier: () => "verifier",
};

describe("RemoteMCPServerResource.discoverOAuthMetadata", () => {
  beforeEach(() => {
    oauthMocks.discoverAuthorizationServerMetadata.mockReset();
    oauthMocks.discoverOAuthProtectedResourceMetadata.mockReset();
    oauthMocks.registerClient.mockReset();

    oauthMocks.discoverOAuthProtectedResourceMetadata.mockResolvedValue({
      authorization_servers: ["https://auth.example.com"],
      resource: "https://mcp.example.com/mcp",
      scopes_supported: ["read", "write"],
    });
    oauthMocks.discoverAuthorizationServerMetadata.mockResolvedValue({
      authorization_endpoint: "https://auth.example.com/authorize",
      registration_endpoint: "https://auth.example.com/register",
      token_endpoint: "https://auth.example.com/token",
      token_endpoint_auth_methods_supported: [
        "client_secret_post",
        "client_secret_basic",
        "none",
      ],
    });
  });

  it.each([
    {
      registeredMethod: "none",
      clientSecret: undefined,
    },
    {
      registeredMethod: "client_secret_basic",
      clientSecret: "secret",
    },
    {
      registeredMethod: "client_secret_post",
      clientSecret: "secret",
    },
  ])(
    "persists the DCR-returned $registeredMethod token authentication method",
    async ({ registeredMethod, clientSecret }) => {
      oauthMocks.registerClient.mockResolvedValue({
        client_id: "registered-client",
        client_secret: clientSecret,
        token_endpoint_auth_method: registeredMethod,
      });

      const result = await RemoteMCPServerResource.discoverOAuthMetadata({
        serverUrl: "https://mcp.example.com/mcp",
        provider: oauthProvider,
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.token_endpoint_auth_method).toBe(registeredMethod);
      }
    }
  );
});

describe("getMCPAuthorizationScope", () => {
  it("requests offline access when the authorization server supports it", () => {
    expect(
      getMCPAuthorizationScope({
        extraScopes: "files.read",
        authorizationServerScopes: ["files.read", "offline_access"],
      })
    ).toBe("files.read offline_access");
  });

  it("omits offline access when the authorization server does not support it", () => {
    expect(
      getMCPAuthorizationScope({
        extraScopes: "files.read offline_access",
        authorizationServerScopes: ["files.read"],
      })
    ).toBe("files.read");
  });
});

describe("RemoteMCPServerResource.updateUrl", () => {
  it("updates the URL of a remote MCP server", async () => {
    const workspace = await WorkspaceFactory.basic();
    await SpaceFactory.system(workspace);
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const server = await RemoteMCPServerFactory.create(workspace, {
      url: "https://old.example.com/mcp",
      name: "Test Server",
    });

    expect(server.url).toBe("https://old.example.com/mcp");

    const result = await server.updateUrl(auth, "https://new.example.com/mcp");
    expect(result.isOk()).toBe(true);

    const refreshed = (await RemoteMCPServerResource.findByPk(
      auth,
      server.id
    ))!;
    expect(refreshed.url).toBe("https://new.example.com/mcp");
  });
});

describe("RemoteMCPServerResource.updateMetadata", () => {
  it("deletes stale tool metadata when cachedTools are updated", async () => {
    const workspace = await WorkspaceFactory.basic();
    await SpaceFactory.system(workspace);
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const initialTools: MCPToolType[] = [
      { name: "tool_a", description: "A", inputSchema: undefined },
      { name: "tool_b", description: "B", inputSchema: undefined },
      { name: "tool_c", description: "C", inputSchema: undefined },
    ];

    const server = await RemoteMCPServerFactory.create(workspace, {
      tools: initialTools,
      name: "Test Server",
    });

    // Seed metadata for the initial tools plus an extra one that will be stale.
    await RemoteMCPServerToolMetadataResource.updateOrCreateSettings(auth, {
      serverSId: server.sId,
      toolName: "tool_a",
      permission: "never_ask",
      enabled: true,
    });
    await RemoteMCPServerToolMetadataResource.updateOrCreateSettings(auth, {
      serverSId: server.sId,
      toolName: "tool_b",
      permission: "never_ask",
      enabled: true,
    });
    await RemoteMCPServerToolMetadataResource.updateOrCreateSettings(auth, {
      serverSId: server.sId,
      toolName: "tool_c",
      permission: "never_ask",
      enabled: true,
    });
    await RemoteMCPServerToolMetadataResource.updateOrCreateSettings(auth, {
      serverSId: server.sId,
      toolName: "tool_stale",
      permission: "never_ask",
      enabled: true,
    });

    // Sanity check: we have 4 metadata entries.
    const before = await RemoteMCPServerToolMetadataResource.fetchByServerId(
      auth,
      server.sId
    );
    expect(before.map((m) => m.toolName).sort()).toEqual([
      "tool_a",
      "tool_b",
      "tool_c",
      "tool_stale",
    ]);

    // Now update cachedTools to only include a subset (tool_a and tool_c).
    await server.updateMetadata(auth, {
      cachedTools: [
        { name: "tool_a", description: "A new", inputSchema: undefined },
        { name: "tool_c", description: "C new", inputSchema: undefined },
      ],
      lastSyncAt: new Date(),
    });

    // Validate stale tool metadata (tool_b and tool_stale) were deleted.
    const after = await RemoteMCPServerToolMetadataResource.fetchByServerId(
      auth,
      server.sId
    );
    const remainingNames = after.map((m) => m.toolName).sort();
    expect(remainingNames).toEqual(["tool_a", "tool_c"]);

    // Also ensure the server actually updated its cachedTools.
    const refreshed = (await RemoteMCPServerResource.findByPk(auth, server.id, {
      includeHeavyAttributes: ["cachedTools"],
    }))!;
    expect(
      refreshed
        .getCachedTools()
        .map((t) => t.name)
        .sort()
    ).toEqual(["tool_a", "tool_c"]);
  });
});

describe("RemoteMCPServerResource heavy attributes contract", () => {
  async function setup() {
    const workspace = await WorkspaceFactory.basic();
    await SpaceFactory.system(workspace);
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const server = await RemoteMCPServerFactory.create(workspace, {
      name: "Contract Server",
      tools: [{ name: "tool_a", description: "A", inputSchema: undefined }],
    });

    return { auth, server };
  }

  it("should throw on heavy attribute getters after a light fetch", async () => {
    const { auth, server } = await setup();

    const light = (await RemoteMCPServerResource.findByPk(auth, server.id))!;

    expect(() => light.getCachedTools()).toThrow(/was not fetched/);
    expect(() => light.getSharedSecret()).toThrow(/was not fetched/);
    expect(() => light.getAuthorization()).toThrow(/was not fetched/);
    expect(() => light.getCustomHeaders()).toThrow(/was not fetched/);
    expect(() => light.getLastError()).toThrow(/was not fetched/);
  });

  it("should only expose the getters listed in includeHeavyAttributes", async () => {
    const { auth, server } = await setup();

    const partial = (await RemoteMCPServerResource.findByPk(auth, server.id, {
      includeHeavyAttributes: ["sharedSecret"],
    }))!;

    expect(() => partial.getSharedSecret()).not.toThrow();
    expect(() => partial.getCachedTools()).toThrow(/was not fetched/);
    expect(() => partial.getAuthorization()).toThrow(/was not fetched/);
  });

  it("should hydrate only the requested heavy attributes", async () => {
    const { auth, server } = await setup();

    const light = (await RemoteMCPServerResource.findByPk(auth, server.id))!;
    await RemoteMCPServerResource.hydrateHeavyAttributes(
      auth,
      [light],
      ["cachedTools"]
    );

    expect(light.getCachedTools().map((t) => t.name)).toEqual(["tool_a"]);
    expect(() => light.getSharedSecret()).toThrow(/was not fetched/);
  });

  it("should reflect updateMetadata writes on getters without a refetch", async () => {
    const { auth, server } = await setup();

    const light = (await RemoteMCPServerResource.findByPk(auth, server.id))!;
    expect(() => light.getCachedTools()).toThrow(/was not fetched/);

    await light.updateMetadata(auth, {
      cachedTools: [
        { name: "tool_new", description: "N", inputSchema: undefined },
      ],
      lastSyncAt: new Date(),
    });

    expect(light.getCachedTools().map((t) => t.name)).toEqual(["tool_new"]);
  });
});
