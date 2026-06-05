import { FILE_OFFLOAD_TEXT_SIZE_BYTES } from "@app/lib/actions/action_output_limits";
import {
  CAT_LINES_DEFAULT,
  CAT_LINES_MAX,
} from "@app/lib/api/actions/servers/files/metadata";
import { isReadableAsText } from "@app/lib/api/actions/servers/files/tools/utils";
import { getAuthenticatorFromMcpContext } from "@app/lib/api/mcp_server/context";
import { isLLMVisionSupportedImageContentType } from "@app/types/files";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as readline from "readline";
import type { Readable } from "stream";
import { z } from "zod";
import { mcpError, mcpJsonResponse } from "../response";
import { getDustFileSystemForScope, validatePathMatchesScope } from "./context";
import { FILES_SCOPE_SCHEMA } from "./schemas";

const CAT_IMAGE_MAX_BYTES = 2 * 1024 * 1024;

const inputSchema = {
  scope: FILES_SCOPE_SCHEMA.describe(
    "File system scope matching the path's conversation or Pod."
  ),
  path: z
    .string()
    .describe(
      "Scoped file path as returned by `files_list` (e.g. `conversation-<id>/data.csv` or `pod-<id>/notes.md`)."
    ),
  offset: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("Line number to start reading from (1-indexed, default 1)."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(CAT_LINES_MAX)
    .optional()
    .describe(
      `Maximum number of lines to return (default ${CAT_LINES_DEFAULT}, max ${CAT_LINES_MAX}).`
    ),
};

async function readTextFilePage(
  stream: Readable,
  path: string,
  startLine: number,
  maxLines: number,
  fileSizeBytes: number
): Promise<string> {
  const lines: string[] = [];
  let lineNumber = 0;
  let byteCount = 0;
  let byteCapped = false;
  let totalLines = 0;

  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  try {
    for await (const line of rl) {
      lineNumber++;

      if (lineNumber < startLine) {
        continue;
      }

      totalLines++;

      const lineWithNumber = `${lineNumber}: ${line}`;
      const lineBytes = Buffer.byteLength(lineWithNumber + "\n", "utf8");

      if (byteCount + lineBytes > FILE_OFFLOAD_TEXT_SIZE_BYTES) {
        if (lines.length === 0) {
          const truncated = Buffer.from(lineWithNumber, "utf8")
            .slice(0, FILE_OFFLOAD_TEXT_SIZE_BYTES)
            .toString("utf8");
          lines.push(truncated);
        }
        byteCapped = true;
        break;
      }

      lines.push(lineWithNumber);
      byteCount += lineBytes;

      if (totalLines >= maxLines) {
        break;
      }
    }
  } finally {
    rl.close();
  }

  if (lines.length === 0) {
    if (startLine > 1) {
      return `No lines found at offset ${startLine} in \`${path}\`.`;
    }
    return `\`${path}\` is empty.`;
  }

  const endLine = startLine + lines.length - 1;
  let text = lines.join("\n");

  const kb = FILE_OFFLOAD_TEXT_SIZE_BYTES / 1024;
  const fileSizeKb = Math.ceil(fileSizeBytes / 1024);

  if (byteCapped) {
    text +=
      `\n\n[Truncated at ${kb}KB. File is ${fileSizeKb}KB.` +
      ` Showing lines ${startLine}-${endLine}.` +
      ` Use offset=${endLine + 1} to read more.]`;
  } else if (totalLines >= maxLines) {
    text += `\n\n[Showing lines ${startLine}-${endLine}. Use offset=${endLine + 1} to read more.]`;
  }

  return text;
}

export function registerFilesCatTool(server: McpServer) {
  server.registerTool(
    "files_cat",
    {
      description:
        "Read the content of a file. For text files, returns numbered lines. Use `offset` and `limit` to paginate. " +
        "For binary sources, prefer the `*.processed.<ext>` sibling from `files_list`. " +
        "Requires an explicit scope with conversation_id or pod_id.",
      inputSchema,
    },
    async ({ scope, path, offset, limit }) => {
      const auth = getAuthenticatorFromMcpContext();

      const pathError = validatePathMatchesScope(path, scope);
      if (pathError) {
        return mcpError(pathError);
      }

      const fsResult = await getDustFileSystemForScope(auth, scope);
      if (fsResult.isErr()) {
        return mcpError(fsResult.error);
      }
      const dustFs = fsResult.value;

      const statResult = await dustFs.stat(path);
      if (statResult.isErr()) {
        return mcpError(statResult.error.message);
      }
      if (statResult.value === null) {
        return mcpError(`File not found: \`${path}\`.`);
      }

      const { contentType: mimeType, sizeBytes } = statResult.value;

      if (isLLMVisionSupportedImageContentType(mimeType)) {
        if (sizeBytes > CAT_IMAGE_MAX_BYTES) {
          return mcpJsonResponse({
            text:
              `\`${path}\` is an image (${Math.ceil(sizeBytes / 1024)} KB) ` +
              `that exceeds the ${CAT_IMAGE_MAX_BYTES / 1024} KB limit and cannot be displayed via MCP.`,
          });
        }
        return mcpJsonResponse({
          text: `\`${path}\` is an image (${mimeType}, ${Math.ceil(sizeBytes / 1024)} KB). Image binary content is not returned via MCP.`,
          path,
          mimeType,
        });
      }

      if (!isReadableAsText(mimeType)) {
        return mcpJsonResponse({
          text: `\`${path}\` is a binary file (${mimeType}) and cannot be read as text.`,
        });
      }

      const readResult = await dustFs.read(path);
      if (readResult.isErr()) {
        return mcpError(readResult.error.message);
      }
      if (readResult.value === null) {
        return mcpError(`File not found: \`${path}\`.`);
      }

      try {
        const text = await readTextFilePage(
          readResult.value,
          path,
          offset ?? 1,
          limit ?? CAT_LINES_DEFAULT,
          sizeBytes
        );
        return mcpJsonResponse({ text });
      } catch (err) {
        return mcpError(
          `Failed to read file \`${path}\`: ${normalizeError(err).message}`
        );
      }
    }
  );
}
