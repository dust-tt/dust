import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const FILE_GENERATION_TOOL_NAME = "file_generation" as const;

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

export type OutputFormatType = (typeof OUTPUT_FORMATS)[number];

export const BINARY_FORMATS: OutputFormatType[] = [
  "docx",
  "pdf",
  "pptx",
  "xls",
  "xlsx",
  "gif",
  "jpg",
  "png",
  "webp",
];

export const FILE_GENERATION_TOOLS_METADATA = createToolsRecord({
  get_supported_source_formats_for_output_format: {
    description:
      "Get a list of source formats supported for a target output format.",
    schema: {
      output_format: z.enum(OUTPUT_FORMATS).describe("The format to check."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Listing supported formats",
      done: "List supported formats",
    },
  },
  convert_file_format: {
    description: "Converts a file from one format to another.",
    schema: {
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
    },
    stake: "never_ask",
    displayLabels: {
      running: "Converting file",
      done: "Convert file",
    },
  },
  generate_file: {
    description: "Generate a file with some content.",
    schema: {
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
    },
    stake: "never_ask",
    displayLabels: {
      running: "Generating file",
      done: "Generate file",
    },
  },
});

export const FILE_GENERATION_SERVER = {
  serverInfo: {
    name: "file_generation" as const,
    version: "1.0.0",
    description: "Generate and convert documents.",
    authorization: null,
    icon: "ActionDocumentTextIcon" as const,
    documentationUrl: null,
    instructions: null,
  },
  tools: Object.values(FILE_GENERATION_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(FILE_GENERATION_TOOLS_METADATA).map((t) => [t.name, t.stake])
  ),
} as const satisfies ServerMetadata;
