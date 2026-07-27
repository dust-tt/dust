import type { MCPServerViewType } from "@app/lib/api/mcp";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { honoApp } from "@front-api/app";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { describe, expect, it } from "vitest";

const plainInputSchema: JSONSchema = {
  type: "object",
  properties: { query: { type: "string" } },
  required: ["query"],
};

describe("GET /api/w/:wId/mcp/views", () => {
  it("returns views with the full serialization", async () => {
    const { workspace, globalSpace } = await createPrivateApiMockRequest({
      role: "user",
    });

    const server = await RemoteMCPServerFactory.create(workspace, {
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
    await MCPServerViewFactory.create(workspace, server.sId, globalSpace);

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/mcp/views?spaceIds=${globalSpace.sId}` +
        `&availabilities=manual,auto`
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);

    const serverViews: MCPServerViewType[] = body.serverViews;
    const serverView = serverViews.find((v) => v.server.sId === server.sId);

    expect(serverView).toBeDefined();

    // Full serialization: tool input schemas and remote server specifics are present.
    expect(serverView?.server.tools[0].inputSchema).toEqual(plainInputSchema);
    expect(serverView?.server).toHaveProperty("url");
    expect(serverView?.server).toHaveProperty("sharedSecret");
  });
});
