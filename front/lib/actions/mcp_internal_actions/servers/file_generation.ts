import { Readable } from "node:stream";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { UploadResult } from "convertapi";
import ConvertAPI from "convertapi";
import { extname } from "path";
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

type OutputFormatType = (typeof OUTPUT_FORMATS)[number];

function isValidOutputType(extension: string): extension is OutputFormatType {
  return OUTPUT_FORMATS.includes(extension as OutputFormatType);
}

function getContentTypeFromOutputFormat(
  outputFormat: OutputFormatType
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
    "convert_file_format",
    "Converts a file from one format to another.",
    {
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
    async ({ file_name, file_id_or_url, source_format, output_format }) => {
      if (!process.env.CONVERTAPI_API_KEY) {
        return makeMCPToolTextError("Missing environment variable.");
      }

      const contentType = getContentTypeFromOutputFormat(output_format);

      const convertapi = new ConvertAPI(process.env.CONVERTAPI_API_KEY);
      let url: string | UploadResult = file_id_or_url;

      if (!validateUrl(file_id_or_url).valid) {
        const r = getResourceNameAndIdFromSId(file_id_or_url);

        if (r && r.resourceName === "file") {
          const { resourceModelId } = r;

          const file = await FileResource.fetchByModelIdWithAuth(
            auth,
            resourceModelId
          );
          if (!file) {
            return makeMCPToolTextError(`File not found: ${file_id_or_url}`);
          }

          url = await convertapi.upload(
            file.getReadStream({ auth, version: "original" }),
            `${file_name}.${source_format}`
          );
        } else {
          url = await convertapi.upload(
            Readable.from(file_id_or_url),
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
            text: "Your file was generated successfully.",
          },
        }));

        return {
          isError: false,
          content,
        };
      } catch (e) {
        return makeMCPToolTextError(
          `There was an error generating your file: ${normalizeError(e)}. ` +
            "You may be able to get the desired result by chaining multiple conversions, look closely to the source format you use."
        );
      }
    }
  );

  server.tool(
    "generate_file",
    "Generate a file with some content.",
    {
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
    },
    async ({ file_name, file_content }) => {
      if (!process.env.CONVERTAPI_API_KEY) {
        return makeMCPToolTextError("Missing environment variable.");
      }

      // Remove the leading dot.
      const extension = extname(file_name).replace(/^\./, "");
      if (!isValidOutputType(extension)) {
        return {
          isError: false,
          content: [
            {
              type: "text",
              text: `The format ${extension} is not supported.`,
            },
          ],
        };
      }

      const contentType = getContentTypeFromOutputFormat(extension);

      return {
        isError: false,
        content: [
          {
            type: "resource" as const,
            // We return a base64 blob, it will be uploaded in MCPConfigurationServerRunner.run.
            resource: {
              name: file_name,
              blob: Buffer.from(file_content).toString("base64"),
              text: "Your file was generated successfully.",
              mimeType: contentType,
              uri: "",
            },
          },
        ],
      };
    }
  );

  return server;
};

export default createServer;
