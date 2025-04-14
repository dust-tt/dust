import { Readable } from "node:stream";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { UploadResult } from "convertapi";
import ConvertAPI from "convertapi";
import { z } from "zod";

import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";
import { cacheWithRedis } from "@app/lib/utils/cache";
import type { SupportedFileContentType } from "@app/types";
import { assertNever, normalizeError, validateUrl } from "@app/types";

const serverInfo: InternalMCPServerDefinitionType = {
  name: "file_generator",
  version: "1.0.0",
  description: "Generate and convert files on demand.",
  authorization: null,
  visual: "ActionFolderAddIcon",
};

const OUTPUT_FORMATS = [
  "csv",
  "doc",
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

const createServer = (): McpServer => {
  const server = new McpServer(serverInfo);
  server.tool(
    "get_supported_source_formats_for_output_format",
    "Get a list of source formats supported for a target output format.",
    {
      output_format: z.enum(OUTPUT_FORMATS).describe("The format to check."),
    },
    async ({ output_format }) => {
      const formats = await cacheWithRedis(
        async () => {
          const r = await fetch(
            `https://v2.convertapi.com/info/*/to/${output_format}`
          );
          const data: { SourceFileFormats: string[] }[] = await r.json();
          const formats = data.flatMap((f) => f.SourceFileFormats);
          return formats;
        },
        () => `get_source_format_to_convert_to_${output_format}`,
        60 * 60 * 24 * 1000
      )();

      return {
        isError: false,
        content: [
          {
            type: "text",
            text:
              "Here are the formats you can use to convert to " +
              output_format +
              ": " +
              // The output format is included because it's always possible to convert to it.
              [...formats, output_format].join(", "),
          },
        ],
      };
    }
  );

  server.tool(
    "generate_file",
    "Generate a file",
    {
      file_name: z
        .string()
        .describe(
          "The name of the file to generate. Must be a valid filename without the format extension."
        ),
      input: z
        .string()
        .max(64000)
        .describe(
          "The content of the file to generate. You can either provide a url to a file or the content directly."
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
    async ({ file_name, input, source_format, output_format }) => {
      if (!process.env.CONVERTAPI_API_KEY) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: "Missing environment variable.",
            },
          ],
        };
      }

      let contentType: SupportedFileContentType | null;
      switch (output_format) {
        case "md":
          contentType = "text/markdown";
          break;
        case "gif":
          contentType = "image/gif";
          break;
        case "pdf":
          contentType = "application/pdf";
          break;
        case "doc":
          contentType = "application/msword";
          break;
        case "docx":
          contentType =
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
          break;
        case "pptx":
          contentType =
            "application/vnd.openxmlformats-officedocument.presentationml.presentation";
          break;
        case "csv":
          contentType = "text/csv";
          break;
        case "txt":
          contentType = "text/plain";
          break;
        case "html":
          contentType = "text/html";
          break;
        case "jpg":
          contentType = "image/jpeg";
          break;
        case "png":
          contentType = "image/png";
          break;
        case "xml":
          contentType = "text/xml";
          break;
        case "xls":
          contentType = "application/vnd.ms-excel";
          break;
        case "xlsx":
          contentType =
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
          break;
        case "webp":
          contentType = "image/webp";
          break;

        default:
          assertNever(output_format);
      }

      const convertapi = new ConvertAPI(process.env.CONVERTAPI_API_KEY);
      let url: string | UploadResult = input;
      if (!validateUrl(input).valid) {
        url = await convertapi.upload(
          Readable.from(input),
          `${file_name}.${source_format}`
        );
      }

      try {
        const result = await convertapi.convert(
          output_format,
          {
            File: url,
          },
          source_format
        );

        const content = result.files.map((file) => ({
          type: "resource" as const,
          resource: {
            mimeType: contentType,
            uri: file.url,
            text: `Your file was generated successfully.`,
          },
        }));

        return {
          isError: false,
          content,
        };
      } catch (e) {
        return {
          isError: false,
          content: [
            {
              type: "text",
              text: `There was an error generating your file: ${normalizeError(e)}, maybe you can chain multiple conversions to get the result you want, pay attention to the source format you use.`,
            },
          ],
        };
      }
    }
  );

  return server;
};

export default createServer;
