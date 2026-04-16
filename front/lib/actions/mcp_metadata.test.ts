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
});
