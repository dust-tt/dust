import type { MCPToolType } from "@app/lib/api/mcp";
import { Authenticator } from "@app/lib/auth";
import { RemoteMCPServerToolMetadataResource } from "@app/lib/resources/remote_mcp_server_tool_metadata_resource";
import {
  RemoteMCPServerResource,
  customHeadersForOAuthDiscoveryRequest,
} from "@app/lib/resources/remote_mcp_servers_resource";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { describe, expect, it } from "vitest";

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

describe("customHeadersForOAuthDiscoveryRequest", () => {
  const customHeaders = {
    Authorization: "Bearer secret-token",
    "x-api-key": "secret-api-key",
  };

  it("keeps custom headers for same-origin OAuth discovery requests", () => {
    expect(
      customHeadersForOAuthDiscoveryRequest({
        serverUrl: "https://mcp.example.com/sse",
        requestUrl: "https://mcp.example.com/.well-known/oauth-protected-resource",
        customHeaders,
      })
    ).toEqual(customHeaders);
  });

  it("strips custom headers for cross-origin authorization server discovery", () => {
    expect(
      customHeadersForOAuthDiscoveryRequest({
        serverUrl: "https://mcp.example.com/sse",
        requestUrl:
          "https://attacker.example.com/.well-known/oauth-authorization-server",
        customHeaders,
      })
    ).toBeUndefined();
  });

  it("strips custom headers for malformed request URLs", () => {
    expect(
      customHeadersForOAuthDiscoveryRequest({
        serverUrl: "https://mcp.example.com/sse",
        requestUrl: "not a url",
        customHeaders,
      })
    ).toBeUndefined();
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
    const refreshed = (await RemoteMCPServerResource.findByPk(
      auth,
      server.id
    ))!;
    expect(refreshed.cachedTools?.map((t) => t.name).sort()).toEqual([
      "tool_a",
      "tool_c",
    ]);
  });
});
