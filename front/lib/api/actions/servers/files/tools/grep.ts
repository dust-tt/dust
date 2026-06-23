import { FILE_OFFLOAD_TEXT_SIZE_BYTES } from "@app/lib/actions/action_output_limits";
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
import { collectGrepMatches } from "@app/lib/api/actions/servers/files/tools/grep_match";
import { isReadableAsText } from "@app/lib/api/actions/servers/files/tools/utils";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import * as readline from "readline";

export async function grepHandler(
  { path, pattern }: { path: string; pattern: string },
  { auth, agentLoopContext }: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  const conversationRes = requireAgentLoopConversation({ agentLoopContext });
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

  let regex: RegExp;
  try {
    regex = new RegExp(pattern, "m");
  } catch (err) {
    return new Err(
      new MCPError(
        `Invalid regular expression: \`${pattern}\`. Error: ${normalizeError(err).message}`,
        { tracked: false }
      )
    );
  }

  const readResult = await dustFs.read(path);
  if (readResult.isErr()) {
    return new Err(new MCPError(readResult.error.message, { tracked: false }));
  }

  if (readResult.value === null) {
    return new Err(
      new MCPError(`File not found: \`${path}\`.`, { tracked: false })
    );
  }

  // readResult.value is a Readable stream; collectGrepMatches stops early once we hit a cap.
  const rl = readline.createInterface({
    input: readResult.value,
    crlfDelay: Infinity,
  });

  let matches: string[];
  let matchCapped: boolean;
  let byteCapped: boolean;
  try {
    ({ matches, matchCapped, byteCapped } = await collectGrepMatches({
      lines: rl,
      regex,
      maxMatches: GREP_MATCHES_MAX,
      maxBytes: FILE_OFFLOAD_TEXT_SIZE_BYTES,
    }));
  } catch (err) {
    return new Err(
      new MCPError(
        `Failed to read file \`${path}\`: ${normalizeError(err).message}`
      )
    );
  } finally {
    rl.close();
  }

  if (matches.length === 0) {
    return new Ok([
      {
        type: "text",
        text: `No lines matched \`${pattern}\` in \`${path}\`.`,
      },
    ]);
  }

  const catToolName = getPrefixedToolName(
    FILES_SERVER_NAME,
    FILES_CAT_ACTION_NAME
  );
  let text = matches.join("\n");
  if (byteCapped) {
    text += `\n\n[Output truncated at ${FILE_OFFLOAD_TEXT_SIZE_BYTES / 1024} KB. Use \`${catToolName}\` with a line offset to read specific sections.]`;
  } else if (matchCapped) {
    text += `\n\n[Showing first ${GREP_MATCHES_MAX} matches. Refine your pattern or use \`${catToolName}\` with a line offset to read a specific section.]`;
  } else {
    text += `\n\n[${matches.length} match${matches.length === 1 ? "" : "es"} found]`;
  }

  return new Ok([{ type: "text", text }]);
}
