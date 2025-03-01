import { describe, expect, it } from "bun:test";
import { z } from "zod";
import { generateToolDocs } from "./helpers";
import { defineTool } from "../tools/helpers";
import { ToolOutput } from "../tools/types";
import type { AnyTool, Tool } from "../tools/types";

// Helper function to convert any Tool to AnyTool for testing
function asAnyTool<T extends Tool<any, any>>(tool: T): AnyTool {
  return tool as unknown as AnyTool;
}

describe("generateToolDocs", () => {
  it("should generate docs for a simple tool", () => {
    const simpleTool = defineTool(
      "A simple test function",
      z.object({
        name: z.string().describe("The name parameter"),
      }),
      z.string().describe("The return value"),
      async () => ({ type: "success", result: "test" })
    );

    const docs = generateToolDocs({ simpleTool: asAnyTool(simpleTool) });
    expect(docs).toContain(
      "All functions listed may return None if they fail (check for None before accessing the result)"
    );
    expect(docs).toContain("simpleTool(name): A simple test function");
    expect(docs).toContain("* name: The name parameter");
    expect(docs).toContain("Returns:");
    expect(docs).toContain("The return value");
  });

  it("should generate docs for a tool with complex types", () => {
    const complexTool = defineTool(
      "A complex test function",
      z.object({
        user: z
          .object({
            name: z.string().describe("User's name"),
            age: z.number().describe("User's age"),
          })
          .describe("User object"),
        options: z.array(z.string()).describe("List of options"),
      }),
      z.object({
        id: z.number().describe("User ID"),
        settings: z
          .array(
            z.object({
              key: z.string().describe("Setting key"),
              value: z.string().describe("Setting value"),
            })
          )
          .describe("User settings"),
      }),
      async () => ({ type: "success", result: { id: 1, settings: [] } })
    );

    const docs = generateToolDocs({ complexTool: asAnyTool(complexTool) });
    expect(docs).toContain(
      "complexTool(user, options): A complex test function"
    );
    expect(docs).toContain("* user: dictionary with keys:");
    expect(docs).toContain("  * name: User's name");
    expect(docs).toContain("  * age: User's age");
    expect(docs).toContain("* options: list of string");
    expect(docs).toContain("Returns:");
    expect(docs).toContain("dictionary with keys:");
    expect(docs).toContain("* id: User ID");
    expect(docs).toContain("* settings: list of dictionary with keys:");
    expect(docs).toContain("  * key: Setting key");
    expect(docs).toContain("  * value: Setting value");
  });

  it("should handle multiple tools", () => {
    const tool1 = defineTool(
      "First tool",
      z.object({ a: z.string() }),
      z.number(),
      async () => ({ type: "success", result: 1 })
    );

    const tool2 = defineTool(
      "Second tool",
      z.object({ b: z.boolean() }),
      z.string(),
      async () => ({ type: "success", result: "test" })
    );

    const docs = generateToolDocs({ 
      tool1: asAnyTool(tool1), 
      tool2: asAnyTool(tool2) 
    });
    expect(docs).toContain("tool1(a): First tool");
    expect(docs).toContain("tool2(b): Second tool");
  });

  it("should handle tools with nested output types", () => {
    const outputTool = defineTool(
      "Output test function",
      z.object({ input: z.string() }),
      z.string(),
      async () => ({ type: "success", result: "test" })
    );

    const docs = generateToolDocs({ outputTool: asAnyTool(outputTool) });
    // Should only show the success case type
    expect(docs).toContain("Returns:");
    expect(docs).toContain("string");
    // Should not show the discriminated union structure
    expect(docs).not.toContain("type:");
    expect(docs).not.toContain("result:");
  });
});
