import {
  DEFAULT_MCP_ACTION_VERSION,
  DEFAULT_MCP_SERVER_ICON,
} from "@app/lib/actions/constants";
import { fetchRemoteServerMetaDataByServerId } from "@app/lib/actions/mcp_metadata";
import type { MCPServerType, MCPToolType } from "@app/lib/api/mcp";
import { RemoteMCPServerResource } from "@app/lib/resources/remote_mcp_servers_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import type { MembershipRoleType } from "@app/types/memberships";
import { Ok } from "@app/types/shared/result";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { describe, expect, it, vi } from "vitest";

vi.mock(import("@app/lib/actions/mcp_metadata"), async (importOriginal) => {
  const mod = await importOriginal();
  return {
    ...mod,
    fetchRemoteServerMetaDataByServerId: vi.fn(),
  };
});

import { honoApp } from "@front-api/app";

// A tool input schema with a Dust configurable input on a required path.
const requiredDustInputSchema: JSONSchema = {
  type: "object",
  properties: {
    dataSources: {
      type: "object",
      properties: {
        uri: { type: "string" },
        mimeType: { const: "application/vnd.dust.tool-input.data-source" },
      },
      required: ["uri", "mimeType"],
    },
  },
  required: ["dataSources"],
};

function metadataWithTools(tools: MCPToolType[]): Omit<MCPServerType, "sId"> {
  return {
    name: "Test Server",
    version: DEFAULT_MCP_ACTION_VERSION,
    description: "Test description",
    icon: DEFAULT_MCP_SERVER_ICON,
    authorization: null,
    tools,
    availability: "manual",
    allowMultipleInstances: true,
    documentationUrl: null,
  };
}

async function setup(role: MembershipRoleType = "admin") {
  const { workspace, auth, systemSpace } = await createPrivateApiMockRequest({
    role,
    method: "POST",
  });
  return { workspace, auth, space: systemSpace };
}

function sync(workspace: { sId: string }, serverId: string) {
  return honoApp.request(`/api/w/${workspace.sId}/mcp/${serverId}/sync`, {
    method: "POST",
  });
}

describe("POST /api/w/:wId/mcp/:serverId/sync", () => {
  it("returns 404 when server doesn't exist", async () => {
    const { workspace } = await setup("admin");

    const response = await sync(workspace, "non-existent-server-id");

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        type: "data_source_not_found",
        message: "Remote MCP Server not found",
      },
    });
  });

  it("returns 403 when user is not an admin", async () => {
    const { workspace, space } = await setup("user");
    const server = await RemoteMCPServerFactory.create(workspace, space);

    const response = await sync(workspace, server.sId);

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.type).toBe("workspace_auth_error");
    expect(body.error.message).toContain(
      "Only admin users can perform this action."
    );
  });

  it("recomputes cachedToolsRequireConfiguration when tools change", async () => {
    const { workspace, auth } = await setup("admin");
    const server = await RemoteMCPServerFactory.create(workspace, {
      tools: [
        {
          name: "search",
          description: "Search things",
          inputSchema: undefined,
        },
      ],
    });

    // Created with tools that need no configuration.
    const created = await RemoteMCPServerResource.fetchById(auth, server.sId);
    expect(created?.cachedToolsRequireConfiguration).toBe(false);

    // The remote server now exposes a tool with a required Dust configurable input.
    vi.mocked(fetchRemoteServerMetaDataByServerId).mockResolvedValueOnce(
      new Ok(
        metadataWithTools([
          {
            name: "query_data_source",
            description: "Query a configured data source",
            inputSchema: requiredDustInputSchema,
          },
        ])
      )
    );

    const response = await sync(workspace, server.sId);
    expect(response.status).toBe(200);

    const synced = await RemoteMCPServerResource.fetchById(auth, server.sId);
    expect(synced?.cachedToolsRequireConfiguration).toBe(true);

    // Syncing back to configuration-free tools flips it back.
    vi.mocked(fetchRemoteServerMetaDataByServerId).mockResolvedValueOnce(
      new Ok(
        metadataWithTools([
          {
            name: "search",
            description: "Search things",
            inputSchema: undefined,
          },
        ])
      )
    );

    const secondResponse = await sync(workspace, server.sId);
    expect(secondResponse.status).toBe(200);

    const resynced = await RemoteMCPServerResource.fetchById(auth, server.sId);
    expect(resynced?.cachedToolsRequireConfiguration).toBe(false);
  });
});
