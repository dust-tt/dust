import type { RequestMethod } from "node-mocks-http";
import { describe, expect, it, vi } from "vitest";

import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/server_constants";
import {
  allowsMultipleInstancesOfInternalMCPServerByName,
  INTERNAL_MCP_SERVERS,
} from "@app/lib/actions/mcp_internal_actions/server_constants";
import { InternalMCPServerInMemoryResource } from "@app/lib/resources/internal_mcp_server_in_memory_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { Ok } from "@app/types";

import handler from "./index";

// Mock the data_sources module to spy on upsertTable
vi.mock(
  import("../../../../../lib/actions/mcp_metadata"),
  async (importOriginal) => {
    const mod = await importOriginal();
    return {
      ...mod,
      fetchRemoteServerMetaDataByURL: vi.fn().mockImplementation(() => {
        return new Ok({
          name: "Test Server",
          description: "Test description",
          tools: [{ name: "test-tool", description: "Test tool description" }],
        });
      }),
    };
  }
);

async function setupTest(
  role: "builder" | "user" | "admin" = "admin",
  method: RequestMethod = "GET"
) {
  const { req, res, workspace, authenticator } =
    await createPrivateApiMockRequest({
      role,
      method,
    });

  // Create a system space to hold the Remote MCP servers
  await SpaceFactory.defaults(authenticator);

  // Set up common query parameters
  req.query.wId = workspace.sId;

  return { req, res, workspace, authenticator };
}

vi.mock(import("@app/lib/actions/mcp_actions"), async (importOriginal) => {
  const mod = await importOriginal();
  return {
    ...mod,
    fetchServerMetadata: vi.fn().mockResolvedValue({
      name: "Test Server",
      description: "Test description",
      tools: [{ name: "test-tool", description: "Test tool description" }],
    }),
  };
});

describe("GET /api/w/[wId]/mcp/", () => {
  it("should return a list of servers", async () => {
    const { req, res, workspace } = await setupTest();

    req.query.filter = "remote";

    // Create two test servers
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

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);

    const responseData = res._getJSONData();
    expect(responseData).toHaveProperty("servers");
    expect(responseData.servers).toHaveLength(2);
  });

  it("should return empty array when no servers exist", async () => {
    const { req, res } = await setupTest();

    req.query.filter = "remote";

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);

    const responseData = res._getJSONData();
    expect(responseData).toHaveProperty("servers");
    expect(responseData.servers).toBeInstanceOf(Array);
    expect(responseData.servers).toHaveLength(0);
  });
});

describe("POST /api/w/[wId]/mcp/", () => {
  it("should return 400 when URL is missing", async () => {
    const { req, res } = await setupTest("admin", "POST");

    req.body = {};

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "invalid_request_error",
        message: "Invalid request body",
      },
    });
  });
});

describe("POST /api/w/[wId]/mcp/", () => {
  it("should create an internal MCP server", async () => {
    const { req, res, authenticator } = await setupTest("admin", "POST");

    req.body = {
      name: "agent_memory" as InternalMCPServerNameType,
      serverType: "internal",
      includeGlobal: true,
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(201);
    expect(res._getJSONData()).toEqual({
      success: true,
      server: expect.objectContaining({
        name: "agent_memory",
      }),
    });

    expect(
      await MCPServerViewResource.listForSystemSpace(authenticator)
    ).toHaveLength(1);
  });

  it("should fail to create an internal MCP server if it already exists", async () => {
    const { req, res, authenticator } = await setupTest("admin", "POST");

    // Make sure we can only create one instance of this internal MCP server.
    expect(
      allowsMultipleInstancesOfInternalMCPServerByName("agent_memory")
    ).toBe(false);

    // Create the first instance.
    const internalServer = await InternalMCPServerInMemoryResource.makeNew(
      authenticator,
      {
        name: "agent_memory",
        useCase: null,
      }
    );

    expect(internalServer).toBeDefined();

    expect(
      await MCPServerViewResource.listForSystemSpace(authenticator)
    ).toHaveLength(1);

    req.body = {
      name: "agent_memory" as InternalMCPServerNameType,
      serverType: "internal",
      includeGlobal: true,
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "invalid_request_error",
        message:
          "This internal tool has already been added and only one instance is allowed.",
      },
    });
  });

  it("should  create an internal MCP server if it already exists but multiple instances are allowed", async () => {
    const { req, res, authenticator } = await setupTest("admin", "POST");

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

    // Make sure we can only create one instance of this internal MCP server.
    expect(
      allowsMultipleInstancesOfInternalMCPServerByName("agent_memory")
    ).toBe(true);

    // Create the first instance.
    const internalServer = await InternalMCPServerInMemoryResource.makeNew(
      authenticator,
      {
        name: "agent_memory",
        useCase: null,
      }
    );

    expect(internalServer).toBeDefined();

    expect(
      await MCPServerViewResource.listForSystemSpace(authenticator)
    ).toHaveLength(1);

    req.body = {
      name: "agent_memory" as InternalMCPServerNameType,
      serverType: "internal",
      includeGlobal: true,
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(201);
    expect(res._getJSONData()).toEqual({
      success: true,
      server: expect.objectContaining({
        name: "agent_memory",
      }),
    });
    expect(res._getJSONData().server.id).not.toBe(internalServer.id);

    Object.defineProperty(INTERNAL_MCP_SERVERS, "agent_memory", {
      value: originalConfig,
      writable: true,
      configurable: true,
    });
  });
});

describe("Method Support /api/w/[wId]/mcp", () => {
  it("only supports GET and POST methods", async () => {
    for (const method of ["DELETE", "PUT", "PATCH"] as const) {
      const { req, res } = await setupTest("admin", method);

      await handler(req, res);

      expect(res._getStatusCode()).toBe(405);
      expect(res._getJSONData()).toEqual({
        error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET or POST is expected.",
        },
      });
    }
  });
});
