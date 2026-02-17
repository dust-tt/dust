import { basename, extname } from "node:path";
import { Readable } from "node:stream";
import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  getContentTypeFromOutputFormat,
  isBinaryFormat,
  isValidOutputType,
} from "@app/lib/api/actions/servers/file_generation/helpers";
import {
  FILE_GENERATION_TOOLS_METADATA,
  OUTPUT_FORMATS,
} from "@app/lib/api/actions/servers/file_generation/metadata";
import { FileResource } from "@app/lib/resources/file_resource";
import { getResourceNameAndIdFromSId } from "@app/lib/resources/string_ids";
import { cacheWithRedis } from "@app/lib/utils/cache";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { validateUrl } from "@app/types/shared/utils/url_utils";
import type { UploadResult } from "convertapi";
import ConvertAPI from "convertapi";
import { marked } from "marked";

const handlers: ToolHandlers<typeof FILE_GENERATION_TOOLS_METADATA> = {
  get_supported_source_formats_for_output_format: async ({ output_format }) => {
    const formats = await cacheWithRedis(
      async () => {
        // eslint-disable-next-line no-restricted-globals
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
        type: "text" as const,
        text:
          "Here are the formats you can use to convert to " +
          output_format +
          ": " +
          // The output format is included because it's always possible to convert to it.
          [...formats, output_format].join(", "),
      },
    ]);
  },

  convert_file_format: async (
    { file_name, file_id_or_url, source_format, output_format },
    { auth }
  ) => {
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
  },

  generate_file: async ({
    file_name,
    file_content,
    source_format = "text",
  }) => {
    if (!process.env.CONVERTAPI_API_KEY) {
      return new Err(new MCPError("Missing environment variable."));
    }

    const fileNameWithoutExtension = basename(file_name);
    // Remove the leading dot from the extension.
    const extension = extname(file_name).replace(/^\./, "");
    if (!isValidOutputType(extension)) {
      return new Ok([
        {
          type: "text" as const,
          text: `The format ${extension} is not supported. Supported formats are: ${OUTPUT_FORMATS.join(", ")}`,
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
          // eslint-disable-next-line no-restricted-globals
          const response = await fetch(file.url);
          const buffer = await response.arrayBuffer();
          const base64 = Buffer.from(buffer).toString("base64");

          return new Ok([
            {
              type: "resource" as const,
              resource: {
                name: file_name,
                blob: base64,
                _meta: { text: "Your file was generated successfully." },
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
    // We return a base64 blob, it will be uploaded in MCPConfigurationServerRunner.run.
    return new Ok([
      {
        type: "resource" as const,
        resource: {
          name: file_name,
          blob: Buffer.from(file_content).toString("base64"),
          _meta: { text: "Your file was generated successfully." },
          mimeType: getContentTypeFromOutputFormat(extension),
          uri: fileNameWithoutExtension,
        },
      },
    ]);
  },
};

export const TOOLS = buildTools(FILE_GENERATION_TOOLS_METADATA, handlers);
