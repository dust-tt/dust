import { basename } from "node:path";
import { Readable } from "node:stream";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AxiosError } from "axios";
import type { UploadResult } from "convertapi";
import ConvertAPI from "convertapi";
import { marked } from "marked";
import { extname } from "path";
import { z } from "zod";

import { MCPError } from "@app/lib/actions/mcp_errors";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import type { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import { getResourceNameAndIdFromSId } from "@app/lib/resources/string_ids";
import { cacheWithRedis } from "@app/lib/utils/cache";
import type { SupportedFileContentType } from "@app/types";
import { assertNever, Err, normalizeError, Ok, validateUrl } from "@app/types";

const OUTPUT_FORMATS = [
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
type OutputFormatType = (typeof OUTPUT_FORMATS)[number];

const BINARY_FORMATS: OutputFormatType[] = [
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

function isValidOutputType(extension: string): extension is OutputFormatType {
  return OUTPUT_FORMATS.includes(extension as OutputFormatType);
}

function isBinaryFormat(extension: string): extension is OutputFormatType {
  return BINARY_FORMATS.includes(extension as OutputFormatType);
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

const createServer = (
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer => {
  const server = makeInternalMCPServer("file_generation");
  server.tool(
    "get_supported_source_formats_for_output_format",
    "Get a list of source formats supported for a target output format.",
    {
      output_format: z.enum(OUTPUT_FORMATS).describe("The format to check."),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: "file_generation",
        agentLoopContext,
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
          {
            ttlMs: 60 * 60 * 24 * 1000,
          }
        )();

        return new Ok([
          {
            type: "text",
            text:
              "Here are the formats you can use to convert to " +
              output_format +
              ": " +
              // The output format is included because it's always possible to convert to it.
              [...formats, output_format].join(", "),
          },
        ]);
      }
    )
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
    withToolLogging(
      auth,
      { toolNameForMonitoring: "file_generation", agentLoopContext },
      async ({ file_name, file_id_or_url, source_format, output_format }) => {
        if (!process.env.CONVERTAPI_API_KEY) {
          return new Err(new MCPError("Missing environment variable."));
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
              return new Err(
                new MCPError(`File not found: ${file_id_or_url}`, {
                  tracked: false,
                })
              );
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

          return new Ok(content);
        } catch (e) {
          const error = normalizeError(e);
          return new Err(
            new MCPError(
              `There was an error generating your file: ${error}. ` +
                "You may be able to get the desired result by chaining multiple conversions, look closely to the source format you use.",
              {
                tracked: !error.message.includes("Unsupported conversion"),
              }
            )
          );
        }
      }
    )
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
      source_format: z
        .enum(["text", "markdown", "html"])
        .optional()
        .default("text")
        .describe(
          "The format of the input content. Use 'markdown' for markdown-formatted text, 'html' for HTML content, or 'text' for plain text (default)."
        ),
    },
    withToolLogging(
      auth,
      { toolNameForMonitoring: "file_generation", agentLoopContext },
      async ({ file_name, file_content, source_format = "text" }) => {
        if (!process.env.CONVERTAPI_API_KEY) {
          return new Err(new MCPError("Missing environment variable."));
        }

        const fileNameWithoutExtension = basename(file_name);
        // Remove the leading dot from the extension.
        const extension = extname(file_name).replace(/^\./, "");
        if (!isValidOutputType(extension)) {
          return new Ok([
            {
              type: "text",
              text: `The format ${extension} is not supported.`,
            },
          ]);
        }

        // If the format requires conversion and we have plain text content,
        // we need to convert it to HTML first.
        if (
          isBinaryFormat(extension) &&
          !validateUrl(file_content).valid &&
          !getResourceNameAndIdFromSId(file_content)
        ) {
          const convertapi = new ConvertAPI(process.env.CONVERTAPI_API_KEY);

          try {
            let htmlContent: string;

            // Convert content to HTML based on source format
            switch (source_format) {
              case "markdown": {
                // Parse markdown to HTML
                const parsedMarkdown = await marked.parse(file_content);
                htmlContent = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
body { font-family: Arial, sans-serif; line-height: 1.6; margin: 20px; }
h1, h2, h3, h4, h5, h6 { margin-top: 1em; margin-bottom: 0.5em; }
p { margin-bottom: 10px; }
code { background-color: #f4f4f4; padding: 2px 4px; border-radius: 3px; font-family: monospace; }
pre { background-color: #f4f4f4; padding: 10px; border-radius: 5px; overflow-x: auto; }
pre code { padding: 0; }
blockquote { border-left: 4px solid #ddd; padding-left: 1em; margin-left: 0; color: #666; }
ul, ol { margin-bottom: 10px; }
li { margin-bottom: 5px; }
strong { font-weight: bold; }
em { font-style: italic; }
a { color: #0066cc; text-decoration: none; }
a:hover { text-decoration: underline; }
</style>
</head>
<body>
${parsedMarkdown}
</body>
</html>`;
                break;
              }

              case "html": {
                // If already HTML, ensure it has proper structure
                if (
                  file_content.includes("<html") &&
                  file_content.includes("<body")
                ) {
                  htmlContent = file_content;
                } else {
                  // Wrap partial HTML in document structure
                  htmlContent = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
body { font-family: Arial, sans-serif; line-height: 1.6; margin: 20px; }
</style>
</head>
<body>
${file_content}
</body>
</html>`;
                }
                break;
              }

              case "text":
              default: {
                // Convert plain text to paragraphs
                htmlContent = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
body { font-family: Arial, sans-serif; line-height: 1.6; margin: 20px; }
p { margin-bottom: 10px; }
</style>
</head>
<body>
${file_content
  .split("\n")
  .map((line) => `<p>${line || "&nbsp;"}</p>`)
  .join("\n")}
</body>
</html>`;
                break;
              }
            }

            const uploadResult = await convertapi.upload(
              Readable.from(htmlContent),
              `${fileNameWithoutExtension}.html`
            );

            const result = await convertapi.convert(
              extension,
              {
                File: uploadResult,
              },
              "html"
            );

            if (result.files.length > 0) {
              const file = result.files[0];
              const response = await fetch(file.url);
              const buffer = await response.arrayBuffer();
              const base64 = Buffer.from(buffer).toString("base64");

              return new Ok([
                {
                  type: "resource" as const,
                  resource: {
                    name: file_name,
                    blob: base64,
                    text: "Your file was generated successfully.",
                    mimeType: getContentTypeFromOutputFormat(extension),
                    uri: fileNameWithoutExtension,
                  },
                },
              ]);
            }
          } catch (e) {
            return new Err(
              new MCPError(
                `There was an error generating your ${extension} file: ${normalizeError(
                  e
                )}. ` +
                  `For complex conversions, consider using the convert_file_format tool instead.`
              )
            );
          }
        }

        // Basic case: we have a text-based format and we can generate the file directly.
        return new Ok([
          {
            type: "resource" as const,
            // We return a base64 blob, it will be uploaded in MCPConfigurationServerRunner.run.
            resource: {
              name: file_name,
              blob: Buffer.from(file_content).toString("base64"),
              text: "Your file was generated successfully.",
              mimeType: getContentTypeFromOutputFormat(extension),
              uri: fileNameWithoutExtension,
            },
          },
        ]);
      }
    )
  );

  return server;
};

export default createServer;
