import type { AnyTool } from "../tools/types";
import { z } from "zod";

/**
 * Converts a Zod schema to a readable description string
 * @param schema The Zod schema to describe
 * @param indent Indentation level for nested schemas
 * @returns A human-readable description of the schema
 */
function describeZodType(schema: z.ZodTypeAny, indent = ""): string {
  if (schema instanceof z.ZodArray) {
    return `list of ${describeZodType(schema.element, indent + "  ")}`;
  } else if (schema instanceof z.ZodObject) {
    let desc = "dictionary with keys:\n";
    for (const [fieldName, fieldSchema] of Object.entries(schema.shape)) {
      desc += `${indent}  * ${fieldName}: ${describeZodType(
        fieldSchema as z.ZodType,
        indent + "  "
      )
        .split("\n")
        .join("\n" + indent)}\n`;
    }
    return desc;
  } else if (schema instanceof z.ZodUnion && schema.options.length === 2) {
    // Check if this is a ToolOutput schema
    const successCase = schema.options.find(
      (opt: z.ZodTypeAny) =>
        opt instanceof z.ZodObject && 
        'type' in opt.shape && 
        opt.shape.type instanceof z.ZodLiteral && 
        opt.shape.type.value === "success"
    ) as z.ZodObject<{ type: z.ZodLiteral<"success">; result: z.ZodTypeAny }> | undefined;

    if (successCase?.shape.result) {
      return describeZodType(successCase.shape.result, indent);
    }
    // If we can't handle this union type, just describe it as a union
    return `union of ${schema.options
      .map((opt: z.ZodType) => describeZodType(opt, indent + "  "))
      .join(" | ")}`;
  } else {
    return (
      schema.description ||
      schema.constructor.name.replace("Zod", "").toLowerCase() ||
      "any"
    );
  }
}

/**
 * Generates documentation for tools that can be used in Python code
 * @param tools Dictionary of tools to document
 * @returns A string containing documentation for all tools
 */
export function generateToolDocs(tools: Record<string, AnyTool>): string {
  let docs =
    "Note: \n" +
    "- All functions listed may return None if they fail (check for None before accessing the result)\n" +
    "- All functions listed here are asynchronous and must be always be awaited, even if they don't return anything or you don't care about the result.\n";
  
  for (const [fnName, { description, input, output }] of Object.entries(tools)) {
    // Check that input is an object schema
    if (!(input instanceof z.ZodObject)) {
      continue;
    }
    
    // Function signature with description
    const paramNames = Object.keys(input.shape);
    docs += `- ${fnName}(${paramNames.join(", ")}): ${description}\n`;

    // Input parameters
    docs += "  Parameters:\n";
    for (const [paramName, paramSchema] of Object.entries(input.shape)) {
      docs += `  * ${paramName}: ${describeZodType(paramSchema as z.ZodTypeAny, "  ")}\n`;
    }

    // Output fields
    docs += "  Returns:\n";
    docs += describeZodType(output, "  ");
  }

  return docs;
}
