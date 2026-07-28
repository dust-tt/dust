import type { MCPServerViewType } from "@app/lib/api/mcp";
import { MCPServerViewModel } from "@app/lib/models/agent/actions/mcp_server_view";
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
    const view = await MCPServerViewFactory.create(
      workspace,
      server.sId,
      globalSpace
    );

    const url = `/api/w/${workspace.sId}/mcp/views?spaceIds=${globalSpace.sId}&availabilities=manual,auto`;
    const response = await honoApp.request(url);

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

    await MCPServerViewModel.update(
      { isRestrictedToSkills: true },
      { where: { id: view.id } }
    );

    const defaultResponse = await honoApp.request(url);
    const defaultBody = await defaultResponse.json();
    expect(
      defaultBody.serverViews.some((v: MCPServerViewType) => v.sId === view.sId)
    ).toBe(false);

    const skillBuilderResponse = await honoApp.request(
      `${url}&includeRestrictedToSkills=true`
    );
    const skillBuilderBody = await skillBuilderResponse.json();
    const skillBuilderView = skillBuilderBody.serverViews.find(
      (v: MCPServerViewType) => v.sId === view.sId
    );
    expect(skillBuilderView).toBeDefined();
    expect(skillBuilderView).not.toHaveProperty("isRestrictedToSkills");
  });
});
