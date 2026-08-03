import { InMemoryWithAuthTransport } from "@app/lib/actions/mcp_internal_actions/in_memory_with_auth_transport";
import { createDustMcpServer } from "@app/lib/api/mcp_server/server";
import { AGENT_FACING_DESCRIPTION_MAX_LENGTH } from "@app/lib/skills/labels";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { describe, expect, it } from "vitest";

describe("Dust MCP server", () => {
  it("exposes the create_skill tool", async () => {
    const server = createDustMcpServer();
    const client = new Client({ name: "dust-mcp-test", version: "1.0.0" });
    const [clientTransport, serverTransport] =
      InMemoryWithAuthTransport.createLinkedPair();

    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const { tools } = await client.listTools();

    expect(tools).toContainEqual(
      expect.objectContaining({
        name: "create_skill",
        inputSchema: expect.objectContaining({
          properties: expect.objectContaining({
            agentFacingDescription: expect.objectContaining({
              maxLength: AGENT_FACING_DESCRIPTION_MAX_LENGTH,
            }),
          }),
        }),
      })
    );

    await client.close();
  });
});
