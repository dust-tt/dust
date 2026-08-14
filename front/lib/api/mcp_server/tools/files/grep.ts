import { GREP_MATCHES_MAX } from "@app/lib/api/actions/servers/files/metadata";
import {
  collectGrepMatches,
  compileGrepPattern,
} from "@app/lib/api/actions/servers/files/tools/grep_regex";
import { isReadableAsText } from "@app/lib/api/actions/servers/files/tools/utils";
import { registerDustMcpTool } from "@app/lib/api/mcp_server/tools/register";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
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
  registerDustMcpTool(
    server,
    "files_grep",
    {
      description:
        "Search a text file for lines matching a regular expression. " +
        `Results are capped at ${GREP_MATCHES_MAX} matches. Use \`files_cat\` with a line offset to read surrounding context. ` +
        "Requires an explicit scope with conversation_id or pod_id.",
      inputSchema,
    },
    async (auth, { scope, path, pattern }) => {
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

      const regexResult = compileGrepPattern(pattern);
      if (regexResult.isErr()) {
        return mcpError(
          `Unsupported or invalid regular expression. Error: ${regexResult.error.message}`
        );
      }
      const regex = regexResult.value;

      const readResult = await dustFs.read(path);
      if (readResult.isErr()) {
        return mcpError(readResult.error.message);
      }
      if (readResult.value === null) {
        return mcpError(`File not found: \`${path}\`.`);
      }

      const grepResult = await collectGrepMatches(readResult.value, regex, {
        formatMatch: (line, lineNumber) => `${lineNumber}: ${line}`,
        maxMatches: GREP_MATCHES_MAX,
      });
      if (grepResult.isErr()) {
        return mcpError(
          `Failed to search file \`${path}\`: ${grepResult.error.message}`
        );
      }

      const { matches, capped } = grepResult.value;

      if (matches.length === 0) {
        return mcpJsonResponse({
          text: `No lines matched the pattern in \`${path}\`.`,
        });
      }

      let text = matches.join("\n");
      if (capped) {
        text += `\n\n[Showing ${matches.length} matching line${matches.length === 1 ? "" : "s"} within the output limit. Refine your pattern or use \`files_cat\` with a line offset to read a specific section.]`;
      } else {
        text += `\n\n[${matches.length} match${matches.length === 1 ? "" : "es"} found]`;
      }

      return mcpJsonResponse({ text });
    }
  );
}
