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
import { isReadableAsText } from "@app/lib/api/actions/servers/files/tools/utils";
import { DustFileSystem } from "@app/lib/api/file_system";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import * as readline from "readline";

export async function grepHandler(
  { path, pattern }: { path: string; pattern: string },
  { auth, agentLoopContext }: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  const conversation = agentLoopContext?.runContext?.conversation;
  if (!conversation) {
    return new Err(
      new MCPError("No conversation context available.", { tracked: false })
    );
  }

  const fsResult = await DustFileSystem.forConversation(auth, conversation);
  if (fsResult.isErr()) {
    return new Err(
      new MCPError(fsResult.error.message, { tracked: false })
    );
  }
  const fs = fsResult.value;

  const statResult = await fs.stat(path);
  if (statResult.isErr()) {
    const err = statResult.error;
    if (err.code === "legacy_path") {
      return new Err(new MCPError(err.message, { tracked: false }));
    }
    return new Err(new MCPError(err.message, { tracked: false }));
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

  const readResult = await fs.read(path);
  if (readResult.isErr()) {
    return new Err(new MCPError(readResult.error.message, { tracked: false }));
  }
  if (readResult.value === null) {
    return new Err(
      new MCPError(`File not found: \`${path}\`.`, { tracked: false })
    );
  }

  const matches: string[] = [];
  let lineNumber = 0;
  let capped = false;

  // readResult.value is a Readable stream readline will stop early once we hit GREP_MATCHES_MAX.
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
    return new Err(
      new MCPError(
        `Failed to read file \`${path}\`: ${normalizeError(err).message}`
      )
    );
  }

  if (matches.length === 0) {
    return new Ok([
      {
        type: "text",
        text: `No lines matched \`${pattern}\` in \`${path}\`.`,
      },
    ]);
  }

  let text = matches.join("\n");
  if (capped) {
    text += `\n\n[Showing first ${GREP_MATCHES_MAX} matches. Refine your pattern or use \`${getPrefixedToolName(FILES_SERVER_NAME, FILES_CAT_ACTION_NAME)}\` with a line offset to read a specific section.]`;
  } else {
    text += `\n\n[${matches.length} match${matches.length === 1 ? "" : "es"} found]`;
  }

  return new Ok([{ type: "text", text }]);
}
