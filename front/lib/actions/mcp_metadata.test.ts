import { MCP_LIST_TOOLS_MAX_PAGES } from "@app/lib/actions/constants";
import {
  extractMetadataFromTools,
  listAllMCPTools,
} from "@app/lib/actions/mcp_metadata";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it } from "vitest";

describe("extractMetadataFromTools", () => {
  it("passes through schemas with $ref unchanged", () => {
    const tools: Tool[] = [
      {
        name: "createNote",
        description: "Create a note",
        inputSchema: {
          type: "object",
          properties: {
            input: { $ref: "#/definitions/CreateNoteInput" },
          },
          required: ["input"],
          definitions: {
            CreateNoteInput: {
              type: "object",
              properties: {
                customerId: { type: "string" },
                text: { type: "string" },
              },
              required: ["customerId", "text"],
            },
          },
        },
      },
    ];

    const result = extractMetadataFromTools(tools);
    expect(result[0].inputSchema).toEqual(tools[0].inputSchema);
  });

  it("surfaces the eager flag from _meta.dust when set", () => {
    const tools: Tool[] = [
      {
        name: "eagerTool",
        description: "An eager tool",
        inputSchema: { type: "object", properties: {} },
        _meta: { dust: { eager: true } },
      },
    ];

    const result = extractMetadataFromTools(tools);
    expect(result[0].eager).toBe(true);
  });

  it("omits the eager flag when _meta.dust does not set it", () => {
    const tools: Tool[] = [
      {
        name: "plainTool",
        description: "A plain tool",
        inputSchema: { type: "object", properties: {} },
        _meta: { dust: { stake: "never_ask" } },
      },
      {
        name: "noMetaTool",
        description: "A tool without dust meta",
        inputSchema: { type: "object", properties: {} },
      },
    ];

    const result = extractMetadataFromTools(tools);
    expect(result[0].eager).toBeUndefined();
    expect(result[1].eager).toBeUndefined();
  });
});

// Connects a client to an in-memory server whose `tools/list` handler returns one tool per page.
// `nextCursorFor` maps the received cursor to the cursor to return (undefined ends the listing).
async function connectPaginatedServer(
  nextCursorFor: (cursor: string | undefined) => string | undefined
) {
  const receivedCursors: (string | undefined)[] = [];
  const server = new Server(
    { name: "paginated", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );
  server.setRequestHandler(ListToolsRequestSchema, (request) => {
    const cursor = request.params?.cursor;
    receivedCursors.push(cursor);
    const nextCursor = nextCursorFor(cursor);
    return {
      tools: [
        { name: `tool_${cursor ?? "first"}`, inputSchema: { type: "object" } },
      ],
      ...(nextCursor ? { nextCursor } : {}),
    };
  });

  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(clientTransport);

  return { client, receivedCursors };
}

describe("listAllMCPTools", () => {
  it("follows nextCursor and returns every page in order", async () => {
    const pages: Record<string, string | undefined> = {
      first: "page2",
      page2: "page3",
      page3: undefined,
    };
    const { client, receivedCursors } = await connectPaginatedServer(
      (cursor) => pages[cursor ?? "first"]
    );

    const result = await listAllMCPTools(client);

    expect(result.isOk()).toBe(true);
    expect(result.isOk() && result.value.map((t) => t.name)).toEqual([
      "tool_first",
      "tool_page2",
      "tool_page3",
    ]);
    expect(receivedCursors).toEqual([undefined, "page2", "page3"]);
  });

  it("returns an error when the server repeats the cursor it was sent", async () => {
    const { client, receivedCursors } = await connectPaginatedServer(
      () => "stuck"
    );

    const result = await listAllMCPTools(client);

    expect(result.isErr()).toBe(true);
    expect(receivedCursors).toEqual([undefined, "stuck"]);
  });

  it("returns an error after MCP_LIST_TOOLS_MAX_PAGES pages", async () => {
    const { client, receivedCursors } = await connectPaginatedServer(
      (cursor) => `${cursor ?? ""}x`
    );

    const result = await listAllMCPTools(client);

    expect(result.isErr()).toBe(true);
    expect(receivedCursors).toHaveLength(MCP_LIST_TOOLS_MAX_PAGES);
  });
});
