import { Readable } from "node:stream";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { UploadResult } from "convertapi";
import ConvertAPI from "convertapi";
import { z } from "zod";

import { makeMCPToolTextError } from "@app/lib/actions/mcp_internal_actions/utils";
import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import { getResourceNameAndIdFromSId } from "@app/lib/resources/string_ids";
import { cacheWithRedis } from "@app/lib/utils/cache";
import type { SupportedFileContentType } from "@app/types";
import { assertNever, normalizeError, validateUrl } from "@app/types";

const serverInfo: InternalMCPServerDefinitionType = {
  name: "file_generation",
  version: "1.0.0",
  description: "Agent can generate and convert files.",
  authorization: null,
  icon: "ActionDocumentTextIcon",
  documentationUrl: null,
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

function getContentTypeFromOutputFormat(
  outputFormat: (typeof OUTPUT_FORMATS)[number]
): SupportedFileContentType {
  switch (outputFormat) {
    case "md":
      return "text/markdown";
    case "gif":
      return "image/gif";
    case "pdf":
      return "application/pdf";
    case "doc":
      return "application/msword";
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "pptx":
      return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    case "csv":
      return "text/csv";
    case "txt":
      return "text/plain";
    case "html":
      return "text/html";
    case "jpg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "xml":
      return "text/xml";
    case "xls":
      return "application/vnd.ms-excel";
    case "xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case "webp":
      return "image/webp";
    default:
      assertNever(outputFormat);
  }
}

const createServer = (auth: Authenticator): McpServer => {
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
    "Generate a file by converting between formats. Only use this tool when the source_format differs from the output_format. If the formats are the same, the file can be used directly.",
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
          "The content of the file to generate. You can either provide the id of a file in the conversation (note: if the file ID is already in the desired format, no conversion is needed), the url to a file or the content directly."
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
        return makeMCPToolTextError("Missing environment variable.");
      }

      let contentType: SupportedFileContentType | null =
        getContentTypeFromOutputFormat(output_format);

      const convertapi = new ConvertAPI(process.env.CONVERTAPI_API_KEY);
      let url: string | UploadResult = input;
      if (!validateUrl(input).valid) {
        const r = getResourceNameAndIdFromSId(input);
        if (r && r.resourceName === "file") {
          const { resourceModelId } = r;
          const file = await FileResource.fetchByModelIdWithAuth(
            auth,
            resourceModelId
          );
          if (file) {
            url = await convertapi.upload(
              file.getReadStream({ auth, version: "original" }),
              `${file_name}.${source_format}`
            );
          } else {
            return makeMCPToolTextError(`File not found: ${input}`);
          }
        } else {
          url = await convertapi.upload(
            Readable.from(input),
            `${file_name}.${source_format}`
          );
        }
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
        return makeMCPToolTextError(
          `There was an error generating your file: ${normalizeError(e)}, maybe you can chain multiple conversions to get the result you want, pay attention to the source format you use.`
        );
      }
    }
  );

  return server;
};

export default createServer;
