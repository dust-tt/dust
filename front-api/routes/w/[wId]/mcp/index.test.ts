import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import {
  allowsMultipleInstancesOfInternalMCPServerByName,
  INTERNAL_MCP_SERVERS,
} from "@app/lib/actions/mcp_internal_actions/constants";
import { InternalMCPServerInMemoryResource } from "@app/lib/resources/internal_mcp_server_in_memory_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { Ok } from "@app/types/shared/result";
import { describe, expect, it, vi } from "vitest";

vi.mock(import("@app/lib/actions/mcp_metadata"), async (importOriginal) => {
  const mod = await importOriginal();
  return {
    ...mod,
    fetchRemoteServerMetaDataByURL: vi.fn().mockImplementation(
      () =>
        new Ok({
          name: "Test Server",
          description: "Test description",
          tools: [{ name: "test-tool", description: "Test tool description" }],
        })
    ),
  };
});

import { honoApp } from "@front-api/app";

async function setup(role: "builder" | "user" | "admin" = "admin") {
  const { workspace, auth } = await createPrivateApiMockRequest({ role });
  await SpaceFactory.defaults(auth);
  return { workspace, auth };
}

function getMcp(workspace: { sId: string }) {
  return honoApp.request(`/api/w/${workspace.sId}/mcp`);
}

function postMcp(workspace: { sId: string }, body: unknown) {
  return honoApp.request(`/api/w/${workspace.sId}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/w/:wId/mcp/", () => {
  it("returns a list of servers", async () => {
    const { workspace } = await setup();

    await RemoteMCPServerFactory.create(workspace, {
      name: "Test Server 1",
      url: "https://test-server-1.example.com",
      tools: [
        {
          name: "tool-1",
          description: "Tool 1 description",
          inputSchema: undefined,
        },
      ],
    });
    await RemoteMCPServerFactory.create(workspace, {
      name: "Test Server 2",
      url: "https://test-server-2.example.com",
      tools: [
        {
          name: "tool-2",
          description: "Tool 2 description",
          inputSchema: undefined,
        },
      ],
    });

    const response = await getMcp(workspace);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty("servers");
    expect(body.servers).toHaveLength(2);
  });

  it("returns empty array when no servers exist", async () => {
    const { workspace } = await setup();

    const response = await getMcp(workspace);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.servers).toBeInstanceOf(Array);
    expect(body.servers).toHaveLength(0);
  });
});

describe("POST /api/w/:wId/mcp/ — body validation", () => {
  it("returns 400 when URL is missing", async () => {
    const { workspace } = await setup();
    const response = await postMcp(workspace, {});

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.type).toBe("invalid_request_error");
  });
});

describe("POST /api/w/:wId/mcp/ — creation", () => {
  it("creates an internal MCP server", async () => {
    const { workspace, auth } = await setup();

    const response = await postMcp(workspace, {
      name: "agent_memory" as InternalMCPServerNameType,
      serverType: "internal",
      includeGlobal: true,
    });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toEqual({
      success: true,
      server: expect.objectContaining({ name: "agent_memory" }),
    });

    expect(await MCPServerViewResource.listForSystemSpace(auth)).toHaveLength(
      1
    );
  });

  it("fails to create an internal MCP server if it already exists", async () => {
    const { workspace, auth } = await setup();

    expect(
      allowsMultipleInstancesOfInternalMCPServerByName("agent_memory")
    ).toBe(false);

    const internalServer = await InternalMCPServerInMemoryResource.makeNew(
      auth,
      { name: "agent_memory", useCase: null }
    );
    expect(internalServer).toBeDefined();
    expect(await MCPServerViewResource.listForSystemSpace(auth)).toHaveLength(
      1
    );

    const response = await postMcp(workspace, {
      name: "agent_memory" as InternalMCPServerNameType,
      serverType: "internal",
      includeGlobal: true,
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        type: "invalid_request_error",
        message:
          "This internal tool has already been added and only one instance is allowed.",
      },
    });
  });

  it("creates an internal MCP server when multiple instances are allowed", async () => {
    const { workspace, auth } = await setup();

    const originalConfig = INTERNAL_MCP_SERVERS["agent_memory"];
    Object.defineProperty(INTERNAL_MCP_SERVERS, "agent_memory", {
      value: {
        ...originalConfig,
        availability: "manual",
        allowMultipleInstances: true,
      },
      writable: true,
      configurable: true,
    });

    expect(
      allowsMultipleInstancesOfInternalMCPServerByName("agent_memory")
    ).toBe(true);

    const internalServer = await InternalMCPServerInMemoryResource.makeNew(
      auth,
      { name: "agent_memory", useCase: null }
    );
    expect(internalServer).toBeDefined();
    expect(await MCPServerViewResource.listForSystemSpace(auth)).toHaveLength(
      1
    );

    const response = await postMcp(workspace, {
      name: "agent_memory" as InternalMCPServerNameType,
      serverType: "internal",
      includeGlobal: true,
    });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toEqual({
      success: true,
      server: expect.objectContaining({ name: "agent_memory" }),
    });
    expect(body.server.id).not.toBe(internalServer.id);

    Object.defineProperty(INTERNAL_MCP_SERVERS, "agent_memory", {
      value: originalConfig,
      writable: true,
      configurable: true,
    });
  });

  it("creates an internal MCP server with bearer token credentials", async () => {
    const { workspace, auth } = await setup();
    const sharedSecret = "test-secret-123";

    const response = await postMcp(workspace, {
      name: "slab" satisfies InternalMCPServerNameType,
      serverType: "internal",
      includeGlobal: true,
      sharedSecret,
      customHeaders: [
        { key: "X-Custom-Header", value: "custom-value" },
        { key: "Authorization", value: "Bearer should-be-kept" },
      ],
    });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toEqual({
      success: true,
      server: expect.objectContaining({
        name: "slab",
        sharedSecret: expect.stringContaining("•"),
        customHeaders: expect.any(Object),
      }),
    });
    expect(body.server.customHeaders).not.toBeNull();
    expect(body.server.customHeaders).toHaveProperty("X-Custom-Header");
    expect(body.server.customHeaders["X-Custom-Header"]).toContain("•");

    const credentials =
      await InternalMCPServerInMemoryResource.fetchDecryptedCredentials(
        auth,
        body.server.sId
      );

    expect(credentials).toBeDefined();
    expect(credentials?.sharedSecret).toBe(sharedSecret);
    expect(credentials?.customHeaders).toEqual({
      Authorization: "Bearer should-be-kept",
      "X-Custom-Header": "custom-value",
    });
  });
});

describe("POST /api/w/:wId/mcp/ — name conflict", () => {
  it("returns 400 when creating a remote server with includeGlobal and name conflicts in global space", async () => {
    const { workspace, auth } = await setup();

    const existingServer = await RemoteMCPServerFactory.create(workspace, {
      name: "Test Server",
      url: "https://existing.example.com",
    });
    const globalSpace = await SpaceResource.fetchWorkspaceGlobalSpace(auth);
    const systemView =
      await MCPServerViewResource.getMCPServerViewForSystemSpace(
        auth,
        existingServer.sId
      );
    expect(systemView).not.toBeNull();
    await MCPServerViewResource.create(auth, {
      systemView: systemView!,
      space: globalSpace,
    });

    const response = await postMcp(workspace, {
      serverType: "remote",
      url: "https://new-server.example.com",
      includeGlobal: true,
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.message).toContain("Test Server");
  });

  it("succeeds when creating a remote server with includeGlobal and no name conflict", async () => {
    const { workspace } = await setup();

    const response = await postMcp(workspace, {
      serverType: "remote",
      url: "https://new-server.example.com",
      includeGlobal: true,
    });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.success).toBe(true);
  });
});
