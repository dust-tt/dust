import type { Tool } from "../tools/types";
import { z } from "zod";

function describeZodType(schema: z.ZodType, indent: string = ""): string {
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
      (opt: z.ZodType) =>
        opt instanceof z.ZodObject && opt.shape.type?.value === "success"
    ) as z.ZodObject<any> | undefined;

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

export function generateToolDocs(tools: Record<string, Tool>): string {
  let docs =
    "Note: \n" +
    "- All functions listed may return None if they fail (check for None before accessing the result)\n" +
    "- All functions listed here are asynchronous and must be always be awaited, even if they don't return anything or you don't care about the result.\n";
  for (const [fnName, { description, input, output }] of Object.entries(
    tools
  )) {
    // Function signature with description
    const inputObject = input as z.ZodObject<any>;

    docs += `- ${fnName}(${Object.keys(inputObject.shape).join(
      ", "
    )}): ${description}\n`;

    // Input parameters
    docs += "  Parameters:\n";
    for (const [paramName, paramSchema] of Object.entries(inputObject.shape)) {
      docs += `  * ${paramName}: ${describeZodType(
        paramSchema as z.ZodType,
        "  "
      )}\n`;
    }

    // Output fields
    docs += "  Returns:\n";
    docs += describeZodType(output, "  ");
  }

  return docs;
}
