import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { z } from "zod";

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

export const FILE_GENERATION_TOOLS_METADATA = [
  {
    name: "get_supported_source_formats_for_output_format",
    description:
      "List which input source formats can be converted into a given target output format.",
    schema: {
      output_format: z.enum(OUTPUT_FORMATS).describe("The format to check."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Listing supported formats",
      done: "List supported formats",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  {
    name: "convert_file_format",
    description:
      "Convert an existing Dust file into another format, for example turn a document into a PDF.",
    schema: {
      file_name: z
        .string()
        .describe(
          "The name of the file to generate. Must be a valid filename without the format extension."
        ),
      file_id_or_url: z
        .string()
        .describe(
          "The URL or Dust file to convert. In an agent conversation, provide a scoped file path or legacy file sId. In a pod function, provide the file path in the pod sandbox (e.g. '/files/pod-<id>/report.pdf' or 'pod-<id>/report.pdf'). If the file is already in the desired format, no conversion is needed."
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
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  {
    name: "generate_file",
    description:
      "Generate a new file by writing provided text or content out as a document.",
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
    toolCostCategory: "advanced",
    freeUsage: false,
  },
] as const;

export const FILE_GENERATION_SERVER = {
  serverInfo: {
    name: "file_generation" as const,
    version: "1.0.0",
    description: "Generate and convert documents.",
    authorization: null,
    icon: "ActionDocumentTextIcon" as const,
    documentationUrl: null,
  },
  tools: FILE_GENERATION_TOOLS_METADATA,
} as const satisfies ServerMetadata;
