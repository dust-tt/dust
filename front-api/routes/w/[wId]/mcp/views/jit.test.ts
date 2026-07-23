import type { MCPServerViewType } from "@app/lib/api/mcp";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { honoApp } from "@front-api/app";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { describe, expect, it } from "vitest";

const DUST_DATA_SOURCE_MIME = "application/vnd.dust.tool-input.data-source";

// A tool input schema with a Dust configurable input on a required path: attaching such a
// tool in a conversation is not possible, the view must be excluded from JIT responses.
const requiredDustInputSchema: JSONSchema = {
  type: "object",
  properties: {
    dataSources: {
      type: "object",
      properties: {
        uri: { type: "string" },
        mimeType: { const: DUST_DATA_SOURCE_MIME },
      },
      required: ["uri", "mimeType"],
    },
  },
  required: ["dataSources"],
};

const plainInputSchema: JSONSchema = {
  type: "object",
  properties: { query: { type: "string" } },
  required: ["query"],
};

async function setup() {
  const { workspace, globalSpace } = await createPrivateApiMockRequest({
    role: "user",
  });

  const plainServer = await RemoteMCPServerFactory.create(workspace, {
    name: "Plain Server",
    url: "https://plain-server.example.com",
    tools: [
      {
        name: "search",
        description: "Search things",
        inputSchema: plainInputSchema,
      },
    ],
  });
  await MCPServerViewFactory.create(workspace, plainServer.sId, globalSpace);

  const configurableServer = await RemoteMCPServerFactory.create(workspace, {
    name: "Configurable Server",
    url: "https://configurable-server.example.com",
    tools: [
      {
        name: "query_data_source",
        description: "Query a configured data source",
        inputSchema: requiredDustInputSchema,
      },
    ],
  });
  await MCPServerViewFactory.create(
    workspace,
    configurableServer.sId,
    globalSpace
  );

  return { workspace, globalSpace, plainServer, configurableServer };
}

describe("GET /api/w/:wId/mcp/views/jit", () => {
  it("filters out views requiring configuration and strips heavy data", async () => {
    const { workspace, globalSpace, plainServer, configurableServer } =
      await setup();

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/mcp/views/jit?spaceIds=${globalSpace.sId}`
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);

    const serverViews: MCPServerViewType[] = body.serverViews;
    const plainView = serverViews.find((v) => v.server.sId === plainServer.sId);
    const configurableView = serverViews.find(
      (v) => v.server.sId === configurableServer.sId
    );

    // The view whose tool has a required Dust configurable input is excluded.
    expect(configurableView).toBeUndefined();

    // The JIT-attachable view is returned with tool names and descriptions only.
    expect(plainView).toBeDefined();
    expect(plainView?.server.tools).toEqual([
      { name: "search", description: "Search things" },
    ]);
    expect(plainView?.server.authorization).toBeNull();
    expect(plainView?.server).not.toHaveProperty("url");
    expect(plainView?.server).not.toHaveProperty("sharedSecret");
    expect(plainView?.server).not.toHaveProperty("customHeaders");
    expect(plainView?.server).not.toHaveProperty("lastError");

    // No view in the light response carries tool input schemas.
    for (const view of serverViews) {
      for (const tool of view.server.tools) {
        expect(tool).not.toHaveProperty("inputSchema");
      }
    }
  });

  it("returns 400 without spaceIds", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "user" });

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/mcp/views/jit`
    );

    expect(response.status).toBe(400);
  });
});
