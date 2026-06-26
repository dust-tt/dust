import { extractMetadataFromTools } from "@app/lib/actions/mcp_metadata";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
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
