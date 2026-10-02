import type { Authenticator } from "@app/lib/auth";
import { MCPServerConnectionResource } from "@app/lib/resources/mcp_server_connection_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { RemoteMCPServerResource } from "@app/lib/resources/remote_mcp_servers_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import logger from "@app/logger/logger";
import type { SeedContext } from "@app/scripts/seed/factories";
import { seedRemoteMCPSyncAuthWarning } from "@app/scripts/seed/factories";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import type { LightWorkspaceType } from "@app/types/user";
import { beforeEach, describe, expect, it } from "vitest";

const ASSET = {
  name: "Test Sync Warning Server",
  description: "Seeded for sync-auth-warning tests.",
  url: "https://mcp.example.invalid/mcp",
  oAuthUseCase: "platform_actions" as const,
  lastError: "401 Unauthorized",
  lastSyncAt: new Date("2026-01-01T12:00:00Z"),
};

describe("mcp_sync_auth_warning seed", () => {
  let workspace: LightWorkspaceType;
  let user: UserResource;
  let authenticator: Authenticator;
  let ctx: SeedContext;

  beforeEach(async () => {
    const testResources = await createResourceTest({ role: "admin" });
    workspace = testResources.workspace;
    user = testResources.user;
    authenticator = testResources.authenticator;
    ctx = { auth: authenticator, workspace, user, execute: true, logger };
  });

  it("creates a connected remote MCP server with lastError and shared use case", async () => {
    const view = await seedRemoteMCPSyncAuthWarning(ctx, ASSET);
    expect(view).not.toBeNull();
    expect(view?.oAuthUseCase).toBe("platform_actions");

    const servers = await RemoteMCPServerResource.listByWorkspace(
      authenticator,
      { includeHeavyAttributes: ["authorization", "lastError"] }
    );
    const server = servers.find((s) => s.cachedName === ASSET.name);
    expect(server).toBeDefined();
    expect(server?.getLastError()).toBe("401 Unauthorized");
    expect(server?.getAuthorization()?.provider).toBe("mcp");
    expect(server?.lastSyncAt?.toISOString()).toBe("2026-01-01T12:00:00.000Z");

    const connections = await MCPServerConnectionResource.listByMCPServer(
      authenticator,
      { mcpServerId: server!.sId }
    );
    expect(connections.isOk()).toBe(true);
    if (connections.isOk()) {
      expect(
        connections.value.some((c) => c.connectionType === "workspace")
      ).toBe(true);
    }

    const globalView =
      await MCPServerViewResource.getMCPServerViewForGlobalSpace(
        authenticator,
        server!.sId
      );
    expect(globalView?.oAuthUseCase).toBe("platform_actions");
  });

  it("is idempotent and restores the warning state on re-run", async () => {
    await seedRemoteMCPSyncAuthWarning(ctx, ASSET);

    const serversBefore =
      await RemoteMCPServerResource.listByWorkspace(authenticator);
    const countBefore = serversBefore.filter(
      (s) => s.cachedName === ASSET.name
    ).length;

    await seedRemoteMCPSyncAuthWarning(ctx, {
      ...ASSET,
      lastError: "token expired",
      oAuthUseCase: "personal_actions",
    });

    const serversAfter = await RemoteMCPServerResource.listByWorkspace(
      authenticator,
      { includeHeavyAttributes: ["lastError"] }
    );
    const matching = serversAfter.filter((s) => s.cachedName === ASSET.name);
    expect(matching).toHaveLength(countBefore);
    expect(matching[0]?.getLastError()).toBe("token expired");

    const globalView =
      await MCPServerViewResource.getMCPServerViewForGlobalSpace(
        authenticator,
        matching[0]!.sId
      );
    expect(globalView?.oAuthUseCase).toBe("personal_actions");
  });
});
