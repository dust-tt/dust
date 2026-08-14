import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { getPrefixedToolName } from "@app/lib/actions/tool_name_utils";
import {
  FILES_CAT_ACTION_NAME,
  FILES_SERVER_NAME,
  GREP_MATCHES_MAX,
} from "@app/lib/api/actions/servers/files/metadata";
import {
  getDustFileSystemForAgentLoop,
  requireAgentLoopConversation,
  scopedPathsFromArgs,
} from "@app/lib/api/actions/servers/files/tools/agent_loop_fs";
import {
  collectGrepMatches,
  compileGrepPattern,
  isGrepLineTooLongError,
} from "@app/lib/api/actions/servers/files/tools/grep_regex";
import { isReadableAsText } from "@app/lib/api/actions/servers/files/tools/utils";
import { Err, Ok } from "@app/types/shared/result";

export async function grepHandler(
  { path, pattern }: { path: string; pattern: string },
  { auth, runContext }: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  const conversationRes = requireAgentLoopConversation({ runContext });
  if (conversationRes.isErr()) {
    return conversationRes;
  }

  const fsResult = await getDustFileSystemForAgentLoop(
    auth,
    conversationRes.value,
    scopedPathsFromArgs(path)
  );
  if (fsResult.isErr()) {
    return fsResult;
  }
  const dustFs = fsResult.value;

  const statResult = await dustFs.stat(path);
  if (statResult.isErr()) {
    return new Err(new MCPError(statResult.error.message, { tracked: false }));
  }

  if (statResult.value === null) {
    return new Err(
      new MCPError(`File not found: \`${path}\`.`, { tracked: false })
    );
  }

  const { contentType: mimeType } = statResult.value;

  if (!isReadableAsText(mimeType)) {
    return new Ok([
      {
        type: "text",
        text:
          `\`${path}\` is not a text file (${mimeType}) ` +
          `and cannot be searched with grep.`,
      },
    ]);
  }

  const regexResult = compileGrepPattern(pattern);
  if (regexResult.isErr()) {
    return new Err(
      new MCPError(
        `Unsupported or invalid regular expression. Error: ${regexResult.error.message}`,
        { tracked: false }
      )
    );
  }
  const regex = regexResult.value;

  const readResult = await dustFs.read(path);
  if (readResult.isErr()) {
    return new Err(new MCPError(readResult.error.message, { tracked: false }));
  }

  if (readResult.value === null) {
    return new Err(
      new MCPError(`File not found: \`${path}\`.`, { tracked: false })
    );
  }

  const grepResult = await collectGrepMatches(readResult.value, regex, {
    formatMatch: (line, lineNumber) => `${lineNumber}: ${line}`,
    maxMatches: GREP_MATCHES_MAX,
  });
  if (grepResult.isErr()) {
    return new Err(
      new MCPError(
        `Failed to search file \`${path}\`: ${grepResult.error.message}`,
        { tracked: !isGrepLineTooLongError(grepResult.error) }
      )
    );
  }

  const { matches, capped } = grepResult.value;

  if (matches.length === 0) {
    return new Ok([
      {
        type: "text",
        text: `No lines matched the pattern in \`${path}\`.`,
      },
    ]);
  }

  let text = matches.join("\n");
  if (capped) {
    text += `\n\n[Showing ${matches.length} matching line${matches.length === 1 ? "" : "s"} within the output limit. Refine your pattern or use \`${getPrefixedToolName(FILES_SERVER_NAME, FILES_CAT_ACTION_NAME)}\` with a line offset to read a specific section.]`;
  } else {
    text += `\n\n[${matches.length} match${matches.length === 1 ? "" : "es"} found]`;
  }

  return new Ok([{ type: "text", text }]);
}
