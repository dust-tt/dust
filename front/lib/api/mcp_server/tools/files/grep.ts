import { GREP_MATCHES_MAX } from "@app/lib/api/actions/servers/files/metadata";
import { isReadableAsText } from "@app/lib/api/actions/servers/files/tools/utils";
import { getAuthenticatorFromMcpContext } from "@app/lib/api/mcp_server/context";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as readline from "readline";
import { z } from "zod";
import { mcpError, mcpJsonResponse } from "../response";
import { getDustFileSystemForScope, validatePathMatchesScope } from "./context";
import { FILES_SCOPE_SCHEMA } from "./schemas";

const inputSchema = {
  scope: FILES_SCOPE_SCHEMA.describe(
    "File system scope matching the path's conversation or Pod."
  ),
  path: z
    .string()
    .describe(
      "Scoped file path as returned by `files_list` (e.g. `conversation-<id>/data.csv`)."
    ),
  pattern: z
    .string()
    .describe(
      "Regular expression to search for (case-sensitive; use `(?i)` prefix for case-insensitive)."
    ),
};

export function registerFilesGrepTool(server: McpServer) {
  server.registerTool(
    "files_grep",
    {
      description:
        "Search a text file for lines matching a regular expression. " +
        `Results are capped at ${GREP_MATCHES_MAX} matches. Use \`files_cat\` with a line offset to read surrounding context. ` +
        "Requires an explicit scope with conversation_id or pod_id.",
      inputSchema,
    },
    async ({ scope, path, pattern }) => {
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

      const { contentType: mimeType } = statResult.value;

      if (!isReadableAsText(mimeType)) {
        return mcpJsonResponse({
          text:
            `\`${path}\` is not a text file (${mimeType}) ` +
            `and cannot be searched with grep.`,
        });
      }

      let regex: RegExp;
      try {
        regex = new RegExp(pattern, "m");
      } catch (err) {
        return mcpError(
          `Invalid regular expression: \`${pattern}\`. Error: ${normalizeError(err).message}`
        );
      }

      const readResult = await dustFs.read(path);
      if (readResult.isErr()) {
        return mcpError(readResult.error.message);
      }
      if (readResult.value === null) {
        return mcpError(`File not found: \`${path}\`.`);
      }

      const matches: string[] = [];
      let lineNumber = 0;
      let capped = false;

      const rl = readline.createInterface({
        input: readResult.value,
        crlfDelay: Infinity,
      });

      try {
        for await (const line of rl) {
          lineNumber++;

          if (regex.test(line)) {
            matches.push(`${lineNumber}: ${line}`);

            if (matches.length >= GREP_MATCHES_MAX) {
              capped = true;
              rl.close();
              break;
            }
          }
        }
      } catch (err) {
        return mcpError(
          `Failed to read file \`${path}\`: ${normalizeError(err).message}`
        );
      }

      if (matches.length === 0) {
        return mcpJsonResponse({
          text: `No lines matched \`${pattern}\` in \`${path}\`.`,
        });
      }

      let text = matches.join("\n");
      if (capped) {
        text += `\n\n[Showing first ${GREP_MATCHES_MAX} matches. Refine your pattern or use \`files_cat\` with a line offset to read a specific section.]`;
      } else {
        text += `\n\n[${matches.length} match${matches.length === 1 ? "" : "es"} found]`;
      }

      return mcpJsonResponse({ text });
    }
  );
}
