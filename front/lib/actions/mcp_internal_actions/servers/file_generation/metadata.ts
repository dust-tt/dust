import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import type { MCPToolType } from "@app/lib/api/mcp";

// Tool names.
export const GET_SUPPORTED_SOURCE_FORMATS_TOOL_NAME =
  "get_supported_source_formats_for_output_format";
export const CONVERT_FILE_FORMAT_TOOL_NAME = "convert_file_format";
export const GENERATE_FILE_TOOL_NAME = "generate_file";

// Output formats supported by the file generation tools.
export const OUTPUT_FORMATS = [
  "csv",
  "docx",
  "gif",
  "html",
  "jpg",
  "md",
  "pdf",
  "png",
  "pptx",
  "txt",
  "webp",
  "xls",
  "xlsx",
  "xml",
] as const;

// =============================================================================
// Zod Schemas - Used by server file for runtime validation
// =============================================================================

export const getSupportedSourceFormatsSchema = {
  output_format: z.enum(OUTPUT_FORMATS).describe("The format to check."),
};

export const convertFileFormatSchema = {
  file_name: z
    .string()
    .describe(
      "The name of the file to generate. Must be a valid filename without the format extension."
    ),
  file_id_or_url: z
    .string()
    .describe(
      "The ID or URL of the file to convert. You can either provide the ID of a file in the conversation (note: if the file ID is already in the desired format, no conversion is needed) or the URL to a file."
    ),
  source_format: z
    .string()
    .describe(
      "The format of the source file. Use the `get_source_format_to_convert_to` tool to get the list of formats you can use."
    ),
  output_format: z
    .enum(OUTPUT_FORMATS)
    .describe("The format of the output file."),
};

export const generateFileSchema = {
  file_name: z
    .string()
    .describe(
      "The name of the file to generate. Must be a valid filename with the format extension."
    ),
  file_content: z
    .string()
    .max(64000)
    .describe(
      "The content of the file to generate. You can either provide the id of a file in the conversation (note: if the file ID is already in the desired format, no conversion is needed), the url to a file or the content directly."
    ),
  source_format: z
    .enum(["text", "markdown", "html"])
    .optional()
    .default("text")
    .describe(
      "The format of the input content. Use 'markdown' for markdown-formatted text, 'html' for HTML content, or 'text' for plain text (default)."
    ),
};

// =============================================================================
// Tool Definitions - Used by constants.ts for static metadata
// =============================================================================

export const FILE_GENERATION_TOOLS: MCPToolType[] = [
  {
    name: GET_SUPPORTED_SOURCE_FORMATS_TOOL_NAME,
    description:
      "Get a list of source formats supported for a target output format.",
    inputSchema: zodToJsonSchema(
      z.object(getSupportedSourceFormatsSchema)
    ) as JSONSchema,
  },
  {
    name: CONVERT_FILE_FORMAT_TOOL_NAME,
    description: "Converts a file from one format to another.",
    inputSchema: zodToJsonSchema(
      z.object(convertFileFormatSchema)
    ) as JSONSchema,
  },
  {
    name: GENERATE_FILE_TOOL_NAME,
    description: "Generate a file with some content.",
    inputSchema: zodToJsonSchema(z.object(generateFileSchema)) as JSONSchema,
  },
];

// =============================================================================
// Server Info - Server metadata for the constants registry
// =============================================================================

export const FILE_GENERATION_SERVER_INFO = {
  name: "file_generation" as const,
  version: "1.0.0",
  description: "Generate and convert documents.",
  authorization: null,
  icon: "ActionDocumentTextIcon" as const,
  documentationUrl: null,
  instructions: null,
};
