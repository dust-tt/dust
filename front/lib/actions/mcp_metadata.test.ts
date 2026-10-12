import {
  connectWithTimeout,
  extractMetadataFromTools,
} from "@app/lib/actions/mcp_metadata";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { FetchLike } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, describe, expect, it, vi } from "vitest";

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

describe("connectWithTimeout", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects and aborts the request when the server never answers the initialized notification", async () => {
    vi.useFakeTimers();
    let initializedSignal: AbortSignal | undefined;
    const fakeServer: FetchLike = async (_url, init) => {
      const { id, method } = JSON.parse(String(init?.body));
      if (method === "initialize") {
        return Response.json({
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: "2025-06-18",
            capabilities: {},
            serverInfo: { name: "fake", version: "1.0.0" },
          },
        });
      }
      // Never answer `notifications/initialized`, until the request is aborted.
      initializedSignal = init?.signal ?? undefined;
      return new Promise((_, reject) => {
        initializedSignal?.addEventListener("abort", () =>
          reject(initializedSignal?.reason)
        );
      });
    };
    const transport = new StreamableHTTPClientTransport(
      new URL("https://mcp.example.com/mcp"),
      { fetch: fakeServer }
    );

    const connection = connectWithTimeout(
      new Client({ name: "test", version: "1.0.0" }),
      transport
    );
    const rejection = expect(connection).rejects.toThrow(
      "MCP connection timed out"
    );
    await vi.runAllTimersAsync();

    await rejection;
    expect(initializedSignal?.aborted).toBe(true);
  });
});
