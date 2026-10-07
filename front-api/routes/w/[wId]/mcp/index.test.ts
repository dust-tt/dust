import {
  DEFAULT_MCP_ACTION_VERSION,
  DEFAULT_MCP_SERVER_ICON,
} from "@app/lib/actions/constants";
import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import {
  allowsMultipleInstancesOfInternalMCPServerByName,
  INTERNAL_MCP_SERVERS,
} from "@app/lib/actions/mcp_internal_actions/constants";
import { fetchRemoteServerMetaDataByURL } from "@app/lib/actions/mcp_metadata";
import * as workosAudit from "@app/lib/api/audit/workos_audit";
import type { GetMCPServersResponseBody } from "@app/lib/api/mcp";
import { InternalMCPServerInMemoryResource } from "@app/lib/resources/internal_mcp_server_in_memory_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { RemoteMCPServerResource } from "@app/lib/resources/remote_mcp_servers_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import type { MembershipRoleType } from "@app/types/memberships";
import { Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/audit/workos_audit", async () => ({
  ...(await vi.importActual("@app/lib/api/audit/workos_audit")),
  emitAuditLogEvent: vi.fn(),
}));

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

beforeEach(() => {
  vi.mocked(workosAudit.emitAuditLogEvent).mockClear();
});

const SENTINEL_SECRET = "sentinel-shared-secret-9f3a";
const SENTINEL_HEADER = "sentinel-header-value-9f3a";
const SENTINEL_META = "sentinel-meta-value-9f3a";
const SENTINEL_QUERY = "sentinel-api-key-9f3a";

function dumpEmitCalls(): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(
    vi.mocked(workosAudit.emitAuditLogEvent).mock.calls,
    (_key, value: unknown) => {
      if (typeof value === "function") {
        return undefined;
      }
      if (value !== null && typeof value === "object") {
        if (seen.has(value)) {
          return undefined;
        }
        seen.add(value);
      }
      return value;
    }
  );
}

async function setup(role: MembershipRoleType = "admin") {
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

  it("returns light views with space, account and editor metadata", async () => {
    const { workspace, auth } = await setup();
    const server = await RemoteMCPServerFactory.create(workspace, {
      tools: [
        {
          name: "search",
          description: "Search things",
          inputSchema: {
            type: "object",
            properties: { query: { type: "string" } },
          },
        },
      ],
    });
    const view = await MCPServerViewResource.getMCPServerViewForSystemSpace(
      auth,
      server.sId
    );
    expect(view).not.toBeNull();
    const updateResult = await view!.updateOAuthUseCase(
      auth,
      "personal_actions"
    );
    expect(updateResult.isOk()).toBe(true);

    const response = await getMcp(workspace);
    expect(response.status).toBe(200);
    const body: GetMCPServersResponseBody = await response.json();
    const listedServer = body.servers.find((s) => s.sId === server.sId);
    const listedView = listedServer?.views.find((v) => v.sId === view!.sId);

    expect(listedServer?.tools[0].inputSchema).toBeDefined();
    expect(listedView).toMatchObject({
      sId: view!.sId,
      spaceId: view!.space.sId,
      oAuthUseCase: "personal_actions",
      editedByUser: { userId: auth.getNonNullableUser().sId },
      server: { sId: server.sId, tools: [] },
    });
    expect(listedView?.server).not.toHaveProperty("authorization");
    expect(listedView?.server).not.toHaveProperty("sharedSecret");
    expect(listedView?.server).not.toHaveProperty("customHeaders");
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
  it("allows a custom view name to resolve a cropped tool name conflict", async () => {
    const { workspace, auth } = await setup();
    const sharedPrefix = "a".repeat(80);
    const existingName = `${sharedPrefix}-existing`;
    const candidateName = `${sharedPrefix}-candidate`;
    const tools = [
      {
        name: "test-tool",
        description: "Test tool description",
        inputSchema: undefined,
      },
    ];

    const existingServer = await RemoteMCPServerFactory.create(workspace, {
      name: existingName,
      url: "https://existing.example.com",
      tools,
    });
    const systemView =
      await MCPServerViewResource.getMCPServerViewForSystemSpace(
        auth,
        existingServer.sId
      );
    expect(systemView).toBeDefined();

    const globalSpace = await SpaceResource.fetchWorkspaceGlobalSpace(auth);
    await MCPServerViewResource.create(auth, {
      systemView: systemView!,
      space: globalSpace,
    });

    vi.mocked(fetchRemoteServerMetaDataByURL).mockResolvedValueOnce(
      new Ok({
        name: candidateName,
        version: DEFAULT_MCP_ACTION_VERSION,
        description: "Test description",
        icon: DEFAULT_MCP_SERVER_ICON,
        authorization: null,
        tools,
        availability: "manual",
        allowMultipleInstances: true,
        documentationUrl: null,
      })
    );

    const response = await postMcp(workspace, {
      serverType: "remote",
      url: "https://new-server.example.com",
      includeGlobal: true,
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.message).toContain(candidateName);
    // Cropped tool-name collision: the response names the existing connection
    // and the shared model-facing tool name.
    expect(body.nameConflict.name).toBe(candidateName);
    expect(body.nameConflict.conflictDetails.conflictingServerName).toBe(
      existingName
    );
    expect(body.nameConflict.conflictDetails.conflictingToolName).toContain(
      "test_tool"
    );
    expect(body.error.message).toContain(
      body.nameConflict.conflictDetails.conflictingToolName
    );

    vi.mocked(fetchRemoteServerMetaDataByURL).mockResolvedValueOnce(
      new Ok({
        name: candidateName,
        version: DEFAULT_MCP_ACTION_VERSION,
        description: "Test description",
        icon: DEFAULT_MCP_SERVER_ICON,
        authorization: null,
        tools,
        availability: "manual",
        allowMultipleInstances: true,
        documentationUrl: null,
      })
    );

    const customName = "custom-view-name";
    const retryResponse = await postMcp(workspace, {
      serverType: "remote",
      url: "https://new-server.example.com",
      includeGlobal: true,
      viewName: ` ${customName} `,
    });

    expect(retryResponse.status).toBe(201);
    const retryBody = await retryResponse.json();
    expect(retryBody.server.name).toBe(candidateName);
    const createdSystemView =
      await MCPServerViewResource.getMCPServerViewForSystemSpace(
        auth,
        retryBody.server.sId
      );
    expect(createdSystemView?.name).toBe(customName);

    const globalViews = await MCPServerViewResource.listBySpace(
      auth,
      globalSpace
    );
    expect(
      globalViews.find((view) => view.mcpServerId === retryBody.server.sId)
        ?.name
    ).toBe(customName);
  });

  it("does not flag a dropped-prefix tool name against servers without that tool", async () => {
    const { workspace, auth } = await setup();

    // Existing connection with unrelated tools.
    const existingServer = await RemoteMCPServerFactory.create(workspace, {
      name: "existing-unrelated-server",
      url: "https://existing.example.com",
      tools: [
        {
          name: "generate_image",
          description: "Generate an image",
          inputSchema: undefined,
        },
      ],
    });
    await MCPServerViewFactory.create(
      workspace,
      existingServer.sId,
      await SpaceResource.fetchWorkspaceGlobalSpace(auth)
    );

    // 62-char tool name: no room for the server-name prefix, so the model-facing
    // name is the bare tool name whatever the server is called. It must not be
    // reported as conflicting with servers that do not expose that tool.
    const longToolName = `get_${"a".repeat(58)}`;
    expect(longToolName).toHaveLength(62);
    vi.mocked(fetchRemoteServerMetaDataByURL).mockResolvedValueOnce(
      new Ok({
        name: "candidate-server",
        version: DEFAULT_MCP_ACTION_VERSION,
        description: "Test description",
        icon: DEFAULT_MCP_SERVER_ICON,
        authorization: null,
        tools: [
          {
            name: longToolName,
            description: "Tool with a very long name",
            inputSchema: undefined,
          },
        ],
        availability: "manual",
        allowMultipleInstances: true,
        documentationUrl: null,
      })
    );

    const response = await postMcp(workspace, {
      serverType: "remote",
      url: "https://new-server.example.com",
      includeGlobal: true,
    });

    expect(response.status).toBe(201);
  });

  it("flags a dropped-prefix tool name against a server exposing the same tool", async () => {
    const { workspace, auth } = await setup();

    const longToolName = `get_${"a".repeat(58)}`;
    const existingServer = await RemoteMCPServerFactory.create(workspace, {
      name: "existing-long-tool-server",
      url: "https://existing.example.com",
      tools: [
        {
          name: longToolName,
          description: "Tool with a very long name",
          inputSchema: undefined,
        },
      ],
    });
    await MCPServerViewFactory.create(
      workspace,
      existingServer.sId,
      await SpaceResource.fetchWorkspaceGlobalSpace(auth)
    );

    // Both servers expose the same 62-char tool: the model-facing name is the bare tool name on
    // both sides, so this is a genuine collision.
    vi.mocked(fetchRemoteServerMetaDataByURL).mockResolvedValueOnce(
      new Ok({
        name: "candidate-server",
        version: DEFAULT_MCP_ACTION_VERSION,
        description: "Test description",
        icon: DEFAULT_MCP_SERVER_ICON,
        authorization: null,
        tools: [
          {
            name: longToolName,
            description: "Tool with a very long name",
            inputSchema: undefined,
          },
        ],
        availability: "manual",
        allowMultipleInstances: true,
        documentationUrl: null,
      })
    );

    const response = await postMcp(workspace, {
      serverType: "remote",
      url: "https://new-server.example.com",
      includeGlobal: true,
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.nameConflict.conflictDetails.conflictingServerName).toBe(
      "existing-long-tool-server"
    );
    expect(body.nameConflict.conflictDetails.conflictingToolName).toBe(
      longToolName
    );
  });

  it("normalizes custom view names before checking exact conflicts", async () => {
    const { workspace, auth } = await setup();
    const existingName = "existing-name";
    const existingServer = await RemoteMCPServerFactory.create(workspace, {
      name: existingName,
      url: "https://existing.example.com",
      tools: [],
    });
    const systemView =
      await MCPServerViewResource.getMCPServerViewForSystemSpace(
        auth,
        existingServer.sId
      );
    expect(systemView).toBeDefined();

    await MCPServerViewResource.create(auth, {
      systemView: systemView!,
      space: await SpaceResource.fetchWorkspaceGlobalSpace(auth),
    });

    vi.mocked(fetchRemoteServerMetaDataByURL).mockResolvedValueOnce(
      new Ok({
        name: "candidate-name",
        version: DEFAULT_MCP_ACTION_VERSION,
        description: "Test description",
        icon: DEFAULT_MCP_SERVER_ICON,
        authorization: null,
        tools: [],
        availability: "manual",
        allowMultipleInstances: true,
        documentationUrl: null,
      })
    );

    const response = await postMcp(workspace, {
      serverType: "remote",
      url: "https://new-server.example.com",
      includeGlobal: true,
      viewName: ` ${existingName} `,
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.message).toContain(existingName);
    // Same-name collision: no cropped tool name, just the conflicting server.
    expect(body.nameConflict.name).toBe(existingName);
    expect(body.nameConflict.conflictDetails).toEqual({
      conflictingServerName: existingName,
    });
  });

  it("rejects custom view names longer than the database column", async () => {
    const { workspace, auth } = await setup();

    const response = await postMcp(workspace, {
      serverType: "remote",
      url: "https://new-server.example.com",
      includeGlobal: true,
      viewName: "a".repeat(256),
    });

    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toContain("255");
    expect(await RemoteMCPServerResource.listByWorkspace(auth)).toHaveLength(0);
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

describe("POST /api/w/:wId/mcp/ catalog audit", () => {
  it("emits mcp_server.created for a remote server", async () => {
    const { workspace } = await setup();

    const response = await postMcp(workspace, {
      serverType: "remote",
      url: "https://catalog.example.com/mcp",
      includeGlobal: false,
    });

    expect(response.status).toBe(201);
    const body: { server: { sId: string } } = await response.json();
    expect(workosAudit.emitAuditLogEvent).toHaveBeenCalledTimes(1);
    expect(workosAudit.emitAuditLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "mcp_server.created",
        targets: [
          expect.objectContaining({ type: "workspace", id: workspace.sId }),
          expect.objectContaining({
            type: "mcp_server",
            id: body.server.sId,
            name: "Test Server",
          }),
        ],
        metadata: {
          server_type: "remote",
          server_name: "Test Server",
        },
      })
    );
  });

  it("emits mcp_server.created for an internal server", async () => {
    const { workspace } = await setup();

    const response = await postMcp(workspace, {
      name: "agent_memory" as InternalMCPServerNameType,
      serverType: "internal",
      includeGlobal: false,
    });

    expect(response.status).toBe(201);
    const body: { server: { sId: string; name: string } } =
      await response.json();
    expect(body.server.name).toBe("agent_memory");
    expect(workosAudit.emitAuditLogEvent).toHaveBeenCalledTimes(1);
    expect(workosAudit.emitAuditLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "mcp_server.created",
        targets: [
          expect.objectContaining({ type: "workspace", id: workspace.sId }),
          expect.objectContaining({
            type: "mcp_server",
            id: body.server.sId,
            name: "agent_memory",
          }),
        ],
        metadata: {
          server_type: "internal",
          server_name: "agent_memory",
          internal_name: "agent_memory",
        },
      })
    );
  });

  it("still emits mcp_server.created when includeGlobal fails after the row is committed", async () => {
    const { workspace, auth } = await setup();
    const viewSpy = vi
      .spyOn(MCPServerViewResource, "getMCPServerViewForSystemSpace")
      .mockResolvedValue(null);

    try {
      const response = await postMcp(workspace, {
        serverType: "remote",
        url: "https://catalog.example.com/mcp",
        includeGlobal: true,
      });

      expect(response.status).toBe(400);
      expect(await RemoteMCPServerResource.listByWorkspace(auth)).toHaveLength(
        1
      );
      expect(workosAudit.emitAuditLogEvent).toHaveBeenCalledTimes(1);
      expect(workosAudit.emitAuditLogEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "mcp_server.created",
          metadata: {
            server_type: "remote",
            server_name: "Test Server",
          },
        })
      );
    } finally {
      viewSpy.mockRestore();
    }
  });

  it("does not put secrets, header values, meta, or URL queries in catalog events", async () => {
    const { workspace } = await setup();
    const response = await postMcp(workspace, {
      serverType: "remote",
      url: `https://catalog.example.com/mcp?api_key=${SENTINEL_QUERY}`,
      includeGlobal: false,
      sharedSecret: SENTINEL_SECRET,
      customHeaders: [{ key: "X-Api-Key", value: SENTINEL_HEADER }],
    });
    expect(response.status).toBe(201);
    const body: { server: { sId: string } } = await response.json();

    const credentials = await honoApp.request(
      `/api/w/${workspace.sId}/mcp/${body.server.sId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sharedSecret: SENTINEL_SECRET,
          customHeaders: [{ key: "X-Api-Key", value: SENTINEL_HEADER }],
        }),
      }
    );
    expect(credentials.status).toBe(200);

    const meta = await honoApp.request(
      `/api/w/${workspace.sId}/mcp/${body.server.sId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meta: { note: SENTINEL_META } }),
      }
    );
    expect(meta.status).toBe(200);

    expect(workosAudit.emitAuditLogEvent).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        action: "mcp_server.created",
        metadata: {
          server_type: "remote",
          server_name: "Test Server",
        },
      })
    );
    expect(workosAudit.emitAuditLogEvent).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        action: "mcp_server.updated",
        metadata: {
          server_type: "remote",
          server_name: "Test Server",
          change_kind: "credentials",
          changed_fields: "custom_headers,shared_secret",
          shared_secret_change: "set",
          custom_headers_change: "set",
        },
      })
    );
    expect(workosAudit.emitAuditLogEvent).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        action: "mcp_server.updated",
        metadata: {
          server_type: "remote",
          server_name: "Test Server",
          change_kind: "meta",
          changed_fields: "meta",
          meta_cleared: "false",
        },
      })
    );

    const dumped = dumpEmitCalls();
    expect(dumped).not.toContain(SENTINEL_SECRET);
    expect(dumped).not.toContain(SENTINEL_HEADER);
    expect(dumped).not.toContain(SENTINEL_META);
    expect(dumped).not.toContain(SENTINEL_QUERY);
  });
});
